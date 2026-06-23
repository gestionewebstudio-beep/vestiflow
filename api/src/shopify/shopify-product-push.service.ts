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
import { ShopifyConnectionService } from './shopify-connection.service';
import { minorToShopifyDecimal } from './shopify-money.util';
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
import { plainTextToShopifyBodyHtml, normalizeProductDescription } from './shopify-html.util';

type ProductWithVariants = Product & { variants: ProductVariant[] };

type ProductOptionRow = { readonly name: string; readonly values: readonly string[] };
type VariantOptionRow = { readonly name: string; readonly value: string };

export type ShopifyProductPushSkipReason =
  | 'not_connected'
  | 'missing_write_products_scope'
  | 'archived';

export interface ShopifyProductPushResult {
  readonly pushed: boolean;
  readonly reason?: ShopifyProductPushSkipReason | 'shopify_error';
  /** Metafield categoria e refresh metadata proseguono in background (evita timeout gateway). */
  readonly followUpInBackground?: boolean;
}

export type ShopifyProductDeleteSkipReason =
  | 'not_linked'
  | 'not_connected'
  | 'missing_write_products_scope';

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
      select: { id: true, status: true },
    });
    if (!product) {
      return { ok: false, reason: 'shopify_error' };
    }

    if (product.status === ProductStatus.archived) {
      return { ok: false, reason: 'archived' };
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
      const payload = this.buildShopifyProductPayload(product);

      const shopifyProduct = product.shopifyProductId
        ? await this.shopifyAdmin.updateProduct(
            shopDomain,
            accessToken,
            product.shopifyProductId,
            payload,
          )
        : await this.shopifyAdmin.createProduct(shopDomain, accessToken, payload);

      await this.persistShopifyIds(product, shopifyProduct);
      await this.pushProductImages(
        tenantId,
        product.id,
        shopDomain,
        accessToken,
        shopifyProduct.id,
      );
      await this.pushSeasonMetafield(
        shopDomain,
        accessToken,
        String(shopifyProduct.id),
        product.season,
        product.shopifyMetafields,
      );
      const taxonomyWarning = await this.pushTaxonomyCategory(
        tenantId,
        String(shopifyProduct.id),
        product,
      );
      const categoryMetafieldsWarning = await this.pushCategoryMetafields(
        tenantId,
        String(shopifyProduct.id),
        product,
      );
      await this.refreshLocalShopifyMetadata(
        product.id,
        shopDomain,
        accessToken,
        String(shopifyProduct.id),
        product.shopifyTaxonomyCategoryId,
        product.shopifyCategoryMetafields,
        product.shopifyMetafields,
      );
      const verifyWarning = await this.verifyRemoteCategoryMetafields(
        shopDomain,
        accessToken,
        String(shopifyProduct.id),
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
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            shopifySyncStatus: ShopifySyncStatus.synced,
            shopifyLastError: null,
            shopifyLastSyncAt: new Date(),
          },
        });
      }

      await this.shopifyConnection.touchSync(tenantId);
      this.logger.log(
        `Prodotto Shopify sincronizzato (${tenantId}): ${product.name} → ${shopifyProduct.id}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push prodotto Shopify';
      this.logger.warn(`Push prodotto Shopify fallito (${tenantId}/${productId}): ${message}`);
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          shopifySyncStatus: ShopifySyncStatus.error,
          shopifyLastError: message.slice(0, 500),
        },
      });
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

  private buildShopifyProductPayload(product: ProductWithVariants): Record<string, unknown> {
    const options = this.normalizeOptions(product.options);
    const { shopifyOptions, variantRows } = this.buildVariantsPayload(options, product.variants);

    return {
      title: product.name,
      body_html: plainTextToShopifyBodyHtml(normalizeProductDescription(product.description)),
      vendor: product.brand ?? undefined,
      product_type: product.category ?? undefined,
      tags: product.tags.length > 0 ? formatShopifyTags(product.tags) : undefined,
      status: this.mapProductStatus(product.status),
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
      if (variant.purchasePriceMinor == null || !variant.shopifyInventoryItemId) {
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

  private buildVariantsPayload(
    options: ProductOptionRow[],
    variants: ProductWithVariants['variants'],
  ): {
    shopifyOptions: { name: string; values: string[] }[];
    variantRows: Record<string, unknown>[];
  } {
    const effectiveOptions =
      options.length > 0 ? options : [{ name: 'Title', values: ['Default Title'] }];

    const shopifyOptions = effectiveOptions.map((option) => ({
      name: option.name,
      values: [...option.values],
    }));

    const optionNames = effectiveOptions.map((option) => option.name);

    const variantRows = variants.map((variant) => {
      const optionValues = Array.isArray(variant.optionValues)
        ? (variant.optionValues as VariantOptionRow[])
        : [];
      const byName = new Map(optionValues.map((entry) => [entry.name, entry.value]));

      const row: Record<string, unknown> = {
        sku: variant.sku,
        price: minorToShopifyDecimal(variant.sellingPriceMinor),
        barcode: variant.barcode ?? undefined,
        inventory_management: 'shopify',
      };

      if (variant.compareAtPriceMinor != null) {
        row['compare_at_price'] = minorToShopifyDecimal(variant.compareAtPriceMinor);
      }

      if (variant.shopifyVariantId) {
        row['id'] = Number(variant.shopifyVariantId);
      }

      if (options.length === 0) {
        row['option1'] = 'Default Title';
      } else {
        if (optionNames[0]) {
          row['option1'] = byName.get(optionNames[0]) ?? optionNames[0];
        }
        if (optionNames[1]) {
          row['option2'] = byName.get(optionNames[1]);
        }
        if (optionNames[2]) {
          row['option3'] = byName.get(optionNames[2]);
        }
      }

      return row;
    });

    return { shopifyOptions, variantRows };
  }

  private mapProductStatus(status: ProductStatus): 'draft' | 'active' | 'archived' {
    switch (status) {
      case ProductStatus.active:
        return 'active';
      case ProductStatus.archived:
        return 'archived';
      default:
        return 'draft';
    }
  }

  private async pushProductImages(
    tenantId: string,
    productId: string,
    shopDomain: string,
    accessToken: string,
    shopifyProductId: number,
  ): Promise<void> {
    const images = await this.prisma.productImage.findMany({
      where: { tenantId, productId, shopifyImageId: null },
      orderBy: { sortOrder: 'asc' },
    });

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
