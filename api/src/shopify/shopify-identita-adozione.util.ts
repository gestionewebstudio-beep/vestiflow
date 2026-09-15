import type { Logger } from '@nestjs/common';
import { CatalogOrigin, ShopifyCatalogLinkKind, type Prisma } from '@prisma/client';

import type { ShopifyRemoteVariantConIdentita } from './shopify-graphql.client';
import {
  abbinaVariantiPerIdentita,
  ShopifyClaimSuperatoException,
} from './shopify-identita-catalogo.util';
import {
  gidArticoloInventario,
  gidProdotto,
  gidVariante,
  type ShopifyLinkHistoryService,
} from './shopify-link-history.service';
import { legacyIdFromGid } from './shopify-money.util';

/**
 * L'ADOZIONE degli id di un prodotto remoto creato da VestiFlow (docs/30 §7.2-bis).
 *
 * ⭐ **Una definizione sola, per due chiamanti**: il push che recupera l'esito incerto
 *    e il webhook `products/create` arrivato prima che il push abbia salvato. Se i due
 *    decidessero ognuno per conto proprio come abbinare le varianti e cosa scrivere,
 *    la stessa creazione potrebbe finire registrata in due modi.
 *
 * ⛔ **Solo letture verso Shopify (fatte dal chiamante, fuori dalla transazione) e
 *    scritture locali recintate dalla `claim_version`**: un tentativo superato scrive
 *    zero righe e lo sa. Le varianti remote senza identità nostra non si toccano.
 */

export interface ProdottoDaAdottare {
  readonly id: string;
  readonly tenantId: string;
  readonly variants: readonly { readonly id: string }[];
}

export interface EsitoAdozione {
  readonly abbinate: readonly {
    readonly varianteId: string;
    readonly remota: ShopifyRemoteVariantConIdentita;
  }[];
  readonly localiSenzaRemota: readonly string[];
  readonly remoteSenzaIdentita: readonly ShopifyRemoteVariantConIdentita[];
  readonly remoteConIdentitaSenzaLocale: readonly ShopifyRemoteVariantConIdentita[];
}

/**
 * Il lock consultivo per `(tenant, prodotto remoto)`: lo stesso dell'import via webhook,
 * così adozione dal push e adozione dal webhook si serializzano fra loro E con l'import.
 * Cast `::text` obbligatorio: `pg_advisory_xact_lock` restituisce `void`, che Prisma non
 * sa deserializzare.
 */
export async function serializzaPerProdottoRemoto(
  tx: Prisma.TransactionClient,
  tenantId: string,
  shopifyProductId: string,
): Promise<void> {
  const spazio = `shopify_import:${tenantId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${spazio}), hashtext(${shopifyProductId}))::text`;
}

/**
 * Scrive gli id (prodotto, varianti per `vestiflow.variant_id`, inventory item) e lo
 * storico, sotto il lock, SOLO se la `claim_version` è ancora quella del chiamante.
 * Restituisce l'abbinamento, così chi chiama dichiara ciò che manca senza rifarlo.
 */
export async function adottaIdentitaRecuperata(
  tx: Prisma.TransactionClient,
  storico: ShopifyLinkHistoryService,
  logger: Logger,
  dati: {
    readonly product: ProdottoDaAdottare;
    readonly versione: number;
    readonly legacyId: string;
    readonly remote: readonly ShopifyRemoteVariantConIdentita[];
  },
): Promise<EsitoAdozione> {
  const { product, versione, legacyId, remote } = dati;
  await serializzaPerProdottoRemoto(tx, product.tenantId, legacyId);

  // ⛔ Le locali sono quelle che esistono ADESSO, rilette sotto il lock, non la fotografia
  //    di chi chiama: una variante eliminata mentre la sua creazione remota era in volo non
  //    si «adotta» su una riga sparita (era un errore grezzo di Prisma) e non si ricrea —
  //    la remota resta, con la sua identità, fra quelle «senza locale», e si dichiara.
  const localiAdesso = await tx.productVariant.findMany({
    where: { productId: product.id, id: { in: product.variants.map((v) => v.id) } },
    select: { id: true },
  });
  const esito = abbinaVariantiPerIdentita(localiAdesso, remote);
  const scritto = await tx.product.updateMany({
    where: { id: product.id, shopifyCreateClaimVersion: versione },
    data: {
      shopifyProductId: legacyId,
      catalogOrigin: CatalogOrigin.vestiflow,
      shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
      // ⭐ L'adozione È la conclusione della creazione: il claim si chiude QUI, nella stessa
      //    scrittura fenced, da qualunque percorso arrivi (push o webhook anticipato).
      //    ⛔ Prima restava aperto «del push»: se il push moriva dopo l'adozione da webhook,
      //    il prodotto — già collegato — teneva un claim che nessun percorso chiudeva più
      //    (riprodotto il 15/09/2026, `syncing-e-claim-dopo-arresto` C1). La versione resta:
      //    è la storia del tentativo, e il push vivo ricontrolla solo quella.
      shopifyCreateClaimId: null,
      shopifyCreateClaimShopId: null,
      shopifyCreateClaimedAt: null,
    },
  });
  if (scritto.count !== 1) {
    throw new ShopifyClaimSuperatoException(
      'Creazione Shopify: tentativo superato prima di salvare gli id; nessuna scrittura.',
    );
  }
  // Gli id si salvano NUMERICI, come quelli già presenti: webhook e push inventario li
  // leggono in quella forma. La conversione a GID avviene sempre all'uscita.
  for (const abbinata of esito.abbinate) {
    await tx.productVariant.update({
      where: { id: abbinata.varianteId },
      data: {
        shopifyVariantId: legacyIdFromGid(abbinata.remota.id),
        shopifyInventoryItemId: abbinata.remota.inventoryItemId
          ? legacyIdFromGid(abbinata.remota.inventoryItemId)
          : null,
      },
    });
  }
  await registraStoricoPubblicazione(tx, storico, logger, product, legacyId, esito.abbinate);
  return esito;
}

/**
 * B3 · identità e periodo per un prodotto pubblicato da VestiFlow.
 *
 * ⭐ **Lo stesso servizio dell'import**, non una seconda implementazione: la differenza
 *    fra pubblicare e importare è da che parte arriva il GID, non che cosa si scrive.
 *
 * ⛔ **Non fa fallire la pubblicazione**: il prodotto su Shopify a quel punto esiste
 *    già, e un errore qui lascerebbe l'operatore convinto che la pubblicazione non sia
 *    avvenuta. Si registra e si prosegue.
 */
async function registraStoricoPubblicazione(
  tx: Prisma.TransactionClient,
  storico: ShopifyLinkHistoryService,
  logger: Logger,
  product: ProdottoDaAdottare,
  legacyId: string,
  abbinate: EsitoAdozione['abbinate'],
): Promise<void> {
  const shopId = await storico.negozioDelTenant(tx, product.tenantId);
  if (!shopId) {
    // Connessione non ancora migrata: nessuno storico, push invariato.
    return;
  }
  const esito = await storico.registraProdotto(tx, {
    tenantId: product.tenantId,
    shopId,
    productId: product.id,
    shopifyProductGid: gidProdotto(legacyId),
  });
  if (esito.tipo !== 'registrato') {
    logger.warn(
      `Storico Shopify non scritto per il prodotto pubblicato ${legacyId}: ` +
        `${esito.tipo}. La pubblicazione resta valida.`,
    );
    return;
  }
  for (const abbinata of abbinate) {
    await storico.registraVariante(tx, {
      tenantId: product.tenantId,
      shopId,
      productIdentityId: esito.identityId,
      productLinkId: esito.linkId,
      productId: product.id,
      variantId: abbinata.varianteId,
      shopifyVariantGid: gidVariante(legacyIdFromGid(abbinata.remota.id)),
      shopifyInventoryItemGid: gidArticoloInventario(
        abbinata.remota.inventoryItemId ? legacyIdFromGid(abbinata.remota.inventoryItemId) : '0',
      ),
    });
  }
}
