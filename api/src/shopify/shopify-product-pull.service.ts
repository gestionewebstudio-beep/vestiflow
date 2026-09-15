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
} from '../products/catalog-origin.util';
import { ImageArchiveService } from '../media/image-archive.service';
import { sincronizzaImmaginiDaShopify } from '../products/product-images.sync';
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
import {
  adottaIdentitaRecuperata,
  serializzaPerProdottoRemoto,
} from './shopify-identita-adozione.util';
import { ShopifyClaimSuperatoException } from './shopify-identita-catalogo.util';
import type { ProductShopifyEnrichment } from './shopify-product-metadata.types';
import { PRODUCT_IMPORT_TX } from './shopify-product-metadata.types';
import {
  categoryMetafieldsSyncErrorMessage,
  countCategoryMetafieldsWithValues,
  parseCategoryMetafieldsJson,
  resolveImportedShopifyCategoryMetafields,
  resolveImportedShopifyMetafields,
} from './shopify-category-metafields.util';
import { decidiCodiciImport, testoAnomalieImport } from './shopify-import-codici.util';
import { parseShopifyTags } from './shopify-product-metadata.util';
import { shopifyDecimalToMinor } from './shopify-money.util';
import { shopifyBodyHtmlToPlainText } from './shopify-html.util';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { toShopifyUserMessage } from './shopify-user-error.util';
import type { GuardiaCorsia } from './shopify-webhook-corsia.util';
import {
  motivoArticoloInSincronizzazione,
  NotificaDaRinviareException,
} from './shopify-notifica-rinviata.exception';
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
  /**
   * ⭐ Quanti prodotti remoti il CHIAMANTE ha chiesto di lasciare fuori
   *    (`opzioni.escludi`): la prima connessione ci mette gli ambigui (`docs/27`
   *    §4). Contati a parte da `skipped`, che è una decisione dell’import.
   */
  readonly esclusiDalChiamante: number;
}

/** Le opzioni di un lotto di import: oggi solo chi resta fuori. */
export interface OpzioniPullCatalogo {
  /** Id numerici Shopify dei prodotti da NON importare, decisi dal chiamante. */
  readonly escludi?: ReadonlySet<string>;
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
  /** La guardia di proprietà del lavoratore della coda webhook (docs/30 §7.1.2); assente negli import. */
  readonly guardia?: GuardiaCorsia;
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

/**
 * Serializzazione con le chiavi ORDINATE, per confrontare due JSON.
 *
 * ⚠️ Le colonne `Json` di Prisma sono `jsonb`, e Postgres **riordina le
 *    chiavi**: confrontare `JSON.stringify` così com’è direbbe «diverso» a
 *    ogni giro solo per l’ordine, e il confronto non servirebbe a niente.
 */
function canonico(valore: unknown): string {
  return JSON.stringify(valore, (_chiave, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  );
}

/**
 * La colonna contiene GIÀ questo valore?
 *
 * ⛔ **Non è un arbitraggio dei conflitti.** Non confronta istanti, non
 *    stabilisce chi ha scritto per ultimo e non fa vincere nessuno: risponde
 *    solo alla domanda «c’è qualcosa da scrivere?».
 *
 * ⚠️ **È CONSERVATIVO: nel dubbio risponde «diverso»**, e si scrive come
 *    prima. Un falso «uguale» perderebbe una modifica in silenzio — molto
 *    peggio di una scrittura di troppo.
 */
/** Un Decimal di Prisma si riconosce dal suo `toNumber()` (decimal.js). */
function haToNumber(valore: unknown): boolean {
  return typeof (valore as { toNumber?: unknown }).toNumber === 'function';
}

function valoreIdentico(nuovo: unknown, vecchio: unknown): boolean {
  if (nuovo === vecchio) {
    return true;
  }
  if (nuovo == null || vecchio == null) {
    return false;
  }
  // I prezzi arrivano come numero e tornano come Decimal: senza questo ramo
  // nessun articolo con un prezzo risulterebbe mai identico a se stesso.
  if (haToNumber(nuovo) || haToNumber(vecchio)) {
    return Number(nuovo) === Number(vecchio);
  }
  if (nuovo instanceof Date || vecchio instanceof Date) {
    return false;
  }
  if (typeof nuovo === 'object' || typeof vecchio === 'object') {
    return canonico(nuovo) === canonico(vecchio);
  }
  return false;
}

/**
 * ⛔ **Un webhook che non cambia niente non deve scrivere niente.**
 *
 * L’effetto non era innocuo, ed è misurato: `@updatedAt` si sposta in avanti a
 * ogni scrittura, e l’elenco catalogo è ordinato `updatedAt: desc`
 * (`products.service.ts`). Un articolo che nessuno ha toccato saltava quindi in
 * cima, spingendo giù quelli modificati davvero.
 *
 * ⚠️ `shopifyLastSyncAt` è ESCLUSO dal confronto perché è sempre diverso — è
 *    `new Date()`. Ne discende che quando non cambia niente non si sposta: da
 *    oggi segna **l’ultima sincronizzazione che ha cambiato qualcosa**, non
 *    l’ultimo webhook ricevuto. È dichiarato, non un effetto collaterale.
 */
function nullaDaScrivere(
  dati: Record<string, unknown>,
  esistente: Record<string, unknown>,
  escluse: readonly string[],
): boolean {
  return Object.entries(dati).every(
    ([campo, valore]) => escluse.includes(campo) || valoreIdentico(valore, esistente[campo]),
  );
}

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
    /** L'archivio immagini: la copia locale, cosi' l'articolo non dipende dal CDN. */
    private readonly archivioImmagini: ImageArchiveService,
  ) {}

  async pullCatalog(
    tenantId: string,
    opzioni: OpzioniPullCatalogo = {},
  ): Promise<ShopifyCatalogSyncResult> {
    const inflight = this.catalogPullInFlight.get(tenantId);
    if (inflight) {
      this.logger.log(`Import catalogo già in corso (${tenantId}): join richiesta parallela`);
      return inflight;
    }

    const job = this.executePullCatalog(tenantId, opzioni).finally(() => {
      this.catalogPullInFlight.delete(tenantId);
    });
    this.catalogPullInFlight.set(tenantId, job);
    return job;
  }

  private async executePullCatalog(
    tenantId: string,
    opzioni: OpzioniPullCatalogo,
  ): Promise<ShopifyCatalogSyncResult> {
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
    let esclusiDalChiamante = 0;
    const failed: { shopifyProductId: string; message: string }[] = [];
    // ⭐ UNA correlazione per il LOTTO: ogni rifiuto di questo giro la porta.
    const ingresso: Ingresso = { attore: PlatformAuditActor.pull, correlationId: randomUUID() };

    for (const remote of remoteProducts) {
      // ⛔ Deciso dal chiamante, PRIMA di ogni lettura: un ambiguo della prima
      //    connessione non si importa e non si arricchisce (`docs/27` §4).
      if (opzioni.escludi?.has(String(remote.id))) {
        esclusiDalChiamante += 1;
        continue;
      }
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
        this.logger.error(
          `Import Shopify fallito (${tenantId}, prodotto ${remote.id}): ${message}`,
        );
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
      esclusiDalChiamante,
      failed,
    };
  }

  async importProductFromWebhook(
    tenantId: string,
    payload: Record<string, unknown>,
    guardia?: GuardiaCorsia,
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

    // ⭐ Il costo si chiede SOLO per le varianti che VestiFlow non ha ancora: in
    //    aggiornamento è l'unico posto in cui si scrive (`tx.productVariant.create`,
    //    §9.11), e ogni costo è una chiamata REST a ≥ 500 ms — otto varianti bastavano
    //    a superare i 5 s del webhook per un valore scartato (`docs/30` #2). Il
    //    riconoscimento è lo stesso dell'aggiornamento: `shopifyVariantId` sulle
    //    varianti locali del prodotto. Prodotto sconosciuto = prima importazione = tutte.
    const variantiNuove = await this.variantiRemoteNonAncoraLocali(tenantId, remote);
    // ⛔ Un lavoratore della coda già superato non chiama Shopify nemmeno in lettura:
    //    la lettura non è un effetto, ma è evitabile col controllo che esiste già.
    await guardia?.assicura(this.prisma);
    let enrichment: ProductShopifyEnrichment | undefined;
    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      enrichment = await this.shopifyEnrichment.enrichProduct(shopDomain, accessToken, remote, {
        fetchVariantCosts: variantiNuove.size > 0,
        variantCostsFor: variantiNuove,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enrichment webhook fallito';
      this.logger.warn(`Enrichment webhook prodotto ${remote.id}: ${message}`);
    }

    // ⭐ UNA correlazione per la CONSEGNA: nasce qui, all'ingresso, e scende
    //    fino alle righe di registro. ⛔ Non è l'id di consegna di Shopify (la
    //    ricevuta della coda lo conserva a parte) e non lo si inventa.
    const ingresso: Ingresso = {
      attore: PlatformAuditActor.webhook,
      correlationId: randomUUID(),
      ...(guardia ? { guardia } : {}),
    };
    try {
      return await this.importProduct(tenantId, remote, enrichment, ingresso);
    } catch (error: unknown) {
      if (error instanceof NotificaDaRinviareException) {
        // Non è un errore dell'articolo: lo stato resta quello che è (`syncing`), e il
        // motivo lo porta la ricevuta.
        throw error;
      }
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
  /**
   * RICONOSCE un remoto non ancora collegato che porti l'identità VestiFlow
   * (`vestiflow.product_id`), prima di importarlo come nuovo (docs/30 §7.2-bis).
   *
   * ⛔ Senza questo passo un webhook anticipato — o un pull del catalogo dopo un tentativo
   *    morto — troverebbe `existing` nullo e creerebbe un DOPPIONE locale del prodotto
   *    che VestiFlow stesso ha appena creato. L'identità si RILEGGE da Shopify per gid
   *    (il payload non la porta): una lettura fallita fa fallire l'import, non vale
   *    «assente».
   *
   *   - nessun prodotto del tenant non collegato con un tentativo di creazione alle spalle
   *     (`claim_version > 0`), oppure identità assente o di nessun prodotto del tenant →
   *     `estraneo`: import normale, e nel primo caso senza nemmeno la rilettura;
   *   - prodotto del tenant senza `shopifyProductId` e claim APERTO verso il negozio della
   *     connessione → `adottato`: gli id si scrivono sotto il lock con la `claim_version`
   *     (lo stesso codice del recupero nel push), e l'import prosegue come per un prodotto
   *     collegato — il push in corso lo trova `syncing` e lo salta;
   *   - prodotto del tenant SENZA claim aperto, verso un altro negozio, o già collegato a
   *     un altro remoto → `rifiutato`: nessun import, una riga nel registro; sarà il push
   *     successivo, che rilegge l'identità, ad adottarlo.
   */
  private async riconosciCreazioneVestiflow(
    tenantId: string,
    remote: ShopifyAdminProduct,
    ingresso: Ingresso,
  ): Promise<'estraneo' | 'adottato' | 'rifiutato'> {
    const legacyId = String(remote.id);
    const collegato = await this.prisma.product.findFirst({
      where: { tenantId, shopifyProductId: legacyId },
      select: { id: true },
    });
    if (collegato) {
      return 'estraneo';
    }
    // ⭐ La rilettura costa una chiamata: si fa solo se nel tenant esiste un prodotto NON
    //    collegato che abbia mai tentato una creazione (`claim_version > 0`: claim aperto
    //    di un tentativo vivo o morto, oppure chiuso da un tentativo finito male). Senza,
    //    nessun remoto può portare un'identità di questo tenant che non sia già collegata.
    const candidatiPossibili = await this.prisma.product.count({
      where: { tenantId, shopifyProductId: null, shopifyCreateClaimVersion: { gt: 0 } },
    });
    if (candidatiPossibili === 0) {
      return 'estraneo';
    }
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const productGid = `gid://shopify/Product/${legacyId}`;
    const identita = await this.shopifyEnrichment.identitaVestiflowDelProdotto(
      shopDomain,
      accessToken,
      productGid,
    );
    if (!identita) {
      return 'estraneo';
    }
    const candidato = await this.prisma.product.findFirst({
      where: { id: identita, tenantId },
      select: {
        id: true,
        name: true,
        shopifyProductId: true,
        shopifyCreateClaimId: true,
        shopifyCreateClaimShopId: true,
        shopifyCreateClaimVersion: true,
      },
    });
    if (!candidato) {
      // Un'identità che non è di questo tenant: non nostra, si importa come sempre.
      return 'estraneo';
    }
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    const claimAperto =
      candidato.shopifyProductId === null &&
      candidato.shopifyCreateClaimId !== null &&
      shopId !== null &&
      candidato.shopifyCreateClaimShopId === shopId;
    if (!claimAperto) {
      const motivo =
        candidato.shopifyProductId !== null
          ? `porta l'identità di «${candidato.name}», già collegato al prodotto Shopify ${candidato.shopifyProductId}`
          : `porta l'identità di «${candidato.name}» ma nessuna creazione è in corso verso questo negozio`;
      this.logger.warn(
        `Import Shopify rifiutato: il prodotto remoto ${legacyId} ${motivo}. Nessun doppione locale; sarà la pubblicazione a rileggerlo.`,
      );
      if (shopId) {
        await this.registraRifiuto(this.prisma, tenantId, ingresso, shopId, {
          operation: PlatformAuditOperation.import_prodotto_rifiutato,
          entityId: candidato.id,
          entityLabel: candidato.name,
          remoteGid: productGid,
          detail: `identita_vestiflow_senza_claim: ${motivo}`,
        });
      }
      return 'rifiutato';
    }
    // Le varianti remote, fuori dalla transazione: nessuna rete sotto il lock.
    const varianti = await this.shopifyEnrichment.variantiConIdentita(
      shopDomain,
      accessToken,
      productGid,
    );
    try {
      const esito = await this.prisma.$transaction(async (tx) => {
        await ingresso.guardia?.assicura(tx);
        const product = await tx.product.findFirst({
          where: { id: candidato.id, tenantId },
          select: { id: true, tenantId: true, variants: { select: { id: true } } },
        });
        if (!product) {
          return null;
        }
        return adottaIdentitaRecuperata(tx, this.storico, this.logger, {
          product,
          versione: candidato.shopifyCreateClaimVersion,
          legacyId,
          remote: varianti,
        });
      }, PRODUCT_IMPORT_TX);
      if (!esito) {
        return 'rifiutato';
      }
      this.logger.log(
        `Webhook Shopify anticipato: prodotto ${legacyId} adottato come ${candidato.id} (${esito.abbinate.length} varianti per identità, ${esito.localiSenzaRemota.length} ancora da completare).`,
      );
      return 'adottato';
    } catch (error: unknown) {
      if (error instanceof ShopifyClaimSuperatoException) {
        // Il push ha salvato (o un tentativo nuovo ha rivendicato) nel frattempo: fa lui.
        return 'adottato';
      }
      throw error;
    }
  }

  private async importProduct(
    tenantId: string,
    remote: ShopifyAdminProduct,
    enrichment: ProductShopifyEnrichment | undefined,
    ingresso: Ingresso,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const shopifyProductId = String(remote.id);
    if ((await this.riconosciCreazioneVestiflow(tenantId, remote, ingresso)) === 'rifiutato') {
      return 'skipped';
    }
    const esito = await this.prisma.$transaction(async (tx) => {
      await ingresso.guardia?.assicura(tx);
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

    if (esito !== 'skipped') {
      // L'immagine si scarica DOPO il commit del prodotto: chi è stato superato nel
      // frattempo non scarica (la guardia c'è solo nel percorso del webhook).
      await ingresso.guardia?.assicura(this.prisma);
      await this.sincronizzaImmagine(tenantId, shopifyProductId, remote);
    }
    return esito;
  }

  /**
   * Le IMMAGINI, fuori dalla transazione.
   *
   * ⛔ **Archiviare vuol dire scaricare**, e questa classe tiene la rete fuori
   *    dalla transazione di import: dentro ci sono il lock e le scritture, e
   *    un download da venti secondi le terrebbe aperte per tutto quel tempo.
   *
   * ⚠️ **Un’anomalia qui non fa fallire l’import.** L’articolo è già entrato,
   *    e un link caduto non è una rimozione: si registra e si prosegue.
   *
   * ⛔ **E qui non si cancella niente**: cancellare su Shopify non cancella in
   *    VestiFlow (regola cambiata l’11/09/2026, sostituisce la precedente).
   */
  private async sincronizzaImmagine(
    tenantId: string,
    shopifyProductId: string,
    remote: ShopifyAdminProduct,
  ): Promise<void> {
    const prodotto = await this.prisma.product.findFirst({
      where: { tenantId, shopifyProductId },
      select: { id: true },
    });
    if (!prodotto) {
      return;
    }

    const esito = await sincronizzaImmaginiDaShopify(
      this.prisma,
      this.archivioImmagini,
      tenantId,
      prodotto.id,
      remote.images,
    );

    if (esito.anomalie.length > 0) {
      this.logger.warn(
        `Immagini non archiviate (${tenantId}/${prodotto.id}): ` + esito.anomalie.join(' · '),
      );
    }
  }

  /**
   * Gli id remoti delle varianti del payload che NON hanno ancora una variante locale
   * (stesso criterio di `byShopifyVariantId` in aggiornamento).
   *
   * ⚠️ Lettura FUORI dal lock, e va bene così: decide solo per quali varianti chiedere
   *    il costo. Se una variante nasce in locale fra questa lettura e il lock, il costo
   *    letto si scarta (§9.11); se viene tolta, la variante rinasce senza costo, come
   *    nell'import massivo (`fetchVariantCosts: false`). Nessun effetto in più.
   */
  private async variantiRemoteNonAncoraLocali(
    tenantId: string,
    remote: ShopifyAdminProduct,
  ): Promise<ReadonlySet<number>> {
    const locali = await this.prisma.productVariant.findMany({
      where: { tenantId, product: { shopifyProductId: String(remote.id) } },
      select: { shopifyVariantId: true },
    });
    const note = new Set(locali.map((v) => v.shopifyVariantId).filter((id) => id !== null));
    return new Set(remote.variants.filter((v) => !note.has(String(v.id))).map((v) => v.id));
  }

  /** Il lock transazionale su `(tenant, prodotto remoto)`: chi arriva secondo aspetta. */
  private async serializzaImport(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopifyProductId: string,
  ): Promise<void> {
    // ⭐ Lo STESSO lock dell'adozione degli id dal push (`shopify-identita-adozione.util`):
    //    import, adozione dal webhook e recupero dal push si serializzano fra loro.
    await serializzaPerProdottoRemoto(tx, tenantId, shopifyProductId);
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
      // ⭐ Dal webhook NON si salta: la notifica si RINVIA (D8(b)). «Elaborata senza
      //    effetto» era una perdita muta; la coda la ritenta con le attese approvate e,
      //    esauriti i tentativi, la mostra fallita col motivo. Dall'import massivo resta
      //    un salto: là il chiamante conta gli esiti e ripasserà.
      if (ingresso.attore === PlatformAuditActor.webhook) {
        throw new NotificaDaRinviareException(motivoArticoloInSincronizzazione(existing.name));
      }
      this.logger.debug(
        `Import saltato: sync VestiFlow→Shopify in corso (${shopifyProductId})`,
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

    // ⛔ **Qui c’era la guardia d’ORIGINE**, e per un prodotto nato in
    //    VestiFlow aggiornava il solo `shopifyTitle` prima di uscire: nessun
    //    campo bidirezionale tornava indietro. Le regole per campo di
    //    `docs/24` §9 **non guardano dove è nato l’articolo** (§9.12): decide
    //    il campo, non la provenienza — e la guardia è stata SOSTITUITA, non
    //    tolta. Ciò che resta di VestiFlow resta tale per tutti:
    //
    //      Product.name          fuori da `productData`, come sempre
    //      articleCode           fuori, scritto solo alla creazione
    //      category              fuori: categoria INTERNA (§9.5)
    //      purchasePriceMinor    fuori dall’UPDATE: comanda VestiFlow (§9.11)
    //      sellingPriceMinor     fuori: il prezzo articolo è dell’operatore
    //
    // ⚠️ `isVestiflowCatalogOwner` resta, e serve ancora: decide `catalogOrigin`
    //    e `shopifyCatalogLinkKind`, cioè la PROVENIENZA. Quella è un’altra
    //    domanda, e non autorizza più nessuna scrittura.
    const categorySyncError = categoryMetafieldsSyncErrorMessage(
      countCategoryMetafieldsWithValues(localCategoryMetafields),
      countCategoryMetafieldsWithValues(importedCategoryMetafields),
      existing?.shopifyLastError,
    );

    // ── SKU e barcode: decisi UNA volta, prima del prodotto ──────────────────
    //
    // ⭐ D5 / difetto 26.1: un barcode già presente altrove faceva cadere
    //    l'INSERT e l'intero prodotto finiva fra i `failed`. Ora la variante entra
    //    senza quel barcode e il prodotto lo DICE (`shopifyLastError`, stato
    //    `out_of_sync`), come già per la categoria: importato e segnalato.
    //    Gli SKU presi ricevono il suffisso di sempre, e da oggi anche loro si
    //    segnalano. Letto a lock preso, escluse le varianti di questo prodotto.
    const [skuPresi, barcodePresi] = await Promise.all([
      this.loadTenantSkus(tx, tenantId, existing?.id),
      this.loadTenantBarcodes(tx, tenantId, existing?.id),
    ]);
    const codici = decidiCodiciImport(remote.variants, skuPresi, barcodePresi);
    const erroreImport = testoAnomalieImport(categorySyncError, codici.anomalie);
    if (codici.anomalie.length > 0) {
      this.logger.warn(
        `Import Shopify con anomalie di codici (${tenantId}/${shopifyProductId}): ${codici.anomalie.join(' · ')}`,
      );
    }
    // ⭐ Il titolo remoto è il NOME SHOPIFY, e da qui in poi solo quello: il nome
    //    interno appartiene a chi lavora in magazzino, e un ri-sync non glielo
    //    riscrive più (docs/24 §1.9). `name` sta fuori dall'allowlist apposta —
    //    stesso pattern del codice articolo — e lo aggiunge la sola creazione.
    const productData = {
      shopifyTitle: titoloShopify,
      description: shopifyBodyHtmlToPlainText(remote.body_html),
      brand: remote.vendor?.trim() || null,
      // ⛔ **`category` NON è più qui**, ed è il cuore della separazione: la
      //    categoria VestiFlow è una classificazione di magazzino, presa dal
      //    vocabolario di `catalog_categories`, e Shopify non la sovrascrive
      //    in nessun percorso (docs/24 §9.5). Fino all’11/09/2026 ci finiva
      //    dentro `product_type`, e i due valori non si distinguevano più.
      shopifyProductType: remote.product_type?.trim() || null,
      shopifyTaxonomyCategoryId:
        enrichment?.taxonomyCategoryId ?? existing?.shopifyTaxonomyCategoryId ?? null,
      shopifyTaxonomyCategoryFullName:
        enrichment?.taxonomyCategoryFullName ?? existing?.shopifyTaxonomyCategoryFullName ?? null,
      season: enrichment?.season ?? existing?.season ?? null,
      tags: [...tags],
      // ⛔ **`enrichment` ASSENTE non e' «Shopify dice che non c'e'»: e' «non
      //    lo so».** L'arricchimento e' una chiamata a parte e puo' cadere; il
      //    codice la registra e prosegue, ed e' giusto. Ma scrivere l'esito
      //    assente come `null` o come elenco vuoto CANCELLA dati che nessuno
      //    ha cancellato — un guasto di rete che si traveste da modifica.
      //
      // ⭐ **La distinzione e' il ternario, non il `??`**: con l'oggetto in mano
      //    si usa il suo valore **anche se e' `null`** — quella e' una
      //    cancellazione RICEVUTA, e va applicata. Senza l'oggetto si conserva.
      //
      // ⚠️ Tassonomia, stagione e metafield qui sotto ripiegavano gia' su
      //    `existing`: erano tre campi protetti e tre no, nello stesso oggetto.
      seoTitle: enrichment ? enrichment.seoTitle : (existing?.seoTitle ?? null),
      seoDescription: enrichment ? enrichment.seoDescription : (existing?.seoDescription ?? null),
      shopifyCollections: (enrichment
        ? enrichment.collections
        : (existing?.shopifyCollections ?? [])) as unknown as Prisma.InputJsonValue,
      shopifyMetafields: resolveImportedShopifyMetafields(
        enrichment?.metafields,
        existing?.shopifyMetafields,
      ) as unknown as Prisma.InputJsonValue,
      shopifyCategoryMetafields: importedCategoryMetafields as unknown as Prisma.InputJsonValue,
      status,
      options: options as unknown as Prisma.InputJsonValue,
      shopifyProductId,
      shopifySyncStatus: erroreImport ? ShopifySyncStatus.out_of_sync : ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: erroreImport,
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
        const { sku, barcode } = codici.perVariante.get(variant.id)!;
        const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
        await tx.productVariant.create({
          data: {
            tenantId,
            productId: product.id,
            sku,
            optionValues: this.mapVariantOptions(remote, variant),
            barcode,
            currency: 'EUR',
            sellingPriceMinor: variantPriceMinor,
            shopifyPriceMinor: variantPriceMinor,
            purchasePriceMinor: enrichment?.variantPurchasePriceMinor.get(variant.id) ?? 0,
            shopifyVariantId: String(variant.id),
            shopifyInventoryItemId: String(variant.inventory_item_id),
          },
        });
      }

      // ⛔ Le immagini NON si sincronizzano qui: questa transazione dichiara
      //    di non fare rete, e archiviare una copia significa scaricarla. Ci
      //    pensa `importProduct` a giro chiuso.

      // ── B2 · lo STORICO, nella stessa transazione delle colonne-cache ──
      //
      // ⭐ **Qui dentro e non dopo**: se la transazione cade, non deve restare
      //    un'identità che dichiara un collegamento mai avvenuto. Le colonne
      //    `shopifyProductId` / `shopifyVariantId` restano dove sono — sono la
      //    cache, e questa è la storia.
      await this.registraStorico(tx, tenantId, product.id, remote, ingresso, titoloShopify);
      return 'imported';
    }

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

    const datiProdotto = {
      ...productData,
      // Ri-sync: si aggiorna SOLO il prezzo Shopify (dalla prima variante).
      // Il prezzo articolo (gestionale) è dell'operatore, non si tocca più.
      // Il barrato è dell'articolo ma resta sincronizzato (una sola versione).
      shopifyPriceMinor: firstRemote ? shopifyDecimalToMinor(firstRemote.price ?? '0') : 0,
      compareAtPriceMinor: firstRemote?.compare_at_price
        ? shopifyDecimalToMinor(firstRemote.compare_at_price)
        : null,
      // ⛔ **Il costo NON si scrive negli aggiornamenti: lo comanda
      //    VestiFlow** (docs/24 §9.11). Lo determina l’arrivo merce, e da lui
      //    dipende il margine di ogni report.
      //
      // ⚠️ Qui il costo Shopify VINCEVA su quello locale quando
      //    l’arricchimento c’era; il ripiego su `existing` aggiunto il 10/09
      //    chiudeva l’azzeramento, non la direzione. Ora il campo esce
      //    proprio dall’allowlist: non passa nemmeno il valore identico.
      //
      // ⭐ La PRIMA importazione è un’altra cosa e resta dov’era, nel ramo di
      //    creazione: è «da definire nel percorso iniziale» (§9.12), non
      //    vietata, e le due non si prestano gli argomenti.
    };

    // ⛔ **Niente da scrivere = nessuna scrittura**, e non è un’ottimizzazione:
    //    `updatedAt` ordina l’elenco catalogo, quindi un webhook a vuoto faceva
    //    saltare in cima un articolo che nessuno aveva toccato.
    //
    // ⚠️ Non è un arbitraggio: non si confrontano istanti e non vince nessuno.
    //    Si guarda solo se la colonna contiene già quel valore (§9.1, «la
    //    sincronizzazione di ritorno non crea cicli»).
    const prodottoFermo = nullaDaScrivere(datiProdotto, existing, ['shopifyLastSyncAt']);
    if (!prodottoFermo) {
      await tx.product.update({ where: { id: existing.id }, data: datiProdotto });
    }

    for (const variant of remote.variants) {
      const shopifyVariantId = String(variant.id);
      const matched = byShopifyVariantId.get(shopifyVariantId);
      const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
      // Comune a match/nuova: il prezzo Shopify e i collegamenti si allineano.
      //
      // ⛔ **Il costo non sta qui**, e non è un dettaglio di forma: questo
      //    oggetto lo usano sia l’aggiornamento sia la creazione, e su una
      //    variante GIÀ ESISTENTE il costo lo comanda VestiFlow (§9.11).
      //    Lo aggiunge la sola `create`, qui sotto.
      const variantSyncData = {
        optionValues: this.mapVariantOptions(remote, variant) as unknown as Prisma.InputJsonValue,
        barcode: codici.perVariante.get(variant.id)!.barcode,
        shopifyPriceMinor: variantPriceMinor,
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
        //
        // ⛔ E nemmeno si riscrive uguale: stessa regola del prodotto, stesso
        //    effetto misurato sull’`updatedAt`.
        if (!nullaDaScrivere(variantSyncData, matched, [])) {
          await tx.productVariant.update({
            where: { id: matched.id },
            data: variantSyncData,
          });
        }
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
        await tx.productVariant.create({
          data: {
            tenantId,
            productId: existing.id,
            sku: codici.perVariante.get(variant.id)!.sku,
            currency: 'EUR',
            sellingPriceMinor: variantPriceMinor,
            // ⭐ Qui il costo SI acquisisce, e non contraddice §9.11: non c’è
            //    nessun valore VestiFlow da proteggere — la variante nasce ora.
            //    È la stessa acquisizione della prima importazione.
            purchasePriceMinor: enrichment?.variantPurchasePriceMinor.get(variant.id) ?? 0,
            ...variantSyncData,
          },
        });
      }
    }

    // ⛔ Come sopra: l’immagine principale si archivia fuori dalla transazione.

    // ── B2 · lo storico anche sul RI-SYNC ────────────────────────────────
    //
    // ⚠️ **Non solo al primo import**: un prodotto già in VestiFlow che
    //    arriva da un webhook deve avere la sua identità come gli altri, e le
    //    varianti comparse dopo devono trovare la loro. Idempotente: una
    //    seconda passata non aggiunge niente.
    await this.registraStorico(
      tx,
      tenantId,
      existing.id,
      remote,
      ingresso,
      titoloShopify,
      rifiutate,
    );

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

  /**
   * I barcode già presi nel tenant, con CHI li ha (per la segnalazione) — letti
   * su `tx`, a lock preso, escluse le varianti di questo stesso prodotto.
   */
  private async loadTenantBarcodes(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludeProductId?: string,
  ): Promise<Map<string, string>> {
    const rows = await tx.productVariant.findMany({
      where: {
        tenantId,
        barcode: { not: null },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { barcode: true, sku: true, product: { select: { name: true } } },
    });
    return new Map(
      rows
        .filter((r): r is typeof r & { barcode: string } => Boolean(r.barcode))
        .map((r) => [r.barcode, `«${r.sku ?? 'senza SKU'}» di «${r.product.name}»`]),
    );
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
