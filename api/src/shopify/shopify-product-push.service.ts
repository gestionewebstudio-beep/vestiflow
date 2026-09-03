import { Injectable, Logger } from '@nestjs/common';
import {
  CatalogOrigin,
  ProductStatus,
  ShopifyCatalogLinkKind,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  type Prisma,
  type Product,
  type ProductVariant,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { productChannelFields } from './shopify-product-payload.util';
import { SYNC_DISABLE_FAILED_MESSAGE } from './shopify-user-error.util';
import { describeUnmatchedVariants, matchOrphanVariants } from './shopify-variant-match.util';
import { ShopifyConnectionService } from './shopify-connection.service';
import { minorToShopifyDecimal, legacyIdFromGid, toShopifyGid } from './shopify-money.util';
import {
  buildVariantsPayload,
  variantChannelFields,
  variantBulkInput,
} from './shopify-variant-payload.util';
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
import { formatShopifyTags } from './shopify-product-metadata.util';

type ProductWithVariants = Product & { variants: ProductVariant[] };

type ProductOptionRow = { readonly name: string; readonly values: readonly string[] };

export type ShopifyProductPushSkipReason =
  'not_connected' | 'missing_write_products_scope' | 'archived' | 'sync_disabled' | 'not_linked';

export interface ShopifyProductPushResult {
  readonly pushed: boolean;
  readonly reason?: ShopifyProductPushSkipReason | 'shopify_error';
  /** Metafield categoria e refresh metadata proseguono in background (evita timeout gateway). */
  readonly followUpInBackground?: boolean;
}

export type ShopifyProductDeleteSkipReason =
  'not_linked' | 'not_connected' | 'missing_write_products_scope';

export interface ShopifyProductDeleteResult {
  readonly deleted: boolean;
  readonly reason?: ShopifyProductDeleteSkipReason | 'shopify_error';
}

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
  ) {}

  async pushProduct(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    const guard = await this.evaluatePushGuard(tenantId, productId);
    if (!guard.ok) {
      return { pushed: false, reason: guard.reason };
    }

    await this.markProductSyncing(productId);
    await this.executePushWork(tenantId, productId);

    const status = await this.readProductSyncStatus(productId);
    if (status === ShopifySyncStatus.error) {
      return { pushed: false, reason: 'shopify_error' };
    }
    return { pushed: true };
  }

  /**
   * Avvia sync completa in background e risponde subito (evita 504 gateway su Railway).
   * Usato dal pulsante «Sincronizza con Shopify» nel dettaglio prodotto.
   */
  async enqueuePush(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    const guard = await this.evaluatePushGuard(tenantId, productId);
    if (!guard.ok) {
      return { pushed: false, reason: guard.reason };
    }

    const lockKey = this.pushLockKey(tenantId, productId);
    if (this.pushInFlight.has(lockKey)) {
      this.logger.debug(`Push Shopify già in corso (${tenantId}/${productId})`);
      return { pushed: true, followUpInBackground: true };
    }

    await this.markProductSyncing(productId);
    void this.executePushWork(tenantId, productId);

    return { pushed: true, followUpInBackground: true };
  }

  private pushLockKey(tenantId: string, productId: string): string {
    return `${tenantId}:${productId}`;
  }

  private async evaluatePushGuard(
    tenantId: string,
    productId: string,
  ): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: ShopifyProductPushSkipReason | 'shopify_error' }
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
      select: { id: true, status: true, shopifySyncEnabled: true },
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

    return { ok: true };
  }

  private async markProductSyncing(productId: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: { shopifySyncStatus: ShopifySyncStatus.syncing, shopifyLastError: null },
    });
  }

  private async readProductSyncStatus(productId: string): Promise<ShopifySyncStatus | null> {
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { shopifySyncStatus: true },
    });
    return row?.shopifySyncStatus ?? null;
  }

  private async executePushWork(tenantId: string, productId: string): Promise<void> {
    const lockKey = this.pushLockKey(tenantId, productId);
    if (this.pushInFlight.has(lockKey)) {
      return;
    }
    this.pushInFlight.add(lockKey);

    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!product || product.status === ProductStatus.archived) {
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            shopifySyncStatus: ShopifySyncStatus.out_of_sync,
            shopifyLastError: 'Push Shopify interrotto: prodotto non più disponibile.',
          },
        });
        return;
      }

      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      // ⭐ Prodotto GIÀ COLLEGATO: la modifica passa da GraphQL (docs/24 §1.6,
      //    primo pezzo della Tranche 2). ⛔ Nessun fallback REST: se GraphQL
      //    fallisce, l'errore arriva al catch e resta visibile sul prodotto.
      // ⚠️ La CREAZIONE resta sul REST finché la Tranche 2 non porta productSet:
      //    non è una funzione nuova su quel percorso, è quella di sempre.
      let shopifyProductLegacyId: string;
      if (product.shopifyProductId) {
        shopifyProductLegacyId = await this.updateLinkedProductViaGraphql(
          tenantId,
          product,
          shopDomain,
          accessToken,
        );
      } else {
        const payload = this.buildShopifyProductPayload(product);
        const shopifyProduct = await this.shopifyAdmin.createProduct(
          shopDomain,
          accessToken,
          payload,
        );
        await this.persistShopifyIds(product, shopifyProduct);
        // Creato ORA con il nome interno: da adesso quel titolo è il «Nome
        // Shopify», e i due si possono separare senza che nessuno li riallinei.
        await this.initOnlineTitle(product.id, productChannelFields(product).title);
        await this.pushProductImages(
          tenantId,
          product.id,
          shopDomain,
          accessToken,
          shopifyProduct.id,
        );
        shopifyProductLegacyId = String(shopifyProduct.id);
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
      await this.pushVariantCosts(shopDomain, accessToken, product.variants);

      const syncWarning = [taxonomyWarning, categoryMetafieldsWarning, verifyWarning]
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push prodotto Shopify';
      this.logger.warn(`Push prodotto Shopify fallito (${tenantId}/${productId}): ${message}`);
      await this.markPushFailed(productId, message);
    } finally {
      this.pushInFlight.delete(lockKey);
    }
  }

  /** Elimina su Shopify un prodotto collegato (write-through). */
  async deleteProduct(
    tenantId: string,
    shopifyProductId: string | null,
  ): Promise<ShopifyProductDeleteResult> {
    if (!shopifyProductId) {
      return { deleted: false, reason: 'not_linked' };
    }

    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { deleted: false, reason: 'not_connected' };
    }

    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);

    if (!shopifyHasScope(effectiveScopes, SHOPIFY_WRITE_PRODUCTS_SCOPE)) {
      return { deleted: false, reason: 'missing_write_products_scope' };
    }

    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      await this.shopifyAdmin.deleteProduct(shopDomain, accessToken, shopifyProductId);
      this.logger.log(
        `Prodotto eliminato su Shopify (${tenantId}, shop=${shopDomain}, id=${shopifyProductId})`,
      );
      return { deleted: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Eliminazione Shopify fallita';
      this.logger.warn(`Delete prodotto Shopify (${tenantId}, ${shopifyProductId}): ${message}`);
      return { deleted: false, reason: 'shopify_error' };
    }
  }

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
   * Mapping e id restano com'erano: riaccendendo, il push ordinario ritrova
   * il prodotto e lo riallinea per intero, stato locale compreso.
   */
  async archiveOnSyncDisabled(
    tenantId: string,
    productId: string,
  ): Promise<ShopifyProductPushResult> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, name: true, shopifyProductId: true },
    });
    if (!product?.shopifyProductId) {
      return { pushed: false, reason: 'not_linked' };
    }
    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      await this.shopifyGraphql.setProductStatus(
        shopDomain,
        accessToken,
        toShopifyGid('Product', product.shopifyProductId),
        'ARCHIVED',
      );
      await this.markPushSucceeded(productId);
      this.logger.log(`Prodotto Shopify archiviato a sync spento (${tenantId}): ${product.name}`);
      return { pushed: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Archiviazione Shopify fallita';
      this.logger.warn(`Archiviazione Shopify fallita (${tenantId}/${productId}): ${message}`);
      await this.undoSyncDisable(tenantId, productId, message);
      return { pushed: false, reason: 'shopify_error' };
    }
  }

  /**
   * La modifica di un prodotto già collegato, via GraphQL, in quattro passi:
   * varianti orfane, campi prodotto e stato, varianti, immagini.
   * Restituisce l'id numerico salvato, che il resto del push usa com'era.
   */
  private async updateLinkedProductViaGraphql(
    tenantId: string,
    product: ProductWithVariants,
    shopDomain: string,
    accessToken: string,
  ): Promise<string> {
    const legacyId = product.shopifyProductId as string;
    const productGid = toShopifyGid('Product', legacyId);

    const abbinate = await this.linkOrphanVariants(product, productGid, shopDomain, accessToken);
    const shopifyTitle = await this.ensureOnlineTitle(product, productGid, shopDomain, accessToken);

    // I campi vengono dalla funzione comune col REST: qui si aggiunge solo l'id.
    await this.shopifyGraphql.updateProductCatalog(shopDomain, accessToken, {
      id: productGid,
      ...productChannelFields({ ...product, shopifyTitle }),
    });

    const compareAt =
      product.compareAtPriceMinor == null ? null : Number(product.compareAtPriceMinor);
    const inputs = product.variants.flatMap((variant) => {
      const remoteId = variant.shopifyVariantId ?? abbinate.get(variant.id) ?? null;
      if (!remoteId) {
        return [];
      }
      return [
        variantBulkInput(
          toShopifyGid('ProductVariant', remoteId),
          variantChannelFields(variant, compareAt),
        ),
      ];
    });
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
    return legacyId;
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
  ): Promise<ReadonlyMap<string, string>> {
    if (!product.variants.some((variant) => !variant.shopifyVariantId)) {
      return new Map();
    }
    const remote = await this.shopifyGraphql.listProductVariants(
      shopDomain,
      accessToken,
      productGid,
    );
    const esito = matchOrphanVariants(product.variants, remote);
    if (esito.nonAbbinate.length > 0) {
      throw new Error(
        `Varianti non abbinabili su Shopify — ${describeUnmatchedVariants(esito.nonAbbinate)}`,
      );
    }
    // Gli id si salvano NUMERICI, come quelli già presenti: webhook e push
    // inventario li leggono in quella forma. La conversione a GID avviene
    // sempre all'uscita, con `toShopifyGid`.
    const abbinate = new Map<string, string>();
    await this.prisma.$transaction(
      esito.abbinate.map((match) => {
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
    return abbinate;
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

  private buildShopifyProductPayload(product: ProductWithVariants): Record<string, unknown> {
    const options = this.normalizeOptions(product.options);
    const { shopifyOptions, variantRows } = buildVariantsPayload(
      options,
      product.variants,
      // Sei decimali dal 17/08: `Number` conserva la coda. `null` resta
      // `null` — nessun barrato NON e' un barrato a zero.
      product.compareAtPriceMinor == null ? null : Number(product.compareAtPriceMinor),
    );

    // Stessi campi del GraphQL, rinominati nella grafia del vecchio percorso.
    const fields = productChannelFields(product);
    return {
      title: fields.title,
      body_html: fields.descriptionHtml,
      vendor: fields.vendor,
      product_type: fields.productType,
      tags: fields.tags ? formatShopifyTags([...fields.tags]) : undefined,
      status: fields.status.toLowerCase(),
      options: shopifyOptions,
      variants: variantRows,
    };
  }

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

  private async pushVariantCosts(
    shopDomain: string,
    accessToken: string,
    variants: ProductWithVariants['variants'],
  ): Promise<void> {
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
      }
    }
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
          data: { shopifyImageId: String(created.id), url: created.src },
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
  private async persistShopifyIds(
    product: ProductWithVariants,
    shopifyProduct: {
      id: number;
      variants: readonly { id: number; sku: string | null; inventory_item_id: number }[];
    },
  ): Promise<void> {
    const variantsBySku = new Map(
      shopifyProduct.variants
        .filter((variant) => variant.sku)
        .map((variant) => [variant.sku!.toLowerCase(), variant]),
    );

    const variantUpdates = product.variants.flatMap((variant) => {
      // Varianti senza SKU locale (facoltativo alla creazione) non sono
      // abbinabili per codice al risultato Shopify: restano senza
      // shopifyVariantId collegato finche' non ricevono uno SKU.
      if (!variant.sku) {
        return [];
      }
      const shopifyVariant = variantsBySku.get(variant.sku.toLowerCase());
      if (!shopifyVariant) {
        return [];
      }
      return [
        this.prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            shopifyVariantId: String(shopifyVariant.id),
            shopifyInventoryItemId: String(shopifyVariant.inventory_item_id),
          },
        }),
      ];
    });

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: product.id },
        data: {
          shopifyProductId: String(shopifyProduct.id),
          catalogOrigin: CatalogOrigin.vestiflow,
          shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        },
      }),
      ...variantUpdates,
    ]);
  }
}

