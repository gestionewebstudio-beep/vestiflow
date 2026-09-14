import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformAuditActor,
  PlatformAuditOperation,
  Prisma,
  ShopifyLinkStatus,
} from '@prisma/client';

import { PlatformAuditService } from '../common/audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  gidArticoloInventario,
  gidProdotto,
  gidVariante,
  ShopifyLinkHistoryService,
} from './shopify-link-history.service';
import { ShopifyLocationLinkService } from './shopify-location-link.service';

/**
 * ⭐ **BACKFILL dello storico dei collegamenti — fase 3 e 4 di `docs/24` §8.5.8.**
 *
 * Le tabelle dello storico (identità e periodi di prodotti e varianti, coppie e
 * periodi delle sedi) nascono vuote; i collegamenti fatti PRIMA vivono nelle
 * sole colonne-cache (`shopify_product_id`, `shopify_variant_id`,
 * `shopify_inventory_item_id`, `locations.shopify_location_id`). Qui si
 * convertono in storico, per tenant, con i servizi che scrivono lo storico
 * nel regime ordinario — non una seconda implementazione.
 *
 * ⛔ **Preceduto dai controlli bloccanti** (§8.5.8): un id remoto duplicato,
 *    una variante il cui prodotto non ha id remoto, un tenant incoerente
 *    fermano il tenant. **Nessuna deduplica automatica, nessuna scelta
 *    euristica**: decide una persona, poi si riparte.
 *
 * ⭐ **Idempotente**: i servizi rispondono `gia_collegata` / `gia_agganciata`
 *    alla seconda passata. E un collegamento che lo storico VIETA (identità
 *    eliminata, GID di un altro, periodo chiuso) NON si riapre: si conta e si
 *    nomina — è la stessa regola dell'import (B5-B6).
 *
 * ⚠️ Richiede la fase 2 (identità del negozio, `shopify_connections.shop_id`):
 *    senza negozio non c'è storico da scrivere, e lo si dice.
 *
 * ⭐ **Lascia una riga di registro** (`docs/DA-FARE` §14 punto 5, forma di §10.3):
 *    `backfill_storico`, attore `backfill`, tentativo con il piano e riuscita
 *    con i conteggi — nella sequenza canonica di `conRegistro`. ⚠️ Solo quando
 *    c'è qualcosa da convertire: l'idempotenza sta PRIMA del tentativo, e una
 *    seconda passata non lascia una traccia orfana.
 */

export interface AnomaliaBloccante {
  readonly controllo:
    | 'prodotto_id_remoto_duplicato'
    | 'variante_id_remoto_duplicato'
    | 'variante_inventory_item_duplicato'
    | 'variante_senza_prodotto_remoto'
    | 'variante_tenant_incoerente';
  readonly valore: string;
  readonly righe: readonly string[];
}

export interface ContatoriStorico {
  readonly identitaProdotto: number;
  readonly periodiProdottoAttivi: number;
  readonly identitaVariante: number;
  readonly periodiVarianteAttivi: number;
  readonly coppieSede: number;
  readonly periodiSedeAttivi: number;
}

export interface EsitoBackfill {
  readonly tenantId: string;
  readonly esito: 'eseguito' | 'bloccato' | 'negozio_assente';
  readonly anomalie: readonly AnomaliaBloccante[];
  readonly prima: ContatoriStorico;
  readonly dopo: ContatoriStorico;
  readonly prodotti: { registrati: number; giaCollegati: number; rifiutati: readonly string[] };
  readonly varianti: { registrate: number; giaAgganciate: number; rifiutate: readonly string[] };
  readonly sedi: { registrate: number; giaCollegate: number; rifiutate: readonly string[] };
  /** Fase 4: ogni id remoto in cache ha un periodo attivo? Chi non ce l'ha, nominato. */
  readonly nonCoperti: {
    readonly prodotti: readonly string[];
    readonly varianti: readonly string[];
    readonly sedi: readonly string[];
  };
}

@Injectable()
export class ShopifyStoricoBackfillService {
  private readonly logger = new Logger(ShopifyStoricoBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storico: ShopifyLinkHistoryService,
    private readonly locationLink: ShopifyLocationLinkService,
    private readonly registro: PlatformAuditService,
  ) {}

  /** I quattro controlli di §8.5.8, per tenant: righe = ferma. */
  async controlliBloccanti(tenantId: string): Promise<readonly AnomaliaBloccante[]> {
    // SQL esplicito, una query per controllo: sono le quattro domande di §8.5.8
    // scritte come si leggono, e si provano sul database vero.
    const duplicati = async (
      tabella: 'products' | 'product_variants',
      colonna: 'shopify_product_id' | 'shopify_variant_id' | 'shopify_inventory_item_id',
    ) =>
      this.prisma.$queryRaw<{ valore: string; righe: string[] }[]>(
        Prisma.sql`SELECT ${Prisma.raw(colonna)} AS valore, array_agg(id::text ORDER BY id) AS righe
          FROM ${Prisma.raw(tabella)}
          WHERE tenant_id = ${tenantId}::uuid AND ${Prisma.raw(colonna)} IS NOT NULL
          GROUP BY ${Prisma.raw(colonna)} HAVING count(*) > 1`,
      );

    const anomalie: AnomaliaBloccante[] = [];
    for (const r of await duplicati('products', 'shopify_product_id')) {
      anomalie.push({
        controllo: 'prodotto_id_remoto_duplicato',
        valore: r.valore,
        righe: r.righe,
      });
    }
    for (const r of await duplicati('product_variants', 'shopify_variant_id')) {
      anomalie.push({
        controllo: 'variante_id_remoto_duplicato',
        valore: r.valore,
        righe: r.righe,
      });
    }
    for (const r of await duplicati('product_variants', 'shopify_inventory_item_id')) {
      anomalie.push({
        controllo: 'variante_inventory_item_duplicato',
        valore: r.valore,
        righe: r.righe,
      });
    }

    const senzaProdottoRemoto = await this.prisma.$queryRaw<{ id: string; remoto: string }[]>`
      SELECT v.id::text AS id, v.shopify_variant_id AS remoto
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.tenant_id = ${tenantId}::uuid AND v.shopify_variant_id IS NOT NULL
        AND (p.shopify_product_id IS NULL OR p.tenant_id <> v.tenant_id)`;
    for (const v of senzaProdottoRemoto) {
      anomalie.push({
        controllo: 'variante_senza_prodotto_remoto',
        valore: v.remoto,
        righe: [v.id],
      });
    }

    const tenantIncoerente = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT v.id::text AS id FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.tenant_id = ${tenantId}::uuid AND p.tenant_id <> v.tenant_id`;
    for (const v of tenantIncoerente) {
      anomalie.push({ controllo: 'variante_tenant_incoerente', valore: v.id, righe: [v.id] });
    }

    return anomalie;
  }

  async contatori(
    tenantId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ContatoriStorico> {
    const [
      identitaProdotto,
      periodiProdottoAttivi,
      identitaVariante,
      periodiVarianteAttivi,
      coppieSede,
      periodiSedeAttivi,
    ] = await Promise.all([
      client.shopifyProductIdentity.count({ where: { tenantId } }),
      client.shopifyProductLink.count({
        where: { tenantId, status: ShopifyLinkStatus.active },
      }),
      client.shopifyVariantIdentity.count({ where: { tenantId } }),
      client.shopifyVariantLink.count({
        where: { tenantId, status: ShopifyLinkStatus.active },
      }),
      client.shopifyLocationPair.count({ where: { tenantId } }),
      client.shopifyLocationLink.count({
        where: { tenantId, status: ShopifyLinkStatus.active },
      }),
    ]);
    return {
      identitaProdotto,
      periodiProdottoAttivi,
      identitaVariante,
      periodiVarianteAttivi,
      coppieSede,
      periodiSedeAttivi,
    };
  }

  /**
   * Esegue il backfill di un tenant. Con `applica = false` calcola e verifica
   * senza scrivere (i conteggi «dopo» coincidono con «prima»).
   */
  async esegui(tenantId: string, opzioni: { readonly applica: boolean }): Promise<EsitoBackfill> {
    const prima = await this.contatori(tenantId);
    const vuoto = {
      prodotti: { registrati: 0, giaCollegati: 0, rifiutati: [] as string[] },
      varianti: { registrate: 0, giaAgganciate: 0, rifiutate: [] as string[] },
      sedi: { registrate: 0, giaCollegate: 0, rifiutate: [] as string[] },
    };

    const anomalie = await this.controlliBloccanti(tenantId);
    if (anomalie.length > 0) {
      return {
        tenantId,
        esito: 'bloccato',
        anomalie,
        prima,
        dopo: prima,
        ...vuoto,
        nonCoperti: await this.nonCoperti(tenantId),
      };
    }

    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    if (!shopId) {
      return {
        tenantId,
        esito: 'negozio_assente',
        anomalie: [],
        prima,
        dopo: prima,
        ...vuoto,
        nonCoperti: await this.nonCoperti(tenantId),
      };
    }

    if (!opzioni.applica) {
      return {
        tenantId,
        esito: 'eseguito',
        anomalie: [],
        prima,
        dopo: prima,
        ...vuoto,
        nonCoperti: await this.nonCoperti(tenantId),
      };
    }

    const conteggi = structuredClone(vuoto);
    let prodottiElaborati = 0;
    const lavoro = async (tx: Prisma.TransactionClient): Promise<void> => {
      const prodotti = await tx.product.findMany({
        where: { tenantId, shopifyProductId: { not: null } },
        select: {
          id: true,
          name: true,
          shopifyProductId: true,
          variants: {
            where: { shopifyVariantId: { not: null } },
            select: { id: true, sku: true, shopifyVariantId: true, shopifyInventoryItemId: true },
          },
        },
      });
      for (const prodotto of prodotti) {
        const esito = await this.storico.registraProdotto(tx, {
          tenantId,
          shopId,
          productId: prodotto.id,
          shopifyProductGid: gidProdotto(prodotto.shopifyProductId!),
        });
        if (esito.tipo !== 'registrato') {
          conteggi.prodotti.rifiutati.push(`${prodotto.name} (${prodotto.id}): ${esito.tipo}`);
          continue;
        }
        // `registrato` vale anche per un periodo già attivo: i «nuovi» si
        // contano dai conteggi prima/dopo, sotto — non da un'euristica.
        prodottiElaborati += 1;
        for (const variante of prodotto.variants) {
          const esitoVariante = await this.storico.registraVariante(tx, {
            tenantId,
            shopId,
            productIdentityId: esito.identityId,
            productLinkId: esito.linkId,
            productId: prodotto.id,
            variantId: variante.id,
            shopifyVariantGid: gidVariante(variante.shopifyVariantId!),
            shopifyInventoryItemGid: variante.shopifyInventoryItemId
              ? gidArticoloInventario(variante.shopifyInventoryItemId)
              : null,
          });
          if (esitoVariante === 'registrato') {
            conteggi.varianti.registrate += 1;
          } else if (esitoVariante === 'gia_agganciata') {
            conteggi.varianti.giaAgganciate += 1;
          } else {
            conteggi.varianti.rifiutate.push(
              `${prodotto.name} · ${variante.sku ?? variante.id}: ${esitoVariante}`,
            );
          }
        }
      }

      const sedi = await tx.location.findMany({
        where: { tenantId, shopifyLocationId: { not: null } },
        select: { id: true, name: true, shopifyLocationId: true },
      });
      for (const sede of sedi) {
        const esito = await this.locationLink.collega(tx, {
          tenantId,
          locationId: sede.id,
          shopifyLocationId: sede.shopifyLocationId!,
        });
        if (esito.tipo === 'registrato') {
          conteggi.sedi.registrate += 1;
        } else if (esito.tipo === 'gia_collegata') {
          conteggi.sedi.giaCollegate += 1;
        } else {
          conteggi.sedi.rifiutate.push(`${sede.name} (${sede.shopifyLocationId}): ${esito.tipo}`);
        }
      }
      // I prodotti nuovi si leggono dalla differenza dei periodi attivi, e si
      // leggono QUI perché la riga di riuscita li vuole dentro la transazione.
      const dentro = await this.contatori(tenantId, tx);
      conteggi.prodotti.registrati = dentro.periodiProdottoAttivi - prima.periodiProdottoAttivi;
      conteggi.prodotti.giaCollegati = prodottiElaborati - conteggi.prodotti.registrati;
    };

    // ⭐ Idempotenza PRIMA del tentativo (§10.3): se ogni id in cache ha già
    //    il suo periodo attivo, non c'è niente da scrivere e non si apre
    //    nessuna riga di registro. Il giro si fa comunque, solo letture e
    //    «già», così i conteggi restano quelli veri.
    const piano = await this.nonCoperti(tenantId);
    const daConvertire = piano.prodotti.length + piano.varianti.length + piano.sedi.length;
    const opzioniTx = { timeout: 120_000 };
    if (daConvertire === 0) {
      await this.prisma.$transaction(lavoro, opzioniTx);
    } else {
      const negozio = await this.prisma.shopifyShop.findUnique({
        where: { id: shopId },
        select: { shopGid: true },
      });
      await this.registro.conRegistro(
        {
          tenantId,
          attore: { tipo: PlatformAuditActor.backfill },
          operation: PlatformAuditOperation.backfill_storico,
          shopGid: negozio?.shopGid ?? null,
          reason:
            `da convertire: ${piano.prodotti.length} prodotti, ` +
            `${piano.varianti.length} varianti, ${piano.sedi.length} sedi`,
        },
        async (tx) => {
          await lavoro(tx);
          return { esito: 'applicata', reason: riepilogo(conteggi) };
        },
        opzioniTx,
      );
    }

    const dopo = await this.contatori(tenantId);
    const nonCoperti = await this.nonCoperti(tenantId);
    this.logger.log(`Backfill storico Shopify (${tenantId}): ${riepilogo(conteggi)}`);
    return { tenantId, esito: 'eseguito', anomalie: [], prima, dopo, ...conteggi, nonCoperti };
  }

  /**
   * Fase 4 — la verifica: ogni id remoto in cache deve avere un periodo attivo
   * nello storico. Chi non ce l'ha è nominato, mai «quasi tutti».
   */
  async nonCoperti(tenantId: string): Promise<EsitoBackfill['nonCoperti']> {
    const [prodotti, varianti, sedi] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM products p
        WHERE p.tenant_id = ${tenantId}::uuid AND p.shopify_product_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM shopify_product_identities i
            JOIN shopify_product_links l ON l.identity_id = i.id AND l.status = 'active'
            WHERE i.product_id = p.id)`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT v.id FROM product_variants v
        WHERE v.tenant_id = ${tenantId}::uuid AND v.shopify_variant_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM shopify_variant_identities i
            JOIN shopify_variant_links l ON l.identity_id = i.id AND l.status = 'active'
            WHERE i.variant_id = v.id)`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM locations s
        WHERE s.tenant_id = ${tenantId}::uuid AND s.shopify_location_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM shopify_location_pairs c
            JOIN shopify_location_links l ON l.pair_id = c.id AND l.status = 'active'
            WHERE c.location_id = s.id)`,
    ]);
    return {
      prodotti: prodotti.map((r) => r.id),
      varianti: varianti.map((r) => r.id),
      sedi: sedi.map((r) => r.id),
    };
  }
}

/** I conteggi in una riga: è quella del registro e quella del log. */
function riepilogo(c: Pick<EsitoBackfill, 'prodotti' | 'varianti' | 'sedi'>): string {
  return (
    `prodotti +${c.prodotti.registrati} (${c.prodotti.giaCollegati} già, ${c.prodotti.rifiutati.length} rifiutati) · ` +
    `varianti +${c.varianti.registrate} (${c.varianti.giaAgganciate} già, ${c.varianti.rifiutate.length} rifiutate) · ` +
    `sedi +${c.sedi.registrate} (${c.sedi.giaCollegate} già, ${c.sedi.rifiutate.length} rifiutate)`
  );
}
