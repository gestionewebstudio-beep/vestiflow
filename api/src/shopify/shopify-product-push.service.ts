import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformAuditActor,
  PlatformAuditOperation,
  ProductStatus,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  Prisma,
  type Product,
  type ProductVariant,
} from '@prisma/client';
import { PlatformAuditService } from '../common/audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import {
  gidProdotto,
  gidVariante,
  ShopifyLinkHistoryService,
} from './shopify-link-history.service';
import { productChannelFields } from './shopify-product-payload.util';
import { SYNC_DISABLE_FAILED_MESSAGE } from './shopify-user-error.util';
import {
  describeUnmatchedVariants,
  matchOrphanVariants,
  type VariantMatched,
} from './shopify-variant-match.util';
import { ShopifyConnectionService } from './shopify-connection.service';
import { minorToShopifyDecimal, legacyIdFromGid, toShopifyGid } from './shopify-money.util';
import { variantChannelFields, variantBulkInput } from './shopify-variant-payload.util';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import {
  categoryMetafieldsSyncErrorMessage,
  countCategoryMetafieldsWithValues,
  parseCategoryMetafieldsJson,
  resolveImportedShopifyCategoryMetafields,
  resolveImportedShopifyMetafields,
} from './shopify-category-metafields.util';
import { mapMetafieldRows } from './shopify-product-metadata.util';
import {
  mergeShopifyScopes,
  SHOPIFY_WRITE_PRODUCTS_SCOPE,
  shopifyHasScope,
} from './shopify-scopes.util';
import {
  VESTIFLOW_METAFIELD_NAMESPACE,
  VESTIFLOW_SEASON_METAFIELD_KEY,
} from './shopify-product-metadata.types';
import {
  abbinaVariantiPerIdentita,
  buildProductSetCreateInput,
  conflittiDiCombinazione,
  descriviIdentitaSenzaLocale,
  buildVariantCreateInputs,
  IDENTITA_PRODOTTO,
  IDENTITA_VARIANTE,
  ShopifyClaimSuperatoException,
  TIPO_METAFIELD_IDENTITA,
} from './shopify-identita-catalogo.util';
import { adottaIdentitaRecuperata } from './shopify-identita-adozione.util';

type ProductWithVariants = Product & { variants: ProductVariant[] };

type ProductOptionRow = { readonly name: string; readonly values: readonly string[] };

export type ShopifyProductPushSkipReason =
  'not_connected' | 'missing_write_products_scope' | 'archived' | 'sync_disabled' | 'not_linked';

/**
 * 26.2 · **com'è andata davvero**, in una parola.
 *
 * ⛔ **Prima esisteva solo `pushed: boolean`, e mentiva.** `pushProduct`
 *    rileggeva lo stato del prodotto e rispondeva `pushed: false` SOLO se
 *    trovava `error` — ma `markPushFailed` scrive `out_of_sync` su un prodotto
 *    collegato, che è il caso normale. Un push fallito rispondeva quindi
 *    «riuscito» (misurato il 09/09/2026, `collaudo-ciclo-utilizzo` S7).
 *
 * ⭐ **Quattro esiti distinti**, come chiesto: avvio, completamento,
 *    aggiornamento parziale, fallimento — più i due rifiuti, che non sono
 *    fallimenti tecnici e non vanno confusi con essi.
 *
 * ```text
 *   avviato      il lavoro è partito e finirà dopo (pulsante «Sincronizza»)
 *   completato   tutto ciò che doveva arrivare su Shopify è arrivato
 *   parziale     il prodotto sì, ALCUNE varianti no: escluse dallo storico
 *   rifiutato    lo storico vieta quel collegamento: NESSUNA scrittura remota
 *   fallito      errore tecnico: rete, rate limit, campo rifiutato, ambiguità
 *   saltato      una precondizione manca (non connesso, sync spenta, archiviato)
 * ```
 */
export type ShopifyPushOutcome =
  'avviato' | 'completato' | 'parziale' | 'rifiutato' | 'fallito' | 'saltato';

export interface ShopifyProductPushResult {
  /**
   * ⚠️ **Vero solo se il push è arrivato INTERO** (o è appena partito). Un
   *    aggiornamento parziale è `false`: le varianti escluse non sono su
   *    Shopify, e dichiararlo sincronizzato sarebbe la bugia di 26.2.
   */
  readonly pushed: boolean;
  readonly outcome: ShopifyPushOutcome;
  readonly reason?: ShopifyProductPushSkipReason | 'shopify_error' | 'collegamento_escluso';
  /** Il motivo per esteso: le varianti escluse per nome, o la regola che ha rifiutato. */
  readonly detail?: string;
  /** Metafield categoria e refresh metadata proseguono in background (evita timeout gateway). */
  readonly followUpInBackground?: boolean;
}

/** Una variante che il push NON ha aggiornato perché lo storico lo vieta (26.7). */
interface VarianteEsclusa {
  readonly variantId: string;
  readonly sku: string | null;
  readonly gid: string;
  readonly tipo: string;
  readonly motivo: string;
}

/** Un costo d'acquisto che non è arrivato a Shopify, con il motivo tecnico. */
interface CostoNonRiuscito {
  readonly sku: string | null;
  readonly motivo: string;
}

/**
 * Il motivo che l'operatore legge sul prodotto quando un COSTO non è arrivato.
 *
 * ⭐ **Si distingue da un'esclusione dello storico**, e la frase lo dice: qui
 *    non c'è nessuna regola applicata, c'è una scrittura remota che è caduta.
 */
function descriviCostiFalliti(falliti: readonly CostoNonRiuscito[]): string | null {
  if (falliti.length === 0) {
    return null;
  }
  const elenco = falliti
    .map((costo) => `${costo.sku ?? 'variante senza SKU'} (${costo.motivo})`)
    .join(', ');
  return (
    `Costo d'acquisto non aggiornato su Shopify per ${falliti.length} variante/i — ${elenco}. ` +
    'Il resto della scheda è stato inviato.'
  );
}

/**
 * Il motivo che l'operatore legge sul prodotto: **quali** varianti sono rimaste
 * fuori e **perché**, non un generico «sync non completata».
 *
 * ⭐ Le varianti si nominano con lo SKU — che è ciò con cui l'operatore le
 *    riconosce — e il GID resta come ripiego per quelle che non ce l'hanno.
 */
/**
 * Un errore del database durante la pubblicazione, tradotto per chi legge: il codice
 * Prisma resta (è ciò che serve a chi indaga), il resto — chiamata, percorso del file,
 * stack — no. `null` = non è un errore di persistenza, il messaggio passa com'è.
 */
function motivoDiPersistenzaPerLOperatore(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      `Salvataggio locale non riuscito durante la pubblicazione (${error.code}): ` +
      'i dati locali sono cambiati mentre l’invio era in corso. Ripubblica il prodotto.'
    );
  }
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return 'Salvataggio locale non riuscito durante la pubblicazione. Ripubblica il prodotto; se si ripete, contatta il supporto.';
  }
  return null;
}

function descriviEscluse(escluse: readonly VarianteEsclusa[]): string | null {
  if (escluse.length === 0) {
    return null;
  }
  const elenco = escluse
    .map((variante) => `${variante.sku ?? variante.gid} (${variante.tipo})`)
    .join(', ');
  return (
    `Aggiornamento parziale: ${escluse.length} variante/i non sono state inviate a Shopify ` +
    `perché il collegamento non è utilizzabile — ${elenco}. ` +
    'Il prodotto e le altre varianti sono stati aggiornati.'
  );
}

/** L'esito del lavoro vero, che `pushProduct` traduce senza rileggere lo stato. */
type EsitoLavoro =
  | { readonly esito: 'completato' }
  | { readonly esito: 'gia_in_corso' }
  | {
      readonly esito: 'parziale';
      readonly motivo: string;
      /** Se il parziale nasce dallo storico (varianti escluse) o da un guasto tecnico. */
      readonly collegamentoEscluso: boolean;
    }
  | { readonly esito: 'fallito'; readonly motivo: string };
// ⚠️ **Il RIFIUTO non è un esito del lavoro**, e non compare qui: lo storico si
//    interroga PRIMA di iniziare, in `evaluatePushGuard`, così il prodotto non
//    passa nemmeno per `syncing` e nessuna chiamata parte. Lo traduce
//    `esitoDelRifiuto`.

// ⛔ Qui vivevano `ShopifyProductDeleteSkipReason` e `ShopifyProductDeleteResult`,
//    il vocabolario con cui il codice descriveva l'esito di una cancellazione
//    remota. Rimossi insieme al metodo che li produceva: senza un tipo che la
//    rappresenti, quell'intenzione non e' piu' esprimibile (docs/24 §11.1).

/**
 * Write-through catalogo VestiFlow → Shopify (create/update prodotto).
 * Best-effort: il prodotto locale resta valido anche se Shopify fallisce.
 */
@Injectable()
export class ShopifyProductPushService {
  private readonly logger = new Logger(ShopifyProductPushService.name);
  /** Evita push concorrenti sullo stesso prodotto (sync manuale + webhook + save). */
  private readonly pushInFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyTaxonomy: ShopifyTaxonomyService,
    private readonly shopifyCategoryMetafields: ShopifyCategoryMetafieldsService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly storico: ShopifyLinkHistoryService,
    private readonly registro: PlatformAuditService,
  ) {}

  async pushProduct(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    // ⭐ La correlazione nasce all'INGRESSO dell'operazione, non riga per riga:
    //    un push è un'operazione sola, e le sue righe di registro si ritrovano
    //    insieme (§10.3).
    const correlationId = randomUUID();
    const guard = await this.evaluatePushGuard(tenantId, productId, correlationId);
    if (!guard.ok) {
      return this.esitoDelRifiuto(guard);
    }

    await this.markProductSyncing(productId);
    const lavoro = await this.executePushWork(tenantId, productId, correlationId);

    return this.esitoDelLavoro(lavoro);
  }

  /**
   * 26.2 · l'esito di `executePushWork`, tradotto nel contratto pubblico.
   *
   * ⛔ **Non si rilegge più lo stato del prodotto per dedurlo.** Era la causa
   *    del difetto: `out_of_sync` è lo stato giusto per un prodotto collegato
   *    che va riallineato, e da fuori è indistinguibile da un successo con
   *    avvertimento. Il lavoro sa com'è andata: lo dice.
   */
  private esitoDelLavoro(lavoro: EsitoLavoro): ShopifyProductPushResult {
    switch (lavoro.esito) {
      case 'completato':
        return { pushed: true, outcome: 'completato' };
      case 'gia_in_corso':
        return { pushed: true, outcome: 'avviato', followUpInBackground: true };
      case 'parziale':
        return {
          pushed: false,
          outcome: 'parziale',
          reason: lavoro.collegamentoEscluso ? 'collegamento_escluso' : 'shopify_error',
          detail: lavoro.motivo,
        };
      case 'fallito':
        return {
          pushed: false,
          outcome: 'fallito',
          reason: 'shopify_error',
          detail: lavoro.motivo,
        };
    }
  }

  /** L'esito di una precondizione mancante, distinguendo il rifiuto dal salto. */
  private esitoDelRifiuto(guard: {
    readonly ok: false;
    readonly reason: ShopifyProductPushSkipReason | 'shopify_error' | 'collegamento_escluso';
    readonly motivo?: string;
  }): ShopifyProductPushResult {
    if (guard.reason === 'collegamento_escluso') {
      return {
        pushed: false,
        outcome: 'rifiutato',
        reason: 'collegamento_escluso',
        detail: guard.motivo,
      };
    }
    return {
      pushed: false,
      outcome: guard.reason === 'shopify_error' ? 'fallito' : 'saltato',
      reason: guard.reason,
    };
  }

  /**
   * Avvia sync completa in background e risponde subito (evita 504 gateway su Railway).
   * Usato dal pulsante «Sincronizza con Shopify» nel dettaglio prodotto.
   */
  async enqueuePush(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    const correlationId = randomUUID();
    const guard = await this.evaluatePushGuard(tenantId, productId, correlationId);
    if (!guard.ok) {
      return this.esitoDelRifiuto(guard);
    }

    const lockKey = this.pushLockKey(tenantId, productId);
    if (this.pushInFlight.has(lockKey)) {
      this.logger.debug(`Push Shopify già in corso (${tenantId}/${productId})`);
      return { pushed: true, outcome: 'avviato', followUpInBackground: true };
    }

    await this.markProductSyncing(productId);
    void this.executePushWork(tenantId, productId, correlationId);

    // ⚠️ «avviato», non «completato»: da qui l'esito vero lo dice il PRODOTTO —
    //    stato e `shopifyLastError`, che il dettaglio rilegge finito il lavoro.
    return { pushed: true, outcome: 'avviato', followUpInBackground: true };
  }

  private pushLockKey(tenantId: string, productId: string): string {
    return `${tenantId}:${productId}`;
  }

  private async evaluatePushGuard(
    tenantId: string,
    productId: string,
    correlationId: string,
  ): Promise<
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly reason: ShopifyProductPushSkipReason | 'shopify_error' | 'collegamento_escluso';
        readonly motivo?: string;
      }
  > {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { ok: false, reason: 'not_connected' };
    }

    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);

    if (!shopifyHasScope(effectiveScopes, SHOPIFY_WRITE_PRODUCTS_SCOPE)) {
      this.logger.debug(
        `Push prodotto saltato (${tenantId}): scope ${SHOPIFY_WRITE_PRODUCTS_SCOPE} assente`,
      );
      return { ok: false, reason: 'missing_write_products_scope' };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        shopifySyncEnabled: true,
        shopifyProductId: true,
      },
    });
    if (!product) {
      return { ok: false, reason: 'shopify_error' };
    }

    if (product.status === ProductStatus.archived) {
      return { ok: false, reason: 'archived' };
    }

    // Gate per-prodotto. Un false→true su update accoda comunque il push, che
    // qui trova il flag aggiornato e riallinea per intero (docs/24 §1.8).
    // ⚠️ Non esiste più un gating per ORIGINE: un prodotto importato da Shopify
    //    si modifica in VestiFlow come gli altri, e il push lo porta di là.
    if (!product.shopifySyncEnabled) {
      return { ok: false, reason: 'sync_disabled' };
    }

    // ── 26.7 · lo STORICO, prima di usare qualunque identificativo ─────────
    const escluso = await this.collegamentoDelProdottoEscluso(tenantId, product, correlationId);
    if (escluso) {
      return { ok: false, reason: 'collegamento_escluso', motivo: escluso };
    }

    return { ok: true };
  }

  /**
   * 26.7 · il push può usare il collegamento di QUESTO prodotto?
   *
   * ⛔ **Si interroga lo storico, non la colonna-cache.** La cache è una copia
   *    che può restare indietro: dopo un ripristino da backup dice ancora
   *    «collegato» mentre il periodo è chiuso da un pezzo. Fidarsi di lei
   *    significa scrivere su Shopify attraverso un collegamento escluso — il
   *    difetto misurato il 09/09/2026 (`S8`).
   *
   * ⭐ **Due domande diverse, secondo che la cache ci sia o no:**
   *
   * ```text
   *   cache PRESENTE   quel GID si può ancora usare per questa anagrafica?
   *   cache ASSENTE    questa anagrafica si può pubblicare da zero?
   * ```
   *
   * ⚠️ **Nessuno storico non significa esclusione**: una connessione non ancora
   *    migrata non ha `shopify_shops`, e il push resta quello di sempre. Lo
   *    stesso vale per l'articolo mai collegato, che si pubblica come sempre.
   *
   * ⛔ **E uno storico VECCHIO chiuso non blocca un collegamento ATTUALE
   *    valido**: la domanda si fa sul GID corrente, non sull'anagrafica.
   */
  private async collegamentoDelProdottoEscluso(
    tenantId: string,
    product: {
      readonly id: string;
      readonly name: string;
      readonly shopifyProductId: string | null;
    },
    correlationId: string,
  ): Promise<string | null> {
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    if (!shopId) {
      return null;
    }

    if (product.shopifyProductId) {
      const uso = await this.storico.collegamentoUsabileProdotto(this.prisma, {
        shopId,
        shopifyProductGid: gidProdotto(product.shopifyProductId),
        productId: product.id,
      });
      if (uso.tipo === 'utilizzabile') {
        return null;
      }
      await this.rifiutoARegistro(tenantId, shopId, correlationId, {
        operation: PlatformAuditOperation.riaggancio_rifiutato,
        entityId: product.id,
        entityLabel: product.name,
        remoteGid: gidProdotto(product.shopifyProductId),
        detail: `${uso.tipo}: ${uso.motivo}`,
      });
      await this.markPushRifiutato(product.id, uso.motivo);
      return uso.motivo;
    }

    const pubblicazione = await this.storico.puoPubblicareDaZero(this.prisma, {
      shopId,
      productId: product.id,
    });
    if (pubblicazione.tipo === 'si_pubblica') {
      return null;
    }
    await this.rifiutoARegistro(tenantId, shopId, correlationId, {
      operation: PlatformAuditOperation.ripubblicazione_rifiutata,
      entityId: product.id,
      entityLabel: product.name,
      remoteGid: null,
      detail: `ha_storia: ${pubblicazione.motivo}`,
    });
    await this.markPushRifiutato(product.id, pubblicazione.motivo);
    return pubblicazione.motivo;
  }

  /**
   * L'esito di un push RIFIUTATO dallo storico, sul prodotto.
   *
   * ⭐ **Il motivo deve essere leggibile dove l'operatore guarda**: la scheda
   *    prodotto mostra `shopifyLastError`, ed è lì che deve trovare perché
   *    «Sincronizza» non ha fatto niente. Senza, il pulsante sembrerebbe rotto.
   *
   * ⛔ **`out_of_sync`, mai `error`**: non è un guasto tecnico. L'articolo è
   *    semplicemente disallineato e resterà tale finché non lo si riaggancia o
   *    ripubblica — due comandi espliciti, nessuno dei quali è questo.
   */
  private async markPushRifiutato(productId: string, motivo: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        shopifySyncStatus: ShopifySyncStatus.out_of_sync,
        shopifyLastError: `Sincronizzazione rifiutata: ${motivo}`.slice(0, 500),
      },
    });
  }

  /**
   * §10.3 · la riga di registro di un rifiuto del PUSH.
   *
   * ⭐ **Attore `push`**, mai una persona: chi ha premuto il pulsante ha chiesto
   *    una sincronizzazione, non questo rifiuto — che è una regola applicata dal
   *    processo. La correlazione è quella dell'ingresso.
   *
   * ⛔ **Non fa fallire il push in silenzio**: se la riga non si scrive,
   *    l'eccezione risale e il push cade dicendolo. Un rifiuto senza traccia è
   *    esattamente ciò che §10.3 vieta.
   */
  private async rifiutoARegistro(
    tenantId: string,
    shopId: string,
    correlationId: string,
    dati: {
      readonly operation: PlatformAuditOperation;
      readonly entityId: string | null;
      readonly entityLabel: string;
      readonly remoteGid: string | null;
      readonly detail: string;
    },
  ): Promise<void> {
    const negozio = await this.prisma.shopifyShop.findUnique({
      where: { id: shopId },
      select: { shopGid: true },
    });
    await this.registro.registraRifiuto(
      {
        tenantId,
        attore: { tipo: PlatformAuditActor.push },
        operation: dati.operation,
        shopGid: negozio?.shopGid ?? null,
        entityId: dati.entityId,
        entityLabel: dati.entityLabel.slice(0, 200),
        remoteGid: dati.remoteGid,
      },
      dati.detail,
      correlationId,
    );
  }

  private async markProductSyncing(productId: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: { shopifySyncStatus: ShopifySyncStatus.syncing, shopifyLastError: null },
    });
  }

  // ⛔ Qui viveva `readProductSyncStatus`, con cui `pushProduct` DEDUCEVA l'esito
  //    rileggendo lo stato del prodotto. Rimosso con 26.2: quella lettura non
  //    poteva distinguere un successo con avvertimento da un fallimento —
  //    `markPushFailed` scrive `out_of_sync` su un prodotto collegato, cioè lo
  //    stesso valore del successo parziale. L'esito lo dichiara ora il lavoro.

  private async executePushWork(
    tenantId: string,
    productId: string,
    correlationId: string,
  ): Promise<EsitoLavoro> {
    const lockKey = this.pushLockKey(tenantId, productId);
    if (this.pushInFlight.has(lockKey)) {
      return { esito: 'gia_in_corso' };
    }
    this.pushInFlight.add(lockKey);

    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!product || product.status === ProductStatus.archived) {
        const motivo = 'Push Shopify interrotto: prodotto non più disponibile.';
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            shopifySyncStatus: ShopifySyncStatus.out_of_sync,
            shopifyLastError: motivo,
          },
        });
        return { esito: 'fallito', motivo };
      }

      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      // ⭐ Prodotto GIÀ COLLEGATO: la modifica passa da GraphQL (docs/24 §1.6,
      //    primo pezzo della Tranche 2). ⛔ Nessun fallback REST: se GraphQL
      //    fallisce, l'errore arriva al catch e resta visibile sul prodotto.
      // ⚠️ La CREAZIONE resta sul REST finché la Tranche 2 non porta productSet:
      //    non è una funzione nuova su quel percorso, è quella di sempre.
      let shopifyProductLegacyId: string;
      let escluse: readonly VarianteEsclusa[] = [];
      let avvisoIdentita: string | null = null;
      if (product.shopifyProductId) {
        const aggiornamento = await this.updateLinkedProductViaGraphql(
          tenantId,
          product,
          shopDomain,
          accessToken,
          correlationId,
        );
        shopifyProductLegacyId = aggiornamento.legacyId;
        escluse = aggiornamento.escluse;
        avvisoIdentita = aggiornamento.avvisoIdentita;
      } else {
        // ⭐ CREAZIONE con l'identità VestiFlow (docs/30 §7.2-bis, §7.2-ter.3): claim con
        //    numero di tentativo, rilettura per identità prima di creare, `productSet` in
        //    sola creazione con prodotto, varianti e identità in una mutation. Niente REST,
        //    niente `productCreate`, mai `productSet` con identifier.
        const creazione = await this.creaConIdentita(tenantId, product, shopDomain, accessToken);
        if (creazione.tipo === 'in_corso') {
          // Un altro tentativo VIVO sta creando: non si chiama Shopify e non si tocca
          // lo stato, che chiuderà lui. Il chiamante lo sa come «già in corso».
          return { esito: 'gia_in_corso' };
        }
        if (creazione.tipo === 'recuperato') {
          // ⛔ Recuperare gli id NON è ripubblicare: il push finisce qui, nessun campo
          //    locale viene spinto sopra ciò che il negozio ha nel frattempo. Il
          //    completamento — se manca qualcosa — è dichiarato, non eseguito.
          await this.prisma.product.updateMany({
            where: { id: productId, shopifyCreateClaimVersion: creazione.versione },
            data: {
              shopifySyncStatus: ShopifySyncStatus.out_of_sync,
              shopifyLastError: creazione.motivo.slice(0, 500),
              shopifyLastSyncAt: new Date(),
            },
          });
          await this.chiudiClaim(productId, creazione.versione);
          return { esito: 'parziale', motivo: creazione.motivo, collegamentoEscluso: false };
        }
        // Creato ORA con il nome interno: da adesso quel titolo è il «Nome
        // Shopify», e i due si possono separare senza che nessuno li riallinei.
        await this.initOnlineTitle(product.id, productChannelFields(product).title);
        await this.pushProductImages(
          tenantId,
          product.id,
          shopDomain,
          accessToken,
          Number(creazione.legacyId),
        );
        shopifyProductLegacyId = creazione.legacyId;
      }
      await this.pushSeasonMetafield(
        shopDomain,
        accessToken,
        shopifyProductLegacyId,
        product.season,
        product.shopifyMetafields,
      );
      const taxonomyWarning = await this.pushTaxonomyCategory(
        tenantId,
        shopifyProductLegacyId,
        product,
      );
      const categoryMetafieldsWarning = await this.pushCategoryMetafields(
        tenantId,
        shopifyProductLegacyId,
        product,
      );
      await this.refreshLocalShopifyMetadata(
        product.id,
        shopDomain,
        accessToken,
        shopifyProductLegacyId,
        product.shopifyTaxonomyCategoryId,
        product.shopifyCategoryMetafields,
        product.shopifyMetafields,
      );
      const verifyWarning = await this.verifyRemoteCategoryMetafields(
        shopDomain,
        accessToken,
        shopifyProductLegacyId,
        product.shopifyTaxonomyCategoryId,
        product.shopifyCategoryMetafields,
      );
      // ⛔ Anche il COSTO è una scrittura remota: le varianti escluse restano
      //    fuori anche da qui, o il collegamento vietato verrebbe usato lo stesso.
      const esclusi = new Set(escluse.map((variante) => variante.variantId));
      const costiFalliti = await this.pushVariantCosts(
        shopDomain,
        accessToken,
        product.variants.filter((variante) => !esclusi.has(variante.id)),
      );

      const avvisoEscluse = descriviEscluse(escluse);
      const avvisoCosti = descriviCostiFalliti(costiFalliti);
      const syncWarning = [
        avvisoIdentita,
        avvisoEscluse,
        avvisoCosti,
        taxonomyWarning,
        categoryMetafieldsWarning,
        verifyWarning,
      ]
        .filter((entry): entry is string => Boolean(entry?.trim()))
        .join(' ');

      if (syncWarning) {
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            shopifyLastError: syncWarning.slice(0, 500),
            shopifySyncStatus: ShopifySyncStatus.out_of_sync,
            shopifyLastSyncAt: new Date(),
          },
        });
      } else {
        await this.markPushSucceeded(productId);
      }

      await this.shopifyConnection.touchSync(tenantId);
      this.logger.log(
        `Prodotto Shopify sincronizzato (${tenantId}): ${product.name} → ${shopifyProductLegacyId}`,
      );
      // ⭐ 26.2 · un aggiornamento PARZIALE non è un completamento. Il prodotto
      //    è arrivato, qualcosa d'altro no: le varianti escluse dallo storico,
      //    oppure la categoria e i metafield. Chi legge l'esito deve saperlo, e
      //    chi legge il prodotto trova il motivo in `shopifyLastError`.
      //
      // ⚠️ **La causa NON si confonde**: un'esclusione dello storico è una
      //    regola applicata, un avvertimento di categoria è un guasto tecnico.
      //    Portano lo stesso esito parziale con motivi diversi.
      if (syncWarning) {
        return {
          esito: 'parziale',
          motivo: syncWarning,
          collegamentoEscluso: escluse.length > 0,
        };
      }
      return { esito: 'completato' };
    } catch (error: unknown) {
      if (error instanceof ShopifyClaimSuperatoException) {
        // ⛔ Superato da un tentativo più recente: NIENTE scritture locali — lo stato
        //    lo chiude lui — e nessuna chiamata remota. Per chi ha chiesto il push è
        //    «avviato»: qualcun altro lo sta portando avanti.
        this.logger.warn(
          `Push prodotto Shopify superato (${tenantId}/${productId}): ${error.message}`,
        );
        return { esito: 'gia_in_corso' };
      }
      const message = error instanceof Error ? error.message : 'Errore push prodotto Shopify';
      this.logger.warn(`Push prodotto Shopify fallito (${tenantId}/${productId}): ${message}`);
      // ⛔ Un errore di persistenza porta il nome della chiamata e il percorso del file
      //    sorgente: resta nel log qui sopra. All'operatore arriva che cosa è successo e
      //    che cosa fare, non lo stack.
      const motivo = motivoDiPersistenzaPerLOperatore(error) ?? message;
      await this.markPushFailed(productId, motivo);
      return { esito: 'fallito', motivo };
    } finally {
      this.pushInFlight.delete(lockKey);
    }
  }

  // ⛔ Qui c'era `deleteProduct`, l'unico percorso che chiamava una DELETE di
  //    prodotto verso Shopify. Rimosso: VestiFlow non cancella mai su Shopify
  //    (docs/24 §11.1), e l'eliminazione locale di un prodotto collegato si
  //    rifiuta in `products.service` prima di arrivare al canale.
  //
  // ⚠️ Non e' stato sostituito da un ritiro: `retireProduct` (DRAFT, unpublish)
  //    aspetta il collaudo mutativo sullo shop di sviluppo — docs/24 §8.5.7,
  //    passo 7. Questa patch toglie una capacita', non ne aggiunge un'altra.

  /**
   * «Sincronizza con Shopify» appena SPENTO su un prodotto collegato: il
   * prodotto Shopify va in ARCHIVED (docs/24 §1.8). Non passa dal push
   * ordinario, che a flag spento non fa nulla per costruzione — e non deve:
   * questa è l'unica scrittura remota ammessa a interruttore spento.
   *
   * ⛔ **Spegnere è UN'OPERAZIONE SOLA, e le sue due metà non si separano**: il
   *    flag locale ferma ogni push — giacenze comprese — e l'archiviazione
   *    toglie il prodotto dalla vendita. Se la seconda fallisce e la prima
   *    resta, il prodotto è **ancora in vendita su Shopify con lo stock
   *    congelato**: si vende merce che non c'è. È il danno peggiore dei due,
   *    quindi a fallimento la disattivazione **si annulla** — il flag torna
   *    acceso, le giacenze riprendono a sincronizzarsi, e l'errore dice
   *    all'operatore che cosa può essere successo.
   *
   * ⚠️ `out_of_sync` resta come stato tecnico perché è vero (il prodotto va
   *    riallineato), ma da solo non direbbe la conseguenza: quella sta nel
   *    messaggio, che è ciò che l'operatore legge.
   *
   * ⛔ **La lettura del prodotto sta DENTRO il `try`**, e non è pignoleria: se
   *    fallisce lei, il flag è già spento e l'archiviazione non è mai partita —
   *    cioè esattamente la metà pericolosa. Qualunque cosa vada storta da qui
   *    in poi annulla la disattivazione; l'unica uscita che non annulla è il
   *    prodotto mai collegato, dove non c'è niente da annullare.
   *
   * ⚠️ **Non lancia mai**: chi la chiama attende il suo esito dentro un
   *    salvataggio, e un'eccezione qui diventerebbe «salvataggio fallito» su
   *    una scheda che invece è stata salvata per intero.
   *
   * Mapping e id restano com'erano: riaccendendo, il push ordinario ritrova
   * il prodotto e lo riallinea per intero, stato locale compreso.
   */
  async archiveOnSyncDisabled(
    tenantId: string,
    productId: string,
  ): Promise<ShopifyProductPushResult> {
    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true, name: true, shopifyProductId: true },
      });
      // ⭐ Mai collegato: non c'è niente da archiviare, e lo spegnimento vale
      //    da solo. Nessuna chiamata a Shopify, e nessun annullamento.
      if (!product?.shopifyProductId) {
        return { pushed: false, outcome: 'saltato', reason: 'not_linked' };
      }
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      await this.shopifyGraphql.setProductStatus(
        shopDomain,
        accessToken,
        toShopifyGid('Product', product.shopifyProductId),
        'ARCHIVED',
      );
      await this.markPushSucceeded(productId);
      this.logger.log(`Prodotto Shopify archiviato a sync spento (${tenantId}): ${product.name}`);
      return { pushed: true, outcome: 'completato' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Archiviazione Shopify fallita';
      this.logger.warn(`Archiviazione Shopify fallita (${tenantId}/${productId}): ${message}`);
      await this.undoSyncDisable(tenantId, productId, message);
      return { pushed: false, outcome: 'fallito', reason: 'shopify_error', detail: message };
    }
  }

  /**
   * La modifica di un prodotto già collegato, via GraphQL, in quattro passi:
   * varianti orfane, campi prodotto e stato, varianti, immagini.
   * Restituisce l'id numerico salvato, che il resto del push usa com'era.
   */
  /**
   * COMPLETAMENTO per identità (regola del proprietario, 15/09/2026): prima di scrivere
   * qualunque cosa sul negozio si verificano tutte le corrispondenze.
   *
   *   1. rilettura delle varianti remote col metafield `vestiflow.variant_id`;
   *   2. le locali senza id che hanno una remota con la LORO identità → si adottano gli id
   *      (le già riconosciute non si toccano: hanno l'id);
   *   3. le remote SENZA identità (la iniziale, una fatta a mano) restano intatte, sempre;
   *   4. le locali ancora senza remota: se la loro combinazione di opzioni è OCCUPATA da una
   *      remota senza identità → ⛔ conflitto: ci si ferma PRIMA di scrivere, con un errore
   *      che nomina variante e combinazione — niente collegamento automatico, cancellazione
   *      o sovrascrittura; altrimenti si CREANO con la loro identità (`bulkCreate`, MAI
   *      `REMOVE_STANDALONE_VARIANT` qui);
   *   5. qualunque esito non-successo della `bulkCreate` → rilettura per identità: le create
   *      si adottano, un doppione lo impedisce l'unicità del metafield (contratto G4);
   *      quelle che ancora mancano fermano il push con un errore, senza secondo tentativo cieco.
   */
  private async completaVariantiPerIdentita(
    product: ProductWithVariants,
    productGid: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<{
    readonly abbinate: ReadonlyMap<string, string>;
    readonly escluse: readonly VarianteEsclusa[];
    readonly avvisoIdentita: string | null;
  }> {
    const identita = { namespace: IDENTITA_VARIANTE.namespace, key: IDENTITA_VARIANTE.key };
    const options = this.normalizeOptions(product.options);
    const senzaId = product.variants.filter((variant) => !variant.shopifyVariantId);
    let remote = await this.shopifyGraphql.listProductVariantsWithIdentity(
      shopDomain,
      accessToken,
      productGid,
      identita,
    );
    if (senzaId.length === 0) {
      // Tutte collegate: resta solo da dire se sul negozio c'è una nostra identità che
      // localmente non esiste più (la locale è stata eliminata dopo la creazione remota).
      return {
        abbinate: new Map(),
        escluse: [],
        avvisoIdentita: descriviIdentitaSenzaLocale(
          abbinaVariantiPerIdentita(product.variants, remote).remoteConIdentitaSenzaLocale,
        ),
      };
    }
    let esito = abbinaVariantiPerIdentita(senzaId, remote);

    const mancanti = senzaId.filter((v) => esito.localiSenzaRemota.includes(v.id));
    if (mancanti.length > 0) {
      const conflitti = conflittiDiCombinazione(mancanti, esito.remoteSenzaIdentita, options);
      if (conflitti.length > 0) {
        const elenco = conflitti
          .map(
            (c) =>
              `${c.sku ?? c.varianteId} («${c.combinazione || 'variante unica'}», occupata da ${c.remota.id}${c.remota.sku ? `, SKU ${c.remota.sku}` : ''})`,
          )
          .join('; ');
        throw new Error(
          `Completamento su Shopify fermato: la combinazione di ${conflitti.length === 1 ? 'una variante locale è' : `${conflitti.length} varianti locali sono`} già occupata sul negozio da una variante senza identità VestiFlow — ${elenco}. Nessun collegamento automatico, nessuna cancellazione né sovrascrittura: decidere sul negozio.`,
        );
      }
      const compareAt =
        product.compareAtPriceMinor == null ? null : Number(product.compareAtPriceMinor);
      try {
        await this.shopifyGraphql.bulkCreateVariants(
          shopDomain,
          accessToken,
          productGid,
          buildVariantCreateInputs(mancanti, options, compareAt),
        );
      } catch (error: unknown) {
        // ⛔ Esito incerto o rifiuto (anche «identità già presente», se un altro processo
        //    ha completato nel frattempo): si RILEGGE, mai si ricrea.
        this.logger.warn(
          `Completamento varianti Shopify (${product.id}): ${error instanceof Error ? error.message : String(error)} — rilettura per identità`,
        );
      }
      remote = await this.shopifyGraphql.listProductVariantsWithIdentity(
        shopDomain,
        accessToken,
        productGid,
        identita,
      );
      esito = abbinaVariantiPerIdentita(senzaId, remote);
    }

    const legacyId = legacyIdFromGid(productGid);
    const adozione = await this.prisma.$transaction((tx) =>
      adottaIdentitaRecuperata(tx, this.storico, this.logger, {
        product,
        versione: product.shopifyCreateClaimVersion,
        legacyId,
        remote,
      }),
    );
    // ⚠️ Le locali «ancora senza remota» sono quelle che ESISTONO ancora: l'adozione le ha
    //    rilette sotto il lock. Una locale eliminata nel frattempo non manca a nessuno.
    if (adozione.localiSenzaRemota.length > 0) {
      const sku = senzaId
        .filter((v) => adozione.localiSenzaRemota.includes(v.id))
        .map((v) => v.sku ?? v.id)
        .join(', ');
      throw new Error(
        `Completamento su Shopify non riuscito: ${adozione.localiSenzaRemota.length === 1 ? 'la variante' : 'le varianti'} ${sku} non ${adozione.localiSenzaRemota.length === 1 ? 'risulta' : 'risultano'} sul negozio dopo la creazione. Nessun secondo tentativo cieco: si ripubblica.`,
      );
    }
    return {
      abbinate: new Map(adozione.abbinate.map((a) => [a.varianteId, legacyIdFromGid(a.remota.id)])),
      escluse: [],
      avvisoIdentita: descriviIdentitaSenzaLocale(adozione.remoteConIdentitaSenzaLocale),
    };
  }

  private async updateLinkedProductViaGraphql(
    tenantId: string,
    product: ProductWithVariants,
    shopDomain: string,
    accessToken: string,
    correlationId: string,
  ): Promise<{
    readonly legacyId: string;
    readonly escluse: readonly VarianteEsclusa[];
    readonly avvisoIdentita: string | null;
  }> {
    const legacyId = product.shopifyProductId as string;
    const productGid = toShopifyGid('Product', legacyId);
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);

    const orfane = await this.linkOrphanVariants(
      product,
      productGid,
      shopDomain,
      accessToken,
      shopId,
      correlationId,
    );
    const shopifyTitle = await this.ensureOnlineTitle(product, productGid, shopDomain, accessToken);

    // I campi vengono dalla funzione comune col REST: qui si aggiunge solo l'id.
    await this.shopifyGraphql.updateProductCatalog(shopDomain, accessToken, {
      id: productGid,
      ...productChannelFields({ ...product, shopifyTitle }),
    });

    // ── 26.7 · le varianti GIÀ IN CACHE passano dallo storico ──────────────
    // ⛔ La colonna `shopifyVariantId` è una copia che può restare indietro: da
    //    sola autorizzerebbe a scrivere su un GID il cui periodo è chiuso.
    const escluse: VarianteEsclusa[] = [...orfane.escluse];
    const compareAt =
      product.compareAtPriceMinor == null ? null : Number(product.compareAtPriceMinor);
    const inputs: ReturnType<typeof variantBulkInput>[] = [];
    for (const variant of product.variants) {
      const remoteId = variant.shopifyVariantId ?? orfane.abbinate.get(variant.id) ?? null;
      if (!remoteId) {
        continue;
      }
      // ⭐ Le orfane appena abbinate sono già passate dallo storico dentro
      //    `linkOrphanVariants`: non si interroga due volte.
      if (variant.shopifyVariantId && shopId) {
        const uso = await this.storico.collegamentoUsabileVariante(this.prisma, {
          shopId,
          shopifyVariantGid: gidVariante(remoteId),
          variantId: variant.id,
        });
        if (uso.tipo !== 'utilizzabile') {
          escluse.push({
            variantId: variant.id,
            sku: variant.sku,
            gid: gidVariante(remoteId),
            tipo: uso.tipo,
            motivo: uso.motivo,
          });
          this.logger.warn(`Push Shopify: variante esclusa — ${uso.motivo}`);
          await this.rifiutoARegistro(tenantId, shopId, correlationId, {
            operation: PlatformAuditOperation.riaggancio_rifiutato,
            entityId: variant.id,
            entityLabel: variant.sku ?? product.name,
            remoteGid: gidVariante(remoteId),
            detail: `${uso.tipo}: ${uso.motivo}`,
          });
          continue;
        }
      }
      inputs.push(
        variantBulkInput(
          toShopifyGid('ProductVariant', remoteId),
          variantChannelFields(variant, compareAt),
        ),
      );
    }
    if (inputs.length > 0) {
      await this.shopifyGraphql.bulkUpdateVariants(shopDomain, accessToken, productGid, inputs);
    }

    await this.syncProductMediaViaGraphql(
      tenantId,
      product.id,
      productGid,
      shopDomain,
      accessToken,
    );
    return { legacyId, escluse, avvisoIdentita: orfane.avvisoIdentita };
  }

  /**
   * Varianti locali senza id Shopify, cercate SOLO dentro il prodotto
   * collegato e collegate SOLO se la corrispondenza è univoca. Zero o più
   * corrispondenze fermano il push con un errore che le nomina: niente
   * salti silenziosi, niente varianti create per conto dell'operatore (§1.8).
   */
  private async linkOrphanVariants(
    product: ProductWithVariants,
    productGid: string,
    shopDomain: string,
    accessToken: string,
    shopId: string | null,
    correlationId: string,
  ): Promise<{
    readonly abbinate: ReadonlyMap<string, string>;
    readonly escluse: readonly VarianteEsclusa[];
    /** Remote con identità senza locale (prodotti con identità): il push non è «synced». */
    readonly avvisoIdentita: string | null;
  }> {
    // ⭐ Prodotto creato da VestiFlow con l'identità (docs/30 §7.2-ter.1): le varianti
    //    senza id si riconoscono SOLO per `vestiflow.variant_id`, mai per SKU, barcode,
    //    titolo o opzioni; le mancanti si CREANO con la loro identità; le remote con
    //    un'identità che non è di nessuna locale si conservano e si dichiarano — per
    //    questo la rilettura si fa a OGNI push di questi prodotti, non solo con locali
    //    senza id. I prodotti importati o pubblicati prima via REST restano
    //    all'abbinamento legacy qui sotto.
    if (product.shopifyCreateClaimVersion > 0) {
      return this.completaVariantiPerIdentita(product, productGid, shopDomain, accessToken);
    }
    if (!product.variants.some((variant) => !variant.shopifyVariantId)) {
      return { abbinate: new Map(), escluse: [], avvisoIdentita: null };
    }
    const remote = await this.shopifyGraphql.listProductVariants(
      shopDomain,
      accessToken,
      productGid,
    );
    const esito = matchOrphanVariants(product.variants, remote);
    // ⛔ **L'ambiguità NON è un'esclusione, e non va nascosta come tale**: zero o
    //    più corrispondenze fermano il push con un errore che le nomina, come
    //    prima di 26.7. Confonderla con un rifiuto dello storico farebbe passare
    //    per «regola applicata» un abbinamento che nessuno ha saputo decidere.
    if (esito.nonAbbinate.length > 0) {
      throw new Error(
        `Varianti non abbinabili su Shopify — ${describeUnmatchedVariants(esito.nonAbbinate)}`,
      );
    }
    // ── 26.7 · il filtro sta DOPO la scelta, e non prima ───────────────────
    // ⛔ **Togliere il candidato vietato dall'elenco prima di scegliere sarebbe
    //    il difetto**: `matchOrphanVariants` prova SKU, poi barcode, poi
    //    opzioni — senza il candidato giusto la variante ripiegherebbe in
    //    silenzio su un altro, cioè si aggancerebbe alla variante sbagliata.
    //    Si sceglie come sempre, e poi si scarta la scelta vietata.
    const consentite: VariantMatched[] = [];
    const escluse: VarianteEsclusa[] = [];
    for (const match of esito.abbinate) {
      const variantLegacyId = legacyIdFromGid(match.remote.id);
      const uso = shopId
        ? await this.storico.collegamentoUsabileVariante(this.prisma, {
            shopId,
            shopifyVariantGid: gidVariante(variantLegacyId),
            variantId: match.localId,
          })
        : ({ tipo: 'utilizzabile' } as const);
      if (uso.tipo === 'utilizzabile') {
        consentite.push(match);
        continue;
      }
      const variante = product.variants.find((riga) => riga.id === match.localId);
      escluse.push({
        variantId: match.localId,
        sku: variante?.sku ?? null,
        gid: gidVariante(variantLegacyId),
        tipo: uso.tipo,
        motivo: uso.motivo,
      });
      this.logger.warn(`Push Shopify: riaggancio della variante rifiutato — ${uso.motivo}`);
      if (shopId) {
        await this.rifiutoARegistro(product.tenantId, shopId, correlationId, {
          operation: PlatformAuditOperation.riaggancio_rifiutato,
          entityId: match.localId,
          entityLabel: variante?.sku ?? product.name,
          remoteGid: gidVariante(variantLegacyId),
          detail: `${uso.tipo}: ${uso.motivo}`,
        });
      }
    }
    // Gli id si salvano NUMERICI, come quelli già presenti: webhook e push
    // inventario li leggono in quella forma. La conversione a GID avviene
    // sempre all'uscita, con `toShopifyGid`.
    const abbinate = new Map<string, string>();
    await this.prisma.$transaction(
      consentite.map((match) => {
        const variantLegacyId = legacyIdFromGid(match.remote.id);
        abbinate.set(match.localId, variantLegacyId);
        return this.prisma.productVariant.update({
          where: { id: match.localId },
          data: {
            shopifyVariantId: variantLegacyId,
            shopifyInventoryItemId: match.remote.inventoryItemId
              ? legacyIdFromGid(match.remote.inventoryItemId)
              : null,
          },
        });
      }),
    );
    return { abbinate, escluse, avvisoIdentita: null };
  }

  /**
   * Immagini via GraphQL, SENZA duplicarle ai salvataggi ripetuti.
   *
   * ⛔ A tenerle uniche è il `shopifyImageId` SALVATO, non un confronto di URL:
   *    `originalSource.url` non è confrontabile — Shopify ri-ospita il file e
   *    restituisce un URL firmato che cambia a ogni lettura (misurato il
   *    03/09/2026). La prima stesura confrontava quello, non trovava mai nulla,
   *    e ricaricava la stessa immagine a ogni salvataggio.
   *
   * ⭐ I media nuovi si riconoscono per DIFFERENZA: la mutation restituisce
   *    tutti i media del prodotto, e quelli che prima non c'erano sono i nostri,
   *    nell'ordine in cui li abbiamo mandati.
   *
   * ⚠️ Qui NON si riscrive `url` con quello del CDN (il REST lo fa): l'immagine
   *    locale resta la sorgente, e il legame lo tiene l'id.
   */
  private async syncProductMediaViaGraphql(
    tenantId: string,
    productId: string,
    productGid: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    const pending = await this.findPendingImages(tenantId, productId);
    if (pending.length === 0) {
      return;
    }
    const prima = new Set(
      (await this.shopifyGraphql.listProductMedia(shopDomain, accessToken, productGid)).map(
        (media) => media.id,
      ),
    );
    const dopo = await this.shopifyGraphql.addProductMedia(
      shopDomain,
      accessToken,
      productGid,
      pending.map((image) => ({ originalSource: image.url, alt: image.altText ?? undefined })),
    );
    // I nuovi sono quelli che prima non c'erano, nell'ordine in cui sono partiti.
    const nuovi = dopo.filter((media) => !prima.has(media.id));
    for (const [posizione, image] of pending.entries()) {
      const creato = nuovi[posizione];
      if (creato) {
        await this.prisma.productImage.update({
          where: { id: image.id },
          data: { shopifyImageId: creato.id },
        });
      } else {
        this.logger.warn(
          `Immagine Shopify non riconosciuta dopo il caricamento (${productId}/${image.id})`,
        );
      }
    }
  }

  /**
   * Annulla una disattivazione che non è riuscita ad arrivare su Shopify: il
   * flag torna acceso e le giacenze ricominciano a viaggiare.
   *
   * ⭐ `updateMany` con `shopifySyncEnabled: false` nel filtro è ciò che rende
   *    l'operazione RIPETIBILE: se qualcuno l'ha già riacceso — un secondo
   *    tentativo, o l'operatore stesso — non si scrive niente e non si sovrascrive
   *    una decisione più recente con una vecchia.
   *
   * ⚠️ Il messaggio nomina la CONSEGUENZA prima della causa: «rate limit» dice
   *    all'operatore che cosa è andato storto, non che cosa rischia adesso.
   */
  private async undoSyncDisable(
    tenantId: string,
    productId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId, tenantId, shopifySyncEnabled: false },
      data: {
        shopifySyncEnabled: true,
        shopifySyncStatus: ShopifySyncStatus.out_of_sync,
        shopifyLastError: `${SYNC_DISABLE_FAILED_MESSAGE}: ${message}`.slice(0, 500),
      },
    });
  }

  /**
   * Il «Nome Shopify» di un prodotto GIÀ COLLEGATO, quando non è mai stato
   * inizializzato.
   *
   * ⛔ Si LEGGE da Shopify, non si deduce da `name`: i prodotti importati hanno
   *    il nome interno allineato al titolo remoto solo finché qualcuno non lo
   *    accorcia — e dedurlo significherebbe rimandare su Shopify il nome di
   *    magazzino, cioè fare esattamente il danno che questo campo evita.
   */
  private async ensureOnlineTitle(
    product: ProductWithVariants,
    productGid: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<string> {
    if (product.shopifyTitle) {
      return product.shopifyTitle;
    }
    const remoto = await this.shopifyGraphql.getProductTitle(shopDomain, accessToken, productGid);
    const titolo = remoto?.trim() || product.name;
    await this.initOnlineTitle(product.id, titolo);
    return titolo;
  }

  /**
   * Scrive il «Nome Shopify» UNA volta sola: il filtro `shopifyTitle: null` è la
   * garanzia: chi ce l'ha già non viene toccato, nemmeno da un push ripetuto.
   */
  private async initOnlineTitle(productId: string, titolo: string): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId, shopifyTitle: null },
      data: { shopifyTitle: titolo },
    });
  }

  /** Esito di una scrittura remota andata a buon fine: UNA politica per tutti i percorsi. */
  private async markPushSucceeded(productId: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        shopifySyncStatus: ShopifySyncStatus.synced,
        shopifyLastError: null,
        shopifyLastSyncAt: new Date(),
      },
    });
  }

  /**
   * Esito di una scrittura remota fallita. Su un prodotto GIÀ COLLEGATO un
   * fallimento (rate limit, campo rifiutato) non è un errore di creazione: il
   * prodotto esiste, va solo riallineato — `out_of_sync`, non `error`. Chi
   * chiama può dire che è collegato; altrimenti si legge.
   */
  private async markPushFailed(
    productId: string,
    message: string,
    linked?: boolean,
  ): Promise<void> {
    const isLinked =
      linked ??
      Boolean(
        (
          await this.prisma.product.findUnique({
            where: { id: productId },
            select: { shopifyProductId: true },
          })
        )?.shopifyProductId,
      );
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        shopifySyncStatus: isLinked ? ShopifySyncStatus.out_of_sync : ShopifySyncStatus.error,
        shopifyLastError: message.slice(0, 500),
      },
    });
  }

  /** Le immagini locali non ancora su Shopify, in ordine: le cercano entrambi i percorsi. */
  private findPendingImages(tenantId: string, productId: string) {
    return this.prisma.productImage.findMany({
      where: { tenantId, productId, shopifyImageId: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ⛔ Qui viveva `buildShopifyProductPayload`, il payload REST di `POST /products.json`:
  //    la creazione passa da `productSet` con l'identità VestiFlow (`creaConIdentita`).

  private async pushTaxonomyCategory(
    tenantId: string,
    shopifyProductId: string,
    product: ProductWithVariants,
  ): Promise<string | null> {
    const categoryGid = product.shopifyTaxonomyCategoryId?.trim() || null;
    const localCategoryFields = parseCategoryMetafieldsJson(product.shopifyCategoryMetafields);
    const localCategoryCount = countCategoryMetafieldsWithValues(localCategoryFields);

    if (!categoryGid) {
      if (localCategoryCount > 0) {
        return 'Attributi categoria presenti ma categoria Shopify non impostata. Seleziona una categoria taxonomy nel form prodotto.';
      }
      return null;
    }

    try {
      const updated = await this.shopifyTaxonomy.pushProductCategory(
        tenantId,
        shopifyProductId,
        categoryGid,
      );
      if (!updated) {
        return 'Categoria Shopify non assegnata. Verifica la categoria prodotto selezionata.';
      }

      await this.prisma.product.update({
        where: { id: product.id },
        data: {
          shopifyTaxonomyCategoryId: updated.id,
          shopifyTaxonomyCategoryFullName: updated.fullName,
        },
      });
      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push categoria taxonomy fallito';
      this.logger.warn(`Taxonomy prodotto non sincronizzata (${shopifyProductId}): ${message}`);
      return message.slice(0, 500);
    }
  }

  private async verifyRemoteCategoryMetafields(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    taxonomyCategoryId: string | null,
    existingCategoryMetafieldsRaw: unknown,
  ): Promise<string | null> {
    const localFields = parseCategoryMetafieldsJson(existingCategoryMetafieldsRaw);
    const localCount = countCategoryMetafieldsWithValues(localFields);
    if (localCount === 0) {
      return null;
    }

    try {
      const metafieldRows = await this.shopifyAdmin.listProductMetafields(
        shopDomain,
        accessToken,
        shopifyProductId,
      );
      const metafields = mapMetafieldRows(metafieldRows);
      const remoteFields = await this.shopifyCategoryMetafields.parseFromProductMetafields(
        shopDomain,
        accessToken,
        metafields,
        taxonomyCategoryId,
      );
      const remoteCount = countCategoryMetafieldsWithValues(remoteFields);
      return categoryMetafieldsSyncErrorMessage(localCount, remoteCount, null);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Verifica metafield categoria Shopify fallita';
      this.logger.warn(`Verifica metafield categoria fallita (${shopifyProductId}): ${message}`);
      return `Impossibile verificare i metafield di categoria su Shopify: ${message}`.slice(0, 500);
    }
  }

  private async refreshLocalShopifyMetadata(
    productId: string,
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    taxonomyCategoryId: string | null,
    existingCategoryMetafieldsRaw: unknown,
    existingMetafieldsRaw: unknown,
  ): Promise<void> {
    try {
      const metafieldRows = await this.shopifyAdmin.listProductMetafields(
        shopDomain,
        accessToken,
        shopifyProductId,
      );
      const metafields = mapMetafieldRows(metafieldRows);
      const categoryMetafields = await this.shopifyCategoryMetafields.parseFromProductMetafields(
        shopDomain,
        accessToken,
        metafields,
        taxonomyCategoryId,
      );

      await this.prisma.product.update({
        where: { id: productId },
        data: {
          shopifyMetafields: resolveImportedShopifyMetafields(
            metafields,
            existingMetafieldsRaw,
          ) as unknown as Prisma.InputJsonValue,
          shopifyCategoryMetafields: resolveImportedShopifyCategoryMetafields(
            categoryMetafields,
            existingCategoryMetafieldsRaw,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Refresh metadati Shopify fallito';
      this.logger.warn(`Snapshot metafield non aggiornato (${shopifyProductId}): ${message}`);
    }
  }

  private async pushCategoryMetafields(
    tenantId: string,
    shopifyProductId: string,
    product: ProductWithVariants,
  ): Promise<string | null> {
    const fields = parseCategoryMetafieldsJson(product.shopifyCategoryMetafields);
    if (countCategoryMetafieldsWithValues(fields) === 0) {
      return null;
    }

    try {
      const result = await this.shopifyCategoryMetafields.pushProductCategoryMetafields(
        tenantId,
        shopifyProductId,
        fields,
        product.shopifyTaxonomyCategoryId,
      );
      if (result.warning) {
        return result.warning;
      }
      if (result.synced < result.attempted) {
        return `Alcuni metafield di categoria non sono stati sincronizzati su Shopify (${result.synced}/${result.attempted}).`;
      }
      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push category metafields fallito';
      this.logger.warn(
        `Category metafields prodotto non sincronizzati (${shopifyProductId}): ${message}`,
      );
      return message.slice(0, 500);
    }
  }

  private async pushSeasonMetafield(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    season: string | null,
    rawMetafields: unknown,
  ): Promise<void> {
    const trimmed = season?.trim();
    if (!trimmed) {
      return;
    }

    const metafields = Array.isArray(rawMetafields) ? rawMetafields : [];
    const existing = metafields.find(
      (field): field is { id?: number; namespace: string; key: string } =>
        typeof field === 'object' &&
        field !== null &&
        'namespace' in field &&
        'key' in field &&
        (field as { namespace: string }).namespace === VESTIFLOW_METAFIELD_NAMESPACE &&
        (field as { key: string }).key === VESTIFLOW_SEASON_METAFIELD_KEY,
    );

    try {
      await this.shopifyAdmin.upsertProductMetafield(
        shopDomain,
        accessToken,
        shopifyProductId,
        {
          namespace: VESTIFLOW_METAFIELD_NAMESPACE,
          key: VESTIFLOW_SEASON_METAFIELD_KEY,
          value: trimmed,
          type: 'single_line_text_field',
        },
        existing?.id != null ? String(existing.id) : undefined,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push metafield stagione fallito';
      this.logger.warn(`Metafield stagione non sincronizzato (${shopifyProductId}): ${message}`);
    }
  }

  /**
   * I costi d'acquisto verso Shopify, uno per variante.
   *
   * ⭐ **Il try/catch per variante resta, e non è una svista**: un costo che non
   *    arriva non deve impedire agli altri di partire. Quello che cambia con
   *    26.2 è che il fallimento **esce di qui**: restituito a chi chiama, non
   *    lasciato in un `logger.warn` che nessuno rilegge.
   *
   * ⛔ **Prima il push si dichiarava `completato` con i costi caduti**, e il
   *    prodotto finiva `synced`: l'operatore vedeva «tutto a posto» su un
   *    articolo il cui costo su Shopify era quello di prima.
   *
   * ⚠️ Valori, direzione e regole del costo non cambiano: stesso campo, stessa
   *    conversione, stesso zero canonico per il costo assente.
   */
  private async pushVariantCosts(
    shopDomain: string,
    accessToken: string,
    variants: ProductWithVariants['variants'],
  ): Promise<readonly CostoNonRiuscito[]> {
    const falliti: CostoNonRiuscito[] = [];
    for (const variant of variants) {
      // ⛔ Qui il costo assente faceva saltare il push. Non esiste più: un
      // costo canonico zero è `0.00`, ed è quello che il canale deve leggere.
      if (!variant.shopifyInventoryItemId) {
        continue;
      }
      try {
        await this.shopifyAdmin.updateInventoryItemCost(
          shopDomain,
          accessToken,
          variant.shopifyInventoryItemId,
          minorToShopifyDecimal(variant.purchasePriceMinor),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push costo fallito';
        this.logger.warn(`Costo variante ${variant.sku} non sincronizzato: ${message}`);
        falliti.push({ sku: variant.sku, motivo: message });
      }
    }
    return falliti;
  }

  private normalizeOptions(raw: unknown): ProductOptionRow[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter(
        (entry): entry is ProductOptionRow =>
          typeof entry === 'object' &&
          entry !== null &&
          'name' in entry &&
          'values' in entry &&
          typeof (entry as ProductOptionRow).name === 'string' &&
          Array.isArray((entry as ProductOptionRow).values),
      )
      .map((entry) => ({
        name: entry.name,
        values: entry.values.map(String),
      }));
  }

  private async pushProductImages(
    tenantId: string,
    productId: string,
    shopDomain: string,
    accessToken: string,
    shopifyProductId: number,
  ): Promise<void> {
    const images = await this.findPendingImages(tenantId, productId);

    for (const image of images) {
      try {
        const created = await this.shopifyAdmin.createProductImage(
          shopDomain,
          accessToken,
          String(shopifyProductId),
          {
            src: image.url,
            alt: image.altText ?? undefined,
            position: image.sortOrder + 1,
          },
        );
        await this.prisma.productImage.update({
          where: { id: image.id },
          // ⛔ **L’indirizzo della COPIA non si sovrascrive col CDN.** Qui
          //    c’era `url: created.src`, e dopo un push l’articolo tornava a
          //    puntare al file di Shopify — cioè disfaceva l’archiviazione,
          //    e con lei la presenza dell’immagine nel backup, che copia il
          //    bucket e non i link. Il legame lo tiene l’id, non l’URL.
          data: { shopifyImageId: String(created.id) },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push immagine fallito';
        this.logger.warn(`Push immagine Shopify fallito (${productId}/${image.id}): ${message}`);
      }
    }
  }

  /**
   * Abbinamento delle varianti DOPO una creazione REST: per solo SKU, e chi non
   * corrisponde resta scollegato senza errore.
   *
   * ⚠️ È una politica DIVERSA da `matchOrphanVariants` (SKU → barcode →
   *    opzioni, errore se non univoco), e lo si dichiara: la CREAZIONE è fuori
   *    dalla tranche che ha introdotto l'altra, e resta sul REST finché la
   *    Tranche 2 non porta `productSet` — a quel punto le due si unificano.
   */
  // ══════════════════════════════════════════════════════════════════════════
  //  Creazione con identità VestiFlow (docs/30 §7.2-bis)
  //
  //  ⛔ Prima: `POST /products.json` senza identità. Con una risposta persa
  //     (timeout, rete, riavvio) VestiFlow non conosceva l'id del prodotto creato
  //     e alla ripubblicazione ne creava un SECONDO — riprodotto il 15/09/2026.
  //
  //  ⭐ Ora: (1) claim sul prodotto — chi crea, verso quale negozio, con quale
  //     numero di tentativo; (2) rilettura per identità (`productByIdentifier`)
  //     PRIMA di creare: trovato → si adottano gli id e basta; (3) `productSet` in
  //     SOLA creazione, con prodotto, opzioni, varianti e le identità di prodotto e
  //     di ogni variante in una mutation (Shopify rifiuta un secondo prodotto con lo
  //     stesso valore senza toccare il primo, e non lascia niente di un input con una
  //     variante rifiutata: contratto G9–G11 del 15/09/2026); (4) qualunque esito
  //     non-successo → di nuovo rilettura per identità, mai una seconda creazione
  //     alla cieca, nessun fallback a `productCreate`. Ogni chiamata remota e ogni
  //     scrittura locale del tentativo sono condizionate alla propria
  //     `claim_version`: un proprietario superato non scrive e non chiama più.
  //
  //  ⛔ Qui c'era `productCreate` + `productVariantsBulkCreate` con
  //     `REMOVE_STANDALONE_VARIANT`: la variante iniziale nasceva senza identità e
  //     una modifica fatta sul negozio fra le due chiamate veniva cancellata con lei
  //     (riprodotto). Superato il 15/09/2026, pomeriggio: nessuna variante iniziale,
  //     nessuna cancellazione in nessun percorso.
  // ══════════════════════════════════════════════════════════════════════════

  /** La scadenza del claim: oltre, un altro tentativo può RIVENDICARE — non dichiarare morto il precedente. */
  private static readonly LEASE_CLAIM_MS = 5 * 60_000;

  private async creaConIdentita(
    tenantId: string,
    product: ProductWithVariants,
    shopDomain: string,
    accessToken: string,
  ): Promise<
    | { readonly tipo: 'in_corso' }
    | { readonly tipo: 'creato'; readonly legacyId: string }
    | {
        readonly tipo: 'recuperato';
        readonly legacyId: string;
        readonly versione: number;
        readonly completo: boolean;
        readonly motivo: string;
      }
  > {
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    const claim = await this.rivendicaCreazione(product.id, shopId);
    if (!claim) {
      this.logger.log(
        `Creazione Shopify già in corso per ${product.name} (${tenantId}): non ripeto`,
      );
      return { tipo: 'in_corso' };
    }
    const versione = claim.versione;
    try {
      return await this.tentativoDiCreazione(product, shopDomain, accessToken, versione);
    } catch (error: unknown) {
      // ⚠️ Un tentativo FINITO chiude il proprio claim, anche se è finito male: da
      //    qui non partirà più nessuna chiamata, e il prossimo tentativo rilegge
      //    comunque l'identità prima di creare. Il claim che resta aperto è SOLO
      //    quello di un processo morto: è per lui che esiste la scadenza.
      //    Un proprietario superato non chiude niente: il claim non è più suo.
      if (!(error instanceof ShopifyClaimSuperatoException)) {
        await this.chiudiClaim(product.id, versione);
      }
      throw error;
    }
  }

  /** Il tentativo vero, sotto un claim già preso: ogni passo verifica di esserne ancora il proprietario. */
  private async tentativoDiCreazione(
    product: ProductWithVariants,
    shopDomain: string,
    accessToken: string,
    versione: number,
  ): Promise<
    | { readonly tipo: 'creato'; readonly legacyId: string }
    | {
        readonly tipo: 'recuperato';
        readonly legacyId: string;
        readonly versione: number;
        readonly completo: boolean;
        readonly motivo: string;
      }
  > {
    const identita = { namespace: IDENTITA_PRODOTTO.namespace, key: IDENTITA_PRODOTTO.key };

    // ── 0 · le definizioni devono essere quelle previste, non «già esistono» ──
    await this.assicuraProprietario(product.id, versione);
    await this.assicuraDefinizioniIdentita(shopDomain, accessToken);

    // ── 1 · rilettura per identità PRIMA di creare (risposta persa, riavvio, altro processo) ──
    await this.assicuraProprietario(product.id, versione);
    const esistente = await this.shopifyGraphql.productByIdentity(shopDomain, accessToken, {
      ...identita,
      value: product.id,
    });
    if (esistente) {
      return this.recuperaIdentita(product, esistente.id, shopDomain, accessToken, versione);
    }

    // ── 2 · creazione: prodotto, opzioni, varianti e identità in UNA mutation ──
    //    `productSet` in sola creazione (contratto G9–G11): nessuna variante iniziale da
    //    rimuovere, nessuna seconda scrittura. Tutte le varianti locali, nell'ordine locale,
    //    senza limiti né troncamenti: un rifiuto del negozio è un rifiuto (esito sotto).
    const options = this.normalizeOptions(product.options);
    const compareAt =
      product.compareAtPriceMinor == null ? null : Number(product.compareAtPriceMinor);
    let creato: Awaited<ReturnType<ShopifyGraphqlClient['createProductSet']>>;
    try {
      await this.assicuraProprietario(product.id, versione);
      creato = await this.shopifyGraphql.createProductSet(
        shopDomain,
        accessToken,
        buildProductSetCreateInput(product, options, product.variants, compareAt),
      );
    } catch (error: unknown) {
      // ⛔ Esito incerto o rifiuto (anche per identità già presente): si RILEGGE, mai si
      //    ricrea, e nessun fallback a `productCreate`.
      return this.dopoEsitoNonRiuscito(product, shopDomain, accessToken, versione, error);
    }
    const productGid = creato.id;
    const legacyId = legacyIdFromGid(productGid);

    // ── 3 · gli id, per identità, e la chiusura del claim ──
    const recupero = await this.recuperaIdentita(
      product,
      productGid,
      shopDomain,
      accessToken,
      versione,
    );
    if (recupero.tipo === 'recuperato' && !recupero.completo) {
      return recupero;
    }
    await this.chiudiClaim(product.id, versione);
    return { tipo: 'creato', legacyId };
  }

  /**
   * Rivendicazione atomica: `count = 1` solo se non c'è un claim vivo. Un claim scaduto si
   * può riprendere — la scadenza permette di recuperare il lavoro, non dice che il
   * tentativo precedente sia finito: per questo il nuovo proprietario rilegge sempre
   * l'identità prima di creare, e il vecchio è fermato dalla versione.
   */
  private async rivendicaCreazione(
    productId: string,
    shopId: string | null,
  ): Promise<{ readonly claimId: string; readonly versione: number } | null> {
    const claimId = randomUUID();
    const scaduti = new Date(Date.now() - ShopifyProductPushService.LEASE_CLAIM_MS);
    const presa = await this.prisma.product.updateMany({
      where: {
        id: productId,
        shopifyProductId: null,
        OR: [{ shopifyCreateClaimId: null }, { shopifyCreateClaimedAt: { lt: scaduti } }],
      },
      data: {
        shopifyCreateClaimId: claimId,
        shopifyCreateClaimShopId: shopId,
        shopifyCreateClaimedAt: new Date(),
        shopifyCreateClaimVersion: { increment: 1 },
      },
    });
    if (presa.count !== 1) {
      return null;
    }
    const riga = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { shopifyCreateClaimVersion: true, shopifyCreateClaimId: true },
    });
    if (riga.shopifyCreateClaimId !== claimId) {
      // Superati fra l'UPDATE e la lettura: non è il nostro claim.
      return null;
    }
    return { claimId, versione: riga.shopifyCreateClaimVersion };
  }

  /** Prima di OGNI chiamata remota: se la versione non è più la mia, mi fermo. Le sole scritture locali non basterebbero. */
  private async assicuraProprietario(productId: string, versione: number): Promise<void> {
    const riga = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { shopifyCreateClaimVersion: true },
    });
    if (!riga || riga.shopifyCreateClaimVersion !== versione) {
      throw new ShopifyClaimSuperatoException(
        `Creazione Shopify: questo tentativo è stato superato da uno più recente (versione ${versione} → ${riga?.shopifyCreateClaimVersion ?? '?'}); nessuna altra chiamata al negozio.`,
      );
    }
  }

  /** Chiude il claim SOLO se è ancora il mio: un proprietario superato non libera quello di un altro. */
  private async chiudiClaim(productId: string, versione: number): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId, shopifyCreateClaimVersion: versione },
      data: {
        shopifyCreateClaimId: null,
        shopifyCreateClaimShopId: null,
        shopifyCreateClaimedAt: null,
      },
    });
  }

  /**
   * Le due definizioni di metafield, lette PRIMA di fidarsi: assenti → si creano; presenti
   * ma non di tipo `id` per quell'owner → errore esplicito, nessuna creazione (contratto G1).
   */
  private async assicuraDefinizioniIdentita(
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    for (const attesa of [IDENTITA_PRODOTTO, IDENTITA_VARIANTE]) {
      let letta = await this.shopifyGraphql.leggiDefinizioneMetafield(
        shopDomain,
        accessToken,
        attesa.ownerType,
        attesa.namespace,
        attesa.key,
      );
      if (!letta) {
        letta = await this.shopifyGraphql.creaDefinizioneMetafield(shopDomain, accessToken, {
          name: attesa.name,
          namespace: attesa.namespace,
          key: attesa.key,
          type: TIPO_METAFIELD_IDENTITA,
          ownerType: attesa.ownerType,
          description: 'Identità tecnica VestiFlow: non modificare.',
        });
      }
      if (letta.typeName !== TIPO_METAFIELD_IDENTITA || letta.ownerType !== attesa.ownerType) {
        throw new Error(
          `Sul negozio esiste già una definizione ${attesa.namespace}.${attesa.key} ma non è quella prevista (tipo «${letta.typeName}», owner «${letta.ownerType}»): la creazione non parte.`,
        );
      }
    }
  }

  /**
   * Dopo un esito NON riuscito di una chiamata di creazione (esito incerto, rifiuto,
   * proprietario superato): si rilegge l'identità. Trovato → recupero; non trovato → errore
   * al prodotto, il claim resta finché una rilettura riesce, nessuna seconda creazione.
   */
  private async dopoEsitoNonRiuscito(
    product: ProductWithVariants,
    shopDomain: string,
    accessToken: string,
    versione: number,
    errore: unknown,
  ): Promise<
    | {
        readonly tipo: 'recuperato';
        readonly legacyId: string;
        readonly versione: number;
        readonly completo: boolean;
        readonly motivo: string;
      }
    | never
  > {
    if (errore instanceof ShopifyClaimSuperatoException) {
      throw errore;
    }
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    await this.assicuraProprietario(product.id, versione);
    const esistente = await this.shopifyGraphql.productByIdentity(shopDomain, accessToken, {
      namespace: IDENTITA_PRODOTTO.namespace,
      key: IDENTITA_PRODOTTO.key,
      value: product.id,
    });
    if (!esistente) {
      // Non c'è: la creazione non è avvenuta. Non si riprova alla cieca: l'errore lo
      // dice; il tentativo è finito e il claim si chiude (al prossimo push si rilegge di nuovo).
      throw new Error(`Creazione su Shopify non riuscita: ${messaggio}`);
    }
    const recupero = await this.recuperaIdentita(
      product,
      esistente.id,
      shopDomain,
      accessToken,
      versione,
    );
    return { ...recupero, motivo: `${recupero.motivo} (dopo: ${messaggio.slice(0, 160)})` };
  }

  /**
   * RECUPERO degli id per identità: SOLO letture verso Shopify e scritture locali con la
   * versione. Nessun campo locale viene spinto; una variante remota senza identità nostra
   * (la iniziale, o una fatta a mano) si CONSERVA; le locali senza remota restano da
   * completare, e lo si dichiara.
   */
  private async recuperaIdentita(
    product: ProductWithVariants,
    productGid: string,
    shopDomain: string,
    accessToken: string,
    versione: number,
  ): Promise<{
    readonly tipo: 'recuperato';
    readonly legacyId: string;
    readonly versione: number;
    readonly completo: boolean;
    readonly motivo: string;
  }> {
    await this.assicuraProprietario(product.id, versione);
    const remote = await this.shopifyGraphql.listProductVariantsWithIdentity(
      shopDomain,
      accessToken,
      productGid,
      { namespace: IDENTITA_VARIANTE.namespace, key: IDENTITA_VARIANTE.key },
    );
    const legacyId = legacyIdFromGid(productGid);
    const esito = await this.prisma.$transaction((tx) =>
      adottaIdentitaRecuperata(tx, this.storico, this.logger, {
        product,
        versione,
        legacyId,
        remote,
      }),
    );

    const parti: string[] = [
      `Identità Shopify recuperata (prodotto ${legacyId}): nessun dato inviato in questo giro.`,
    ];
    if (esito.localiSenzaRemota.length > 0) {
      parti.push(
        `${esito.localiSenzaRemota.length} ${esito.localiSenzaRemota.length === 1 ? 'variante locale non è ancora' : 'varianti locali non sono ancora'} sul negozio: completamento in sospeso.`,
      );
    }
    if (esito.remoteSenzaIdentita.length > 0) {
      parti.push(
        `${esito.remoteSenzaIdentita.length} ${esito.remoteSenzaIdentita.length === 1 ? 'variante remota senza identità VestiFlow è stata conservata' : 'varianti remote senza identità VestiFlow sono state conservate'} (non si elimina né si sovrascrive).`,
      );
    }
    const senzaLocale = descriviIdentitaSenzaLocale(esito.remoteConIdentitaSenzaLocale);
    if (senzaLocale) {
      parti.push(senzaLocale);
    }
    return {
      tipo: 'recuperato',
      legacyId,
      versione,
      completo: esito.localiSenzaRemota.length === 0,
      motivo: parti.join(' '),
    };
  }

  // ⛔ Qui viveva `persistShopifyIds`, l'abbinamento PER SKU del risultato REST: gli id si
  //    scrivono ora per identità (`adottaIdentitaRecuperata`), e le varianti senza SKU non
  //    restano più scollegate.

  // ⭐ L'adozione degli id e lo storico della pubblicazione (già `registraStorico`) stanno in
  //    `shopify-identita-adozione.util`: li usano il recupero del push E il webhook anticipato.
}
