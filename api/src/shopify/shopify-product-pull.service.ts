import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  ProductStatus,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { syncProductImagesFromShopify } from '../products/product-images.sync';
import type { ShopifyAdminProduct } from './shopify-admin.client';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import type { ProductShopifyEnrichment } from './shopify-product-metadata.types';
import { PRODUCT_IMPORT_TX } from './shopify-product-metadata.types';
import { parseShopifyTags } from './shopify-product-metadata.util';
import { shopifyDecimalToMinor } from './shopify-money.util';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { SHOPIFY_READ_PRODUCTS_SCOPE, shopifyHasScope } from './shopify-scopes.util';

export interface ShopifyCatalogSyncResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteProductCount: number;
  readonly failed: readonly { shopifyProductId: string; message: string }[];
}

type VariantOptionRow = { readonly name: string; readonly value: string };

@Injectable()
export class ShopifyProductPullService {
  private readonly logger = new Logger(ShopifyProductPullService.name);

  /** Evita import catalogo paralleli per lo stesso tenant (process-local). */
  private readonly catalogPullInFlight = new Map<string, Promise<ShopifyCatalogSyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyEnrichment: ShopifyProductEnrichmentService,
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
    const effectiveScopes =
      connection.scopes.length > 0 ? connection.scopes : (credential?.scopes ?? []);

    if (!shopifyHasScope(effectiveScopes, SHOPIFY_READ_PRODUCTS_SCOPE)) {
      this.logger.warn(`Import catalogo bloccato (${tenantId}): scope read_products assente`);
      throw new UnprocessableEntityException(
        'Permesso read_products mancante. Ricollega Shopify per autorizzare la lettura del catalogo.',
      );
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const remoteProducts = await this.shopifyAdmin.listAllProducts(shopDomain, accessToken);
    this.logger.log(
      `Import catalogo Shopify (${tenantId}): ${remoteProducts.length} prodotti da ${shopDomain}`,
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyProductId: string; message: string }[] = [];

    for (const remote of remoteProducts) {
      try {
        const enrichment = await this.shopifyEnrichment.enrichProduct(
          shopDomain,
          accessToken,
          remote,
          { fetchVariantCosts: false, skipRemoteMetadata: true },
        );
        const outcome = await this.importProduct(tenantId, remote, enrichment);
        if (outcome === 'imported') {
          imported += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Import fallito';
        failed.push({ shopifyProductId: String(remote.id), message: message.slice(0, 300) });
        await this.recordProductImportError(tenantId, String(remote.id), message);
      }
    }

    await this.shopifyConnection.touchSync(tenantId);
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

    try {
      return await this.importProduct(tenantId, remote, enrichment);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Import webhook fallito';
      await this.recordProductImportError(tenantId, String(remote.id), message);
      throw error;
    }
  }

  private async importProduct(
    tenantId: string,
    remote: ShopifyAdminProduct,
    enrichment?: ProductShopifyEnrichment,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const shopifyProductId = String(remote.id);
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, shopifyProductId },
      include: { variants: true },
    });

    const options = this.mapOptions(remote);
    const status = this.mapStatus(remote.status);
    const tags = enrichment?.tags ?? parseShopifyTags(remote.tags);
    const productData = {
      name: remote.title.trim() || 'Prodotto Shopify',
      description: remote.body_html ?? null,
      brand: remote.vendor?.trim() || null,
      category: remote.product_type?.trim() || null,
      season: enrichment?.season ?? existing?.season ?? null,
      tags: [...tags],
      seoTitle: enrichment?.seoTitle ?? null,
      seoDescription: enrichment?.seoDescription ?? null,
      shopifyCollections: (enrichment?.collections ?? []) as unknown as Prisma.InputJsonValue,
      shopifyMetafields: (enrichment?.metafields ?? []) as unknown as Prisma.InputJsonValue,
      status,
      options: options as unknown as Prisma.InputJsonValue,
      shopifyProductId,
      shopifySyncStatus: ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: null,
    };

    if (!existing) {
      const reservedSkus = await this.loadTenantSkus(tenantId);
      await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: { tenantId, ...productData },
        });

        for (const variant of remote.variants) {
          const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
          reservedSkus.add(sku.toLowerCase());
          await tx.productVariant.create({
            data: {
              tenantId,
              productId: product.id,
              sku,
              optionValues: this.mapVariantOptions(
                remote,
                variant,
              ) as unknown as Prisma.InputJsonValue,
              barcode: variant.barcode ?? null,
              currency: 'EUR',
              sellingPriceMinor: shopifyDecimalToMinor(variant.price ?? '0'),
              purchasePriceMinor: enrichment?.variantPurchasePriceMinor.get(variant.id) ?? null,
              compareAtPriceMinor: variant.compare_at_price
                ? shopifyDecimalToMinor(variant.compare_at_price)
                : null,
              shopifyVariantId: String(variant.id),
              shopifyInventoryItemId: String(variant.inventory_item_id),
            },
          });
        }

        await syncProductImagesFromShopify(tx, tenantId, product.id, remote.images);
      }, PRODUCT_IMPORT_TX);
      return 'imported';
    }

    const reservedSkus = await this.loadTenantSkus(tenantId, existing.id);
    const byShopifyVariantId = new Map(
      existing.variants.filter((v) => v.shopifyVariantId).map((v) => [v.shopifyVariantId!, v]),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: productData,
      });

      for (const variant of remote.variants) {
        const shopifyVariantId = String(variant.id);
        const matched = byShopifyVariantId.get(shopifyVariantId);
        const purchasePriceMinor =
          enrichment?.variantPurchasePriceMinor.get(variant.id) ??
          matched?.purchasePriceMinor ??
          null;
        const variantData = {
          optionValues: this.mapVariantOptions(remote, variant) as unknown as Prisma.InputJsonValue,
          barcode: variant.barcode ?? null,
          sellingPriceMinor: shopifyDecimalToMinor(variant.price ?? '0'),
          purchasePriceMinor,
          compareAtPriceMinor: variant.compare_at_price
            ? shopifyDecimalToMinor(variant.compare_at_price)
            : null,
          shopifyVariantId,
          shopifyInventoryItemId: String(variant.inventory_item_id),
        };

        if (matched) {
          await tx.productVariant.update({
            where: { id: matched.id },
            data: variantData,
          });
        } else {
          const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
          reservedSkus.add(sku.toLowerCase());
          await tx.productVariant.create({
            data: {
              tenantId,
              productId: existing.id,
              sku,
              currency: 'EUR',
              ...variantData,
            },
          });
        }
      }

      await syncProductImagesFromShopify(tx, tenantId, existing.id, remote.images);
    }, PRODUCT_IMPORT_TX);

    return 'updated';
  }

  private async recordProductImportError(
    tenantId: string,
    shopifyProductId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.product.updateMany({
      where: { tenantId, shopifyProductId },
      data: {
        shopifySyncStatus: ShopifySyncStatus.error,
        shopifyLastError: message.slice(0, 500),
      },
    });
  }

  private async loadTenantSkus(tenantId: string, excludeProductId?: string): Promise<Set<string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { sku: true },
    });
    return new Set(rows.map((row) => row.sku.toLowerCase()));
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
