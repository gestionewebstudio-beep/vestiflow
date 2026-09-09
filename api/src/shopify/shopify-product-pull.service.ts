import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CatalogOrigin,
  PlatformAuditActor,
  PlatformAuditOperation,
  ProductStatus,
  ShopifyCatalogLinkKind,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  type Prisma,
} from '@prisma/client';

import { PlatformAuditService } from '../common/audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { nextArticleCodeInTx } from '../products/article-code.util';
import {
  resolveCatalogOriginForShopifyImport,
  resolveShopifyCatalogLinkKindForImport,
  shouldSkipShopifyCatalogImport,
} from '../products/catalog-origin.util';
import { syncProductImagesFromShopify } from '../products/product-images.sync';
import type { ShopifyAdminProduct } from './shopify-admin.client';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import {
  gidArticoloInventario,
  gidProdotto,
  gidVariante,
  ShopifyLinkHistoryService,
  type EsitoStorico,
  type EsitoVariante,
  type VerdettoCreazione,
} from './shopify-link-history.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import type { ProductShopifyEnrichment } from './shopify-product-metadata.types';
import { PRODUCT_IMPORT_TX } from './shopify-product-metadata.types';
import {
  categoryMetafieldsSyncErrorMessage,
  countCategoryMetafieldsWithValues,
  parseCategoryMetafieldsJson,
  resolveImportedShopifyCategoryMetafields,
  resolveImportedShopifyMetafields,
} from './shopify-category-metafields.util';
import { parseShopifyTags } from './shopify-product-metadata.util';
import { shopifyDecimalToMinor } from './shopify-money.util';
import { shopifyBodyHtmlToPlainText } from './shopify-html.util';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { toShopifyUserMessage } from './shopify-user-error.util';
import {
  mergeShopifyScopes,
  buildShopifyScopeDiagnostics,
  shopifyCatalogImportBlockMessage,
} from './shopify-scopes.util';

export interface ShopifyCatalogSyncResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteProductCount: number;
  readonly failed: readonly { shopifyProductId: string; message: string }[];
}

type VariantOptionRow = { readonly name: string; readonly value: string };

/** Chi ha portato l'evento: un lotto di pull o una consegna webhook. Mai una persona. */
type AttoreImport = typeof PlatformAuditActor.pull | typeof PlatformAuditActor.webhook;

/**
 * L'INGRESSO dell'operazione: chi l'ha portata, e la correlazione nata lì.
 *
 * ⭐ **La correlazione si genera una volta all'ingresso** — un lotto di pull, una
 *    consegna webhook — e scende fino alle righe di registro: così i rifiuti
 *    dello stesso evento si ritrovano insieme (§10.3, «correlazione: consegna
 *    webhook, lotto di pull»). ⛔ Non è un identificativo Shopify: il controller
 *    dei webhook oggi non legge `X-Shopify-Webhook-Id`, e non lo si inventa.
 */
interface Ingresso {
  readonly attore: AttoreImport;
  readonly correlationId: string;
}

/** Un verdetto dello storico che NON è «si crea»: porta il motivo, per nome. */
type Rifiuto = Exclude<VerdettoCreazione, { readonly tipo: 'si_crea' }>;

/** Un esito dello storico che NON è «registrato»: il riaggancio è stato rifiutato. */
type RiagganciRifiutati = Exclude<EsitoStorico['tipo'], 'registrato'>;
type RiagganciVarianteRifiutati = Exclude<EsitoVariante, 'registrato' | 'gia_agganciata'>;

/** La regola che ha deciso il rifiuto del riaggancio, per nome: è il `detail` della riga. */
const MOTIVO_RIAGGANCIO: Record<RiagganciRifiutati | RiagganciVarianteRifiutati, string> = {
  collegamento_chiuso:
    'il collegamento è stato chiuso: nessuna riapertura automatica (docs/24 §8.5.2)',
  identita_eliminata:
    "l'identità è stata eliminata definitivamente in VestiFlow: il GID non è riutilizzabile (docs/24 §11.8)",
  gid_di_un_altro: "il GID appartiene già a un'altra anagrafica locale",
  gid_di_un_altra: "il GID appartiene già a un'altra variante locale",
};

@Injectable()
export class ShopifyProductPullService {
  private readonly logger = new Logger(ShopifyProductPullService.name);

  /** Evita import catalogo paralleli per lo stesso tenant (process-local). */
  private readonly catalogPullInFlight = new Map<string, Promise<ShopifyCatalogSyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyEnrichment: ShopifyProductEnrichmentService,
    private readonly storico: ShopifyLinkHistoryService,
    /** §10.3 · il registro UNICO: un import rifiutato vi lascia una riga, non solo un log. */
    private readonly registro: PlatformAuditService,
  ) {}

  async pullCatalog(tenantId: string): Promise<ShopifyCatalogSyncResult> {
    const inflight = this.catalogPullInFlight.get(tenantId);
    if (inflight) {
      this.logger.log(`Import catalogo già in corso (${tenantId}): join richiesta parallela`);
      return inflight;
    }

    const job = this.executePullCatalog(tenantId).finally(() => {
      this.catalogPullInFlight.delete(tenantId);
    });
    this.catalogPullInFlight.set(tenantId, job);
    return job;
  }

  private async executePullCatalog(tenantId: string): Promise<ShopifyCatalogSyncResult> {
    await this.shopifyConnection.healStaleErrorStatus(tenantId);

    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      throw new UnprocessableEntityException(
        'Connessione Shopify non attiva. Ricollega lo store da Impostazioni e riprova.',
      );
    }

    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeDiagnostics = buildShopifyScopeDiagnostics(
      this.shopifyConfig.requestedScopes,
      effectiveScopes,
    );
    const readScopeError = shopifyCatalogImportBlockMessage(scopeDiagnostics);
    if (readScopeError) {
      this.logger.warn(
        `Import catalogo bloccato (${tenantId}): read_products assente (scopes: ${effectiveScopes.join(', ')})`,
      );
      throw new UnprocessableEntityException(readScopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteProducts: readonly ShopifyAdminProduct[];
    try {
      remoteProducts = await this.shopifyAdmin.listAllProducts(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }
    this.logger.log(
      `Import catalogo Shopify (${tenantId}): ${remoteProducts.length} prodotti da ${shopDomain}`,
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyProductId: string; message: string }[] = [];
    // ⭐ UNA correlazione per il LOTTO: ogni rifiuto di questo giro la porta.
    const ingresso: Ingresso = { attore: PlatformAuditActor.pull, correlationId: randomUUID() };

    for (const remote of remoteProducts) {
      try {
        // ⛔ PRIMA dell'arricchimento: `enrichProduct` interroga Shopify, e un suo
        //    fallimento finisce nel catch qui sotto, che scrive sul prodotto. La
        //    guardia di `importProduct` non si raggiungerebbe mai.
        if (await this.syncSpentaPerRemoto(tenantId, String(remote.id))) {
          skipped += 1;
          continue;
        }
        const enrichment = await this.shopifyEnrichment.enrichProduct(
          shopDomain,
          accessToken,
          remote,
          { fetchVariantCosts: false, skipRemoteMetadata: true },
        );
        const outcome = await this.importProduct(tenantId, remote, enrichment, ingresso);
        if (outcome === 'imported') {
          imported += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Import fallito';
        // ⚠️ Il messaggio GREZZO va nel log del server: al chiamante arriva
        //    tradotto (`toShopifyUserMessage`), e su un articolo mai creato non
        //    c'è un prodotto su cui scriverlo. Senza questa riga, un registro che
        //    non scrive (pool esaurito, §10.3) comparirebbe solo come «timeout».
        this.logger.error(`Import Shopify fallito (${tenantId}, prodotto ${remote.id}): ${message}`);
        failed.push({
          shopifyProductId: String(remote.id),
          message: toShopifyUserMessage(undefined, message).slice(0, 300),
        });
        await this.recordProductImportError(tenantId, String(remote.id), message);
      }
    }

    // ⛔ **Il timbro NON è incondizionato.** `touchSync` scrive «ultima
    //    sincronizzazione» E cancella gli errori della connessione: darlo dopo
    //    un lotto in cui non è entrato niente racconta una sincronizzazione che
    //    non c'è stata, e cancella un errore precedente che era vero.
    //
    // ⭐ **Il criterio è se qualcosa è ARRIVATO**, non se il tentativo è finito:
    //    un fallimento per singolo prodotto non dice che la connessione sia
    //    rotta, quindi un lotto parziale il timbro se lo merita. Un lotto in cui
    //    ogni prodotto è fallito, no.
    //
    // ⚠️ **Il metodo condiviso non si tocca**: `touchSync` la chiamano anche
    //    l'import giacenze, quello clienti e quello vendite, e cambiarlo per
    //    questo caso cambierebbe il significato del timbro per tutti. Qui si
    //    decide soltanto SE chiamarlo.
    const nessunEsitoUtile = imported === 0 && updated === 0 && skipped === 0;
    if (!(failed.length > 0 && nessunEsitoUtile)) {
      await this.shopifyConnection.touchSync(tenantId);
    } else {
      this.logger.warn(
        `Import catalogo Shopify (${tenantId}): ${failed.length} prodotti falliti e nessuno ` +
          'entrato. La connessione NON viene marcata come sincronizzata.',
      );
    }
    return {
      imported,
      updated,
      skipped,
      remoteProductCount: remoteProducts.length,
      failed,
    };
  }

  async importProductFromWebhook(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const remote = this.normalizeWebhookProduct(payload);
    if (!remote) {
      return 'skipped';
    }

    // ⛔ Anche qui prima dell'arricchimento: un prodotto spento non deve costare
    //    nemmeno una chiamata a Shopify. Qui il fallimento dell'enrichment è già
    //    catturato e non scrive, ma la chiamata partiva lo stesso.
    if (await this.syncSpentaPerRemoto(tenantId, String(remote.id))) {
      this.logger.debug(
        `Webhook Shopify ignorato: sincronizzazione spenta sul prodotto (${remote.id})`,
      );
      return 'skipped';
    }

    let enrichment: ProductShopifyEnrichment | undefined;
    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      enrichment = await this.shopifyEnrichment.enrichProduct(shopDomain, accessToken, remote, {
        fetchVariantCosts: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enrichment webhook fallito';
      this.logger.warn(`Enrichment webhook prodotto ${remote.id}: ${message}`);
    }

    // ⭐ UNA correlazione per la CONSEGNA: nasce qui, all'ingresso, e scende
    //    fino alle righe di registro. ⛔ Non è l'id di consegna di Shopify — il
    //    controller non legge `X-Shopify-Webhook-Id` — e non lo si inventa.
    const ingresso: Ingresso = { attore: PlatformAuditActor.webhook, correlationId: randomUUID() };
    try {
      return await this.importProduct(tenantId, remote, enrichment, ingresso);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Import webhook fallito';
      await this.recordProductImportError(tenantId, String(remote.id), message);
      throw error;
    }
  }

  /**
   * L'import di UN prodotto remoto: UNA transazione, serializzata per
   * `(tenant, prodotto remoto)` PRIMA di qualunque lettura.
   *
   * ⛔ **Il lock viene prima della lettura, non prima della scrittura** — ed è
   *    la correzione di `DA-FARE` §25, misurato il 09/09/2026 con due richieste
   *    davvero sovrapposte (`concorrenza-import.integration-spec.ts`): entrambe
   *    leggevano `existing === null`, entrambe passavano la guardia dello
   *    storico, e la seconda committava un DOPPIONE senza identità. Un lock
   *    preso dopo la lettura serializza la scrittura ma non la DECISIONE, che
   *    era già presa su uno stato che non c'era più.
   *
   * ⭐ **Chi aspetta riparte su uno stato aggiornato, e NON salta.** Il secondo
   *    import rilegge, trova l'articolo appena creato dal primo e prende il ramo
   *    di aggiornamento con il PROPRIO payload: titolo Shopify, barcode e gli
   *    altri campi della matrice arrivano a destinazione come se i due webhook
   *    fossero arrivati in sequenza. Rispondere `skipped` avrebbe evitato il
   *    doppione perdendo l'aggiornamento (`docs/24` §8.9.4).
   *
   * ⚠️ **«In sequenza» è l'ordine di ELABORAZIONE, non quello degli eventi.** Il
   *    secondo payload elaborato non è necessariamente il più recente: questo
   *    lock risolve gli incroci provati (doppioni, perdite), non l'ordine
   *    cronologico dei webhook, che resta `docs/24` §8.5.3 (`triggered_at`,
   *    inbox) e non è implementato.
   *
   * ⚠️ **Chiave `(tenant, shopify_product_id)`, non `(negozio, gid)`**: vale
   *    anche per le connessioni preesistenti senza `shop_id`, che il doppione
   *    lo producono uguale. Stessa tecnica di `nextArticleCodeInTx`, che resta
   *    dov'è e viene preso DOPO questo — sempre nello stesso ordine, quindi
   *    senza cicli.
   *
   * ⚠️ Nessuna chiamata di rete qui dentro: `enrichProduct` è già stato fatto
   *    dal chiamante, e `syncProductImagesFromShopify` non ne fa.
   */
  private async importProduct(
    tenantId: string,
    remote: ShopifyAdminProduct,
    enrichment: ProductShopifyEnrichment | undefined,
    ingresso: Ingresso,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const shopifyProductId = String(remote.id);
    return this.prisma.$transaction(async (tx) => {
      await this.serializzaImport(tx, tenantId, shopifyProductId);
      return this.importProductSerializzato(
        tx,
        tenantId,
        shopifyProductId,
        remote,
        enrichment,
        ingresso,
      );
    }, PRODUCT_IMPORT_TX);
  }

  /** Il lock transazionale su `(tenant, prodotto remoto)`: chi arriva secondo aspetta. */
  private async serializzaImport(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopifyProductId: string,
  ): Promise<void> {
    const spazio = `shopify_import:${tenantId}`;
    // Cast ::text obbligatorio: pg_advisory_xact_lock restituisce `void`, che
    // Prisma non sa deserializzare (vedi `nextArticleCodeInTx`).
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${spazio}), hashtext(${shopifyProductId}))::text`;
  }

  /**
   * Il corpo dell'import, a lock già preso: ogni lettura da qui in poi vede il
   * commit di chi è passato prima, e ogni decisione — ramo, dati da scrivere,
   * mappa delle varianti — si prende su quella lettura.
   */
  private async importProductSerializzato(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopifyProductId: string,
    remote: ShopifyAdminProduct,
    enrichment: ProductShopifyEnrichment | undefined,
    ingresso: Ingresso,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const existing = await tx.product.findFirst({
      where: { tenantId, shopifyProductId },
      include: {
        variants: true,
        images: { select: { storagePath: true } },
      },
    });

    const options = this.mapOptions(remote);
    const status = this.mapStatus(remote.status);
    const tags = enrichment?.tags ?? parseShopifyTags(remote.tags);
    const localCategoryMetafields = parseCategoryMetafieldsJson(
      existing?.shopifyCategoryMetafields,
    );
    const importedCategoryMetafields = resolveImportedShopifyCategoryMetafields(
      enrichment?.categoryMetafields,
      existing?.shopifyCategoryMetafields,
    );

    // ⛔ Sincronizzazione SPENTA: il prodotto si ignora INTEGRALMENTE — niente
    //    nome, descrizione, stato, opzioni, varianti o immagini. Spegnere
    //    l'interruttore significa «questo prodotto non si tocca da Shopify», e
    //    una guardia che ne lasciasse passare metà sarebbe peggio di nessuna.
    if (this.isSyncSpenta(existing)) {
      this.logger.debug(
        `Import Shopify saltato: sincronizzazione spenta sul prodotto (${shopifyProductId})`,
      );
      return 'skipped';
    }

    if (existing?.shopifySyncStatus === ShopifySyncStatus.syncing) {
      this.logger.debug(
        `Import webhook saltato: sync VestiFlow→Shopify in corso (${shopifyProductId})`,
      );
      return 'skipped';
    }

    // Il NOME SHOPIFY: il titolo con cui il prodotto si vende (docs/24 §1.9).
    //
    // ⛔ Sta QUI, dopo le guardie, e non più in cima: `normalizeWebhookProduct`
    //    non valida il payload — `payload as ShopifyAdminProduct` — quindi
    //    `remote.title` può essere `undefined` a runtime. Letto prima della
    //    guardia, il `.trim()` lanciava, il catch chiamava
    //    `recordProductImportError`, e quello scriveva `shopifySyncStatus: error`
    //    **su un prodotto a sincronizzazione spenta**: la scrittura che la
    //    guardia esiste per impedire.
    const titoloShopify = remote.title.trim() || 'Prodotto Shopify';

    if (existing && shouldSkipShopifyCatalogImport(existing)) {
      // ⭐ Il catalogo resta di VestiFlow, ma il **Nome Shopify** no: è il titolo
      //    della vetrina, ed è bidirezionale per contratto (docs/24 §1.9). Passa
      //    solo lui: `Product.name` e il resto del catalogo restano fermi.
      if (existing.shopifyTitle !== titoloShopify) {
        await tx.product.updateMany({
          where: { id: existing.id, tenantId },
          data: { shopifyTitle: titoloShopify },
        });
      }
      this.logger.debug(
        `Import Shopify saltato: catalogo di origine VestiFlow (${shopifyProductId})`,
      );
      return 'skipped';
    }

    const categorySyncError = categoryMetafieldsSyncErrorMessage(
      countCategoryMetafieldsWithValues(localCategoryMetafields),
      countCategoryMetafieldsWithValues(importedCategoryMetafields),
      existing?.shopifyLastError,
    );
    // ⭐ Il titolo remoto è il NOME SHOPIFY, e da qui in poi solo quello: il nome
    //    interno appartiene a chi lavora in magazzino, e un ri-sync non glielo
    //    riscrive più (docs/24 §1.9). `name` sta fuori dall'allowlist apposta —
    //    stesso pattern del codice articolo — e lo aggiunge la sola creazione.
    const productData = {
      shopifyTitle: titoloShopify,
      description: shopifyBodyHtmlToPlainText(remote.body_html),
      brand: remote.vendor?.trim() || null,
      category: remote.product_type?.trim() || null,
      shopifyTaxonomyCategoryId:
        enrichment?.taxonomyCategoryId ?? existing?.shopifyTaxonomyCategoryId ?? null,
      shopifyTaxonomyCategoryFullName:
        enrichment?.taxonomyCategoryFullName ?? existing?.shopifyTaxonomyCategoryFullName ?? null,
      season: enrichment?.season ?? existing?.season ?? null,
      tags: [...tags],
      seoTitle: enrichment?.seoTitle ?? null,
      seoDescription: enrichment?.seoDescription ?? null,
      shopifyCollections: (enrichment?.collections ?? []) as unknown as Prisma.InputJsonValue,
      shopifyMetafields: resolveImportedShopifyMetafields(
        enrichment?.metafields,
        existing?.shopifyMetafields,
      ) as unknown as Prisma.InputJsonValue,
      shopifyCategoryMetafields: importedCategoryMetafields as unknown as Prisma.InputJsonValue,
      status,
      options: options as unknown as Prisma.InputJsonValue,
      shopifyProductId,
      shopifySyncStatus: categorySyncError
        ? ShopifySyncStatus.out_of_sync
        : ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: categorySyncError,
      catalogOrigin: existing
        ? resolveCatalogOriginForShopifyImport(existing)
        : CatalogOrigin.shopify,
      shopifyCatalogLinkKind: existing
        ? resolveShopifyCatalogLinkKindForImport(existing)
        : ShopifyCatalogLinkKind.imported,
    };

    if (!existing) {
      // ── B5-B6 · si può CREARE questo articolo? ───────────────────────────
      //
      // ⛔ **La domanda si fa allo STORICO, non alla colonna-cache**, ed è la
      //    correzione del difetto descritto in `docs/24` §11.8: oggi un GID mai
      //    visto e un GID **eliminato definitivamente** producono lo stesso
      //    `existing === null`, e il secondo veniva reimportato.
      //
      // ⭐ **Solo nel ramo di CREAZIONE.** Se l'articolo locale esiste, è quello
      //    giusto e si aggiorna come sempre: la guardia non tocca gli
      //    aggiornamenti consentiti.
      //
      // ⛔ **Da sola, sotto concorrenza, la guardia NON basta** — e stare nella
      //    transazione non la rende sicura: a Read Committed (letto dal server)
      //    un'altra transazione può intervenire fra il controllo e la scrittura.
      //    A proteggerla è il lock preso in `importProduct` PRIMA della lettura
      //    di `existing`: chi arriva secondo aspetta, rilegge, trova l'articolo
      //    e non passa di qui. Dimostrato con due richieste davvero sovrapposte
      //    (`C1`, `C2`) e falsificato togliendo il lock — non dedotto dal
      //    contenitore in cui stanno le istruzioni.
      const reservedSkus = await this.loadTenantSkus(tx, tenantId);
      const rifiuto = await this.verificaCreazioneAmmessa(tx, tenantId, shopifyProductId);
      if (rifiuto) {
        // ⛔ **Il rifiuto NON ferma il lotto** (`DA-FARE`, fase B): si registra
        //    il motivo e si prosegue col prodotto dopo. Un import che si
        //    interrompe al primo articolo escluso è peggio del difetto.
        //
        // ⭐ **E «si registra» vuol dire nel REGISTRO** (§10.3), non solo nel
        //    log: una riga `rifiutata` con la regola per nome, l'attore che ha
        //    portato l'evento e il GID remoto. Il log resta per chi legge il
        //    container; la riga resta per chi legge domani.
        this.logger.warn(`Import Shopify saltato: ${rifiuto.verdetto.motivo}`);
        await this.registraRifiuto(tx, tenantId, ingresso, rifiuto.shopId, {
          operation: PlatformAuditOperation.import_prodotto_rifiutato,
          entityId: null,
          entityLabel: titoloShopify,
          remoteGid: gidProdotto(shopifyProductId),
          detail: `${rifiuto.verdetto.tipo}: ${rifiuto.verdetto.motivo}`,
        });
        return 'skipped';
      }

      // Codice articolo: proprietà interna VestiFlow, mai mappata su campi
      // Shopify. Generato SOLO alla prima sincronizzazione (prodotto non
      // ancora in VestiFlow); gli update successivi non lo toccano perché
      // non compare nell'allowlist `productData` (stesso pattern di `kind`).
      const articleCode = await nextArticleCodeInTx(tx, tenantId);
      // Campi articolo popolati dalla prima variante (Shopify li mostra come
      // prezzo/barrato/costo del prodotto): il barrato è SOLO dell'articolo.
      const first = remote.variants[0];
      // Primo import: il prezzo Shopify E il prezzo articolo (gestionale)
      // nascono entrambi dal prezzo Shopify — non c'è altra fonte. Da qui in
      // poi la sync tocca solo il prezzo Shopify; il prezzo articolo è
      // dell'operatore.
      const firstPriceMinor = first ? shopifyDecimalToMinor(first.price ?? '0') : 0;
      const product = await tx.product.create({
        data: {
          tenantId,
          articleCode,
          // Primo import: i due nomi nascono uguali, e da qui vivono separati.
          name: titoloShopify,
          ...productData,
          sellingPriceMinor: firstPriceMinor,
          shopifyPriceMinor: firstPriceMinor,
          compareAtPriceMinor: first?.compare_at_price
            ? shopifyDecimalToMinor(first.compare_at_price)
            : null,
          purchasePriceMinor: first
            ? (enrichment?.variantPurchasePriceMinor.get(first.id) ?? 0)
            : 0,
        },
      });

      // ⚠️ Qui le varianti si creano SENZA `siPuoCreareVariante`, e regge per un
      //    invariante dello schema: un'identità variante esiste solo sotto
      //    un'identità prodotto (`productIdentityId`), e se questa non c'è — o è
      //    eliminata — la guardia del prodotto qui sopra ha già deciso. Se un
      //    payload portasse comunque il GID di una variante esclusa sotto un
      //    prodotto nuovo (su Shopify non accade: gli id variante sono univoci),
      //    la cache verrebbe scritta e `registraStorico` rifiuterebbe il
      //    riaggancio, registrandolo — non passerebbe in silenzio.
      for (const variant of remote.variants) {
        const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
        reservedSkus.add(sku.toLowerCase());
        const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
        await tx.productVariant.create({
          data: {
            tenantId,
            productId: product.id,
            sku,
            optionValues: this.mapVariantOptions(remote, variant),
            barcode: variant.barcode ?? null,
            currency: 'EUR',
            sellingPriceMinor: variantPriceMinor,
            shopifyPriceMinor: variantPriceMinor,
            purchasePriceMinor: enrichment?.variantPurchasePriceMinor.get(variant.id) ?? 0,
            shopifyVariantId: String(variant.id),
            shopifyInventoryItemId: String(variant.inventory_item_id),
          },
        });
      }

      await syncProductImagesFromShopify(tx, tenantId, product.id, remote.images);

      // ── B2 · lo STORICO, nella stessa transazione delle colonne-cache ──
      //
      // ⭐ **Qui dentro e non dopo**: se la transazione cade, non deve restare
      //    un'identità che dichiara un collegamento mai avvenuto. Le colonne
      //    `shopifyProductId` / `shopifyVariantId` restano dove sono — sono la
      //    cache, e questa è la storia.
      await this.registraStorico(tx, tenantId, product.id, remote, ingresso, titoloShopify);
      return 'imported';
    }

    const reservedSkus = await this.loadTenantSkus(tx, tenantId, existing.id);
    // ⭐ La mappa nasce dalla lettura fatta DOPO il lock: una variante che
    //    l'altro import ha appena creato è già qui, e si AGGIORNA col payload
    //    più recente invece di finire nella guardia e venire saltata (`C5`).
    const byShopifyVariantId = new Map(
      existing.variants.filter((v) => v.shopifyVariantId).map((v) => [v.shopifyVariantId!, v]),
    );

    /** 26.7 · i GID gia' rifiutati in questo giro: non si registrano due volte. */
    const rifiutate = new Set<string>();
    const firstRemote = remote.variants[0];
    // ⚠️ Si legge UNA volta per import, fuori dal ciclo delle varianti: dentro
    //    costerebbe una query per variante per rispondere sempre lo stesso.
    const shopIdCorrente = await this.storico.negozioDelTenant(tx, tenantId);

    // ── 26.7 · il COLLEGAMENTO del prodotto è ancora valido? ───────────────
    //
    // ⛔ **L'anagrafica è stata trovata per COLONNA-CACHE, e la cache può
    //    mentire**: dopo un ripristino da backup la riga torna col suo
    //    `shopify_product_id` mentre lo storico dice che l'identità è chiusa o
    //    eliminata. Fino al 09/09/2026 l'aggiornamento passava lo stesso —
    //    misurato in `S8` — e il collegamento chiuso diventava una riapertura
    //    di fatto. ⭐ La domanda si fa allo storico, per GID: uno storico
    //    vecchio su un ALTRO gid non blocca il collegamento attuale.
    if (shopIdCorrente) {
      const uso = await this.storico.collegamentoUsabileProdotto(tx, {
        shopId: shopIdCorrente,
        shopifyProductGid: gidProdotto(shopifyProductId),
        productId: existing.id,
      });
      if (uso.tipo !== 'utilizzabile') {
        this.logger.warn(`Import Shopify saltato: ${uso.motivo}`);
        await this.registraRifiuto(tx, tenantId, ingresso, shopIdCorrente, {
          operation: PlatformAuditOperation.riaggancio_rifiutato,
          entityId: existing.id,
          entityLabel: titoloShopify,
          remoteGid: gidProdotto(shopifyProductId),
          detail: `${uso.tipo}: ${uso.motivo}`,
        });
        return 'skipped';
      }
    }

    await tx.product.update({
      where: { id: existing.id },
      data: {
        ...productData,
        // Ri-sync: si aggiorna SOLO il prezzo Shopify (dalla prima variante).
        // Il prezzo articolo (gestionale) è dell'operatore, non si tocca più.
        // Il barrato è dell'articolo ma resta sincronizzato (una sola versione).
        shopifyPriceMinor: firstRemote ? shopifyDecimalToMinor(firstRemote.price ?? '0') : 0,
        compareAtPriceMinor: firstRemote?.compare_at_price
          ? shopifyDecimalToMinor(firstRemote.compare_at_price)
          : null,
        purchasePriceMinor: firstRemote
          ? (enrichment?.variantPurchasePriceMinor.get(firstRemote.id) ?? 0)
          : 0,
      },
    });

    for (const variant of remote.variants) {
      const shopifyVariantId = String(variant.id);
      const matched = byShopifyVariantId.get(shopifyVariantId);
      const purchasePriceMinor =
        enrichment?.variantPurchasePriceMinor.get(variant.id) ?? matched?.purchasePriceMinor ?? 0;
      const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
      // Comune a match/nuova: il prezzo Shopify e i collegamenti si allineano.
      const variantSyncData = {
        optionValues: this.mapVariantOptions(remote, variant) as unknown as Prisma.InputJsonValue,
        barcode: variant.barcode ?? null,
        shopifyPriceMinor: variantPriceMinor,
        purchasePriceMinor,
        shopifyVariantId,
        shopifyInventoryItemId: String(variant.inventory_item_id),
      };

      if (matched) {
        // ── 26.7 · e il collegamento di QUESTA variante? ─────────────────
        //
        // ⭐ **Il rifiuto è per VARIANTE**: il prodotto e le sorelle si sono
        //    già aggiornati, e continuano. Salta solo lei, e si registra.
        if (shopIdCorrente) {
          const usoVariante = await this.storico.collegamentoUsabileVariante(tx, {
            shopId: shopIdCorrente,
            shopifyVariantGid: gidVariante(variant.id),
            variantId: matched.id,
          });
          if (usoVariante.tipo !== 'utilizzabile') {
            this.logger.warn(`Import Shopify, variante saltata: ${usoVariante.motivo}`);
            await this.registraRifiuto(tx, tenantId, ingresso, shopIdCorrente, {
              operation: PlatformAuditOperation.riaggancio_rifiutato,
              entityId: matched.id,
              entityLabel: `${titoloShopify} · ${variant.title ?? shopifyVariantId}`,
              remoteGid: gidVariante(variant.id),
              detail: `${usoVariante.tipo}: ${usoVariante.motivo}`,
            });
            // ⚠️ Annotata: `registraStorico` la salterà senza registrarla una
            //    seconda volta — è lo stesso rifiuto, non due.
            rifiutate.add(gidVariante(variant.id));
            continue;
          }
        }
        // Variante esistente: NON si tocca il prezzo articolo (gestionale).
        await tx.productVariant.update({
          where: { id: matched.id },
          data: variantSyncData,
        });
      } else {
        // ── B5-B6 · si può creare QUESTA variante? ───────────────────────
        //
        // ⛔ **Il rifiuto è per VARIANTE, non per prodotto**: una variante
        //    eliminata definitivamente non si ricrea, ma il prodotto e le
        //    altre varianti si aggiornano come sempre. Un rifiuto che
        //    fermasse l'intero articolo toglierebbe aggiornamenti consentiti.
        const scartoVariante = shopIdCorrente
          ? await this.storico.siPuoCreareVariante(tx, {
              shopId: shopIdCorrente,
              shopifyVariantGid: gidVariante(variant.id),
            })
          : ({ tipo: 'si_crea' } as const);
        if (scartoVariante.tipo !== 'si_crea') {
          this.logger.warn(`Import Shopify, variante saltata: ${scartoVariante.motivo}`);
          // ⭐ §10.3 · la riga di registro del rifiuto, PER VARIANTE: il prodotto
          //    intorno si aggiorna come sempre, e la riga commette con lui.
          await this.registraRifiuto(tx, tenantId, ingresso, shopIdCorrente!, {
            operation: PlatformAuditOperation.import_variante_rifiutata,
            entityId: existing.id,
            entityLabel: `${titoloShopify} · ${variant.title ?? shopifyVariantId}`,
            remoteGid: gidVariante(variant.id),
            detail: `${scartoVariante.tipo}: ${scartoVariante.motivo}`,
          });
          continue;
        }

        // Variante nuova comparsa su Shopify: prezzo articolo seminato dal
        // prezzo Shopify (nessun'altra fonte), poi indipendente.
        const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
        reservedSkus.add(sku.toLowerCase());
        await tx.productVariant.create({
          data: {
            tenantId,
            productId: existing.id,
            sku,
            currency: 'EUR',
            sellingPriceMinor: variantPriceMinor,
            ...variantSyncData,
          },
        });
      }
    }

    await syncProductImagesFromShopify(tx, tenantId, existing.id, remote.images);

    // ── B2 · lo storico anche sul RI-SYNC ────────────────────────────────
    //
    // ⚠️ **Non solo al primo import**: un prodotto già in VestiFlow che
    //    arriva da un webhook deve avere la sua identità come gli altri, e le
    //    varianti comparse dopo devono trovare la loro. Idempotente: una
    //    seconda passata non aggiunge niente.
    await this.registraStorico(tx, tenantId, existing.id, remote, ingresso, titoloShopify, rifiutate);

    return 'updated';
  }

  /**
   * B5-B6 · il motivo per cui questo articolo NON si crea, o `null`.
   *
   * ⚠️ **Senza negozio identificato non c'è storico da interrogare**, e la
   *    risposta è `null`: una connessione preesistente non migrata continua a
   *    importare esattamente come prima. È lo stesso passaggio graduale di B2.
   */
  private async verificaCreazioneAmmessa(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopifyProductId: string,
  ): Promise<{ readonly shopId: string; readonly verdetto: Rifiuto } | null> {
    const shopId = await this.storico.negozioDelTenant(tx, tenantId);
    if (!shopId) {
      return null;
    }
    const verdetto = await this.storico.siPuoCreareProdotto(tx, {
      shopId,
      shopifyProductGid: gidProdotto(shopifyProductId),
    });
    return verdetto.tipo === 'si_crea' ? null : { shopId, verdetto };
  }

  /**
   * §10.3 · la riga di registro di un rifiuto dell'import.
   *
   * ⭐ **Una riga sola, `rifiutata`, con la correlazione dell'INGRESSO**: il
   *    rifiuto è una decisione già presa, non un'operazione in corso — niente
   *    `tentativo`. L'attore è il processo (`pull` o `webhook`), mai una
   *    persona; il negozio è il `shop_gid` dello storico; il motivo è la regola
   *    per nome. ⛔ Mai il payload del webhook.
   *
   * ⛔ **La riga si scrive FUORI dalla transazione dell'import** (il registro
   *    usa una connessione propria): un rollback successivo dell'import non la
   *    cancella, perché il rifiuto è stato osservato comunque. E se la riga
   *    NON si scrive, l'eccezione risale da qui — dentro la transazione, prima
   *    del commit — e l'import cade dicendolo: nessun effetto senza traccia.
   *    `tx` serve solo a leggere il negozio nella stessa vista dell'import.
   */
  private async registraRifiuto(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ingresso: Ingresso,
    shopId: string,
    dati: {
      readonly operation: PlatformAuditOperation;
      readonly entityId: string | null;
      readonly entityLabel: string;
      readonly remoteGid: string;
      readonly detail: string;
    },
  ): Promise<void> {
    const negozio = await tx.shopifyShop.findUnique({
      where: { id: shopId },
      select: { shopGid: true },
    });
    await this.registro.registraRifiuto(
      {
        tenantId,
        attore: { tipo: ingresso.attore },
        operation: dati.operation,
        shopGid: negozio?.shopGid ?? null,
        entityId: dati.entityId,
        entityLabel: dati.entityLabel.slice(0, 200),
        remoteGid: dati.remoteGid,
      },
      dati.detail,
      ingresso.correlationId,
    );
  }

  /**
   * B2 · scrive identità e periodi di un prodotto importato e delle sue varianti.
   *
   * ⛔ **Non fa fallire l'import**, e la ragione è dichiarata in `DA-FARE`:
   *    «il rifiuto NON ferma il lotto». Un GID già di un altro articolo o
   *    un'identità eliminata localmente sono esiti previsti: si registrano nel
   *    log e si prosegue, esattamente come l'import faceva prima che questo
   *    codice esistesse.
   *
   * ⚠️ **Il divieto di ricreazione NON è qui.** Che un prodotto eliminato
   *    definitivamente non debba nemmeno essere reimportato è B5-B6: oggi
   *    l'articolo viene importato come sempre, e a non essere scritto è solo il
   *    collegamento. Confondere le due cose farebbe sembrare risolto un divieto
   *    che non c'è.
   */
  private async registraStorico(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    remote: ShopifyAdminProduct,
    ingresso: Ingresso,
    etichetta: string,
    /** 26.7 · GID già rifiutati dal chiamante: si saltano senza registrarli di nuovo. */
    rifiutate: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const shopId = await this.storico.negozioDelTenant(tx, tenantId);
    if (!shopId) {
      // ⭐ Connessione preesistente non ancora migrata: nessuno storico, e
      //    l'import prosegue com'è sempre stato. È il passaggio graduale.
      return;
    }

    const esito = await this.storico.registraProdotto(tx, {
      tenantId,
      shopId,
      productId,
      shopifyProductGid: gidProdotto(remote.id),
    });
    if (esito.tipo !== 'registrato') {
      this.logger.warn(
        `Storico Shopify non scritto per il prodotto ${remote.id}: ${esito.tipo}. ` +
          "L'import prosegue.",
      );
      // ⭐ §10.3 · il RIAGGANCIO rifiutato è nel registro. L'anagrafica è stata
      //    trovata per colonna-cache e aggiornata (B5a-bis lo consente); a essere
      //    rifiutato è il collegamento — chiuso, o su un'identità eliminata, o
      //    di un'altra anagrafica. Non è `import_prodotto_rifiutato`: l'import
      //    è andato a buon fine, e dirne il contrario sarebbe falso.
      //
      // ⚠️ UNA riga, sul prodotto: le varianti non si esaminano (il `return` qui
      //    sotto viene prima del ciclo), perché senza il padre agganciato nessuna
      //    figlia può esserlo — la FK `padre_attivo` lo impone. Il loro rifiuto è
      //    implicito in quello del prodotto, e non si registra due volte.
      await this.registraRifiuto(tx, tenantId, ingresso, shopId, {
        operation: PlatformAuditOperation.riaggancio_rifiutato,
        entityId: productId,
        entityLabel: etichetta,
        remoteGid: gidProdotto(remote.id),
        detail: `${esito.tipo}: ${MOTIVO_RIAGGANCIO[esito.tipo]}`,
      });
      return;
    }

    const varianti = await tx.productVariant.findMany({
      where: { tenantId, productId },
      select: { id: true, shopifyVariantId: true, shopifyInventoryItemId: true },
    });
    const perGid = new Map(
      varianti
        .filter((variante) => variante.shopifyVariantId)
        .map((variante) => [gidVariante(variante.shopifyVariantId!), variante]),
    );

    for (const variante of remote.variants) {
      const gid = gidVariante(variante.id);
      // ⭐ 26.7 · già rifiutata dal ciclo di aggiornamento: è lo STESSO rifiuto,
      //    e registrarlo due volte per la stessa consegna sarebbe rumore.
      if (rifiutate.has(gid)) {
        continue;
      }
      const locale = perGid.get(gid);
      if (!locale) {
        // ⚠️ Nessuna variante locale con quel collegamento: può succedere se lo
        //    SKU non era abbinabile. Non è un errore dell'import.
        continue;
      }
      const esitoVariante = await this.storico.registraVariante(tx, {
        tenantId,
        shopId,
        productIdentityId: esito.identityId,
        productLinkId: esito.linkId,
        productId,
        variantId: locale.id,
        shopifyVariantGid: gid,
        shopifyInventoryItemGid: gidArticoloInventario(
          variante.inventory_item_id ?? locale.shopifyInventoryItemId,
        ),
      });
      if (esitoVariante !== 'registrato' && esitoVariante !== 'gia_agganciata') {
        // ⭐ §10.3 · lo stesso, PER VARIANTE: la riga è stata trovata per
        //    colonna-cache e aggiornata, il riaggancio è rifiutato.
        await this.registraRifiuto(tx, tenantId, ingresso, shopId, {
          operation: PlatformAuditOperation.riaggancio_rifiutato,
          entityId: locale.id,
          entityLabel: `${etichetta} · ${variante.title ?? String(variante.id)}`,
          remoteGid: gid,
          detail: `${esitoVariante}: ${MOTIVO_RIAGGANCIO[esitoVariante]}`,
        });
      }
    }
  }

  /**
   * «Questo prodotto è spento?» — la decisione sta qui, e la leggono tutti i
   * punti che la applicano: i due ingressi e `importProduct`.
   */
  private isSyncSpenta(snapshot: { readonly shopifySyncEnabled: boolean } | null): boolean {
    return snapshot?.shopifySyncEnabled === false;
  }

  /**
   * Lo stesso, per chi il prodotto non l'ha ancora in mano: costa una query, e
   * si paga PRIMA di `enrichProduct` — che altrimenti interroga Shopify per un
   * prodotto che stiamo per ignorare, e fallendo fa scrivere l'errore addosso.
   */
  private async syncSpentaPerRemoto(tenantId: string, shopifyProductId: string): Promise<boolean> {
    return this.isSyncSpenta(
      await this.prisma.product.findFirst({
        where: { tenantId, shopifyProductId },
        select: { shopifySyncEnabled: true },
      }),
    );
  }

  private async recordProductImportError(
    tenantId: string,
    shopifyProductId: string,
    message: string,
  ): Promise<void> {
    // ⛔ Difesa in profondità: se un percorso non ancora previsto arrivasse qui
    //    con un prodotto spento, il filtro impedisce comunque la scrittura.
    await this.prisma.product.updateMany({
      where: { tenantId, shopifyProductId, shopifySyncEnabled: true },
      data: {
        shopifySyncStatus: ShopifySyncStatus.error,
        shopifyLastError: message.slice(0, 500),
      },
    });
  }

  /** Gli SKU già presi nel tenant — letti su `tx`, a lock preso, come tutto il resto. */
  private async loadTenantSkus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludeProductId?: string,
  ): Promise<Set<string>> {
    const rows = await tx.productVariant.findMany({
      where: {
        tenantId,
        sku: { not: null },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { sku: true },
    });
    return new Set(
      rows
        .map((row) => row.sku)
        .filter((sku): sku is string => Boolean(sku))
        .map((sku) => sku.toLowerCase()),
    );
  }

  private resolveImportSku(
    reserved: Set<string>,
    rawSku: string | null,
    shopifyVariantId: number,
  ): string {
    const trimmed = rawSku?.trim();
    if (trimmed && !reserved.has(trimmed.toLowerCase())) {
      return trimmed;
    }
    const fallback = trimmed ? `${trimmed}-${shopifyVariantId}` : `SHOPIFY-${shopifyVariantId}`;
    if (!reserved.has(fallback.toLowerCase())) {
      return fallback;
    }
    return `SHOPIFY-${shopifyVariantId}-${Date.now()}`;
  }

  private mapOptions(remote: ShopifyAdminProduct): { name: string; values: string[] }[] {
    return (remote.options ?? [])
      .filter((option) => option.name !== 'Title' || (option.values?.length ?? 0) > 1)
      .slice(0, 3)
      .map((option) => ({
        name: option.name,
        values: [...(option.values ?? [])],
      }));
  }

  private mapVariantOptions(
    remote: ShopifyAdminProduct,
    variant: ShopifyAdminProduct['variants'][number],
  ): VariantOptionRow[] {
    const options = this.mapOptions(remote);
    if (options.length === 0) {
      return [{ name: 'Title', value: variant.title ?? 'Default Title' }];
    }

    const values = [variant.option1, variant.option2, variant.option3];
    return options.flatMap((option, index) => {
      const value = values[index];
      return value ? [{ name: option.name, value }] : [];
    });
  }

  private mapStatus(status: string): ProductStatus {
    switch (status) {
      case 'active':
        return ProductStatus.active;
      case 'archived':
        return ProductStatus.archived;
      default:
        return ProductStatus.draft;
    }
  }

  private normalizeWebhookProduct(payload: Record<string, unknown>): ShopifyAdminProduct | null {
    if (payload.id == null) {
      return null;
    }
    return payload as unknown as ShopifyAdminProduct;
  }
}
