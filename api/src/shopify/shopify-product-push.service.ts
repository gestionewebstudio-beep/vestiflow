import { Injectable, Logger } from '@nestjs/common';
import {
  ProductStatus,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  type Product,
  type ProductVariant,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { minorToShopifyDecimal } from './shopify-money.util';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { SHOPIFY_WRITE_PRODUCTS_SCOPE, shopifyHasScope } from './shopify-scopes.util';

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
}

/**
 * Write-through catalogo VestiFlow → Shopify (create/update prodotto).
 * Best-effort: il prodotto locale resta valido anche se Shopify fallisce.
 */
@Injectable()
export class ShopifyProductPushService {
  private readonly logger = new Logger(ShopifyProductPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
  ) {}

  async pushProduct(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { pushed: false, reason: 'not_connected' };
    }

    if (!shopifyHasScope(connection.scopes, SHOPIFY_WRITE_PRODUCTS_SCOPE)) {
      this.logger.debug(
        `Push prodotto saltato (${tenantId}): scope ${SHOPIFY_WRITE_PRODUCTS_SCOPE} assente`,
      );
      return { pushed: false, reason: 'missing_write_products_scope' };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: { variants: true },
    });
    if (!product) {
      return { pushed: false, reason: 'shopify_error' };
    }

    if (product.status === ProductStatus.archived) {
      return { pushed: false, reason: 'archived' };
    }

    try {
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
      await this.shopifyConnection.touchSync(tenantId);

      this.logger.log(
        `Prodotto Shopify sincronizzato (${tenantId}): ${product.name} → ${shopifyProduct.id}`,
      );
      return { pushed: true };
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
      return { pushed: false, reason: 'shopify_error' };
    }
  }

  private buildShopifyProductPayload(product: ProductWithVariants): Record<string, unknown> {
    const options = this.normalizeOptions(product.options);
    const { shopifyOptions, variantRows } = this.buildVariantsPayload(options, product.variants);

    return {
      title: product.name,
      body_html: product.description ?? '',
      vendor: product.brand ?? undefined,
      product_type: product.category ?? undefined,
      status: this.mapProductStatus(product.status),
      options: shopifyOptions,
      variants: variantRows,
    };
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
          shopifySyncStatus: ShopifySyncStatus.synced,
          shopifyLastSyncAt: new Date(),
          shopifyLastError: null,
        },
      }),
      ...variantUpdates,
    ]);
  }
}
