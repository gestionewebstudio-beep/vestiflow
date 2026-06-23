import type { EntityId, IsoDateString } from '@core/models/common.model';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product, ProductOption } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { ShopifyLink } from '@core/models/shopify.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { stripHtmlToPlainText } from '@core/utils/html-text.util';

/** Riga prodotto come restituita dall'API NestJS (Prisma JSON). */
export interface ProductApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly name: string;
  readonly description?: string | null;
  readonly brand?: string | null;
  readonly category?: string | null;
  readonly shopifyTaxonomyCategoryId?: string | null;
  readonly shopifyTaxonomyCategoryFullName?: string | null;
  readonly season?: string | null;
  readonly tags?: readonly string[];
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly shopifyCollections?: unknown;
  readonly shopifyMetafields?: unknown;
  readonly shopifyCategoryMetafields?: unknown;
  readonly status: Product['status'];
  readonly catalogOrigin: CatalogOrigin;
  readonly options: readonly ProductOption[];
  readonly shopifyProductId?: string | null;
  readonly shopifySyncStatus: string;
  readonly shopifyLastSyncAt?: string | null;
  readonly shopifyLastError?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly variants?: readonly ProductVariantApiRow[];
  readonly images?: readonly ProductImageApiRow[];
}

export interface ProductImageApiRow {
  readonly id: EntityId;
  readonly url: string;
  readonly altText?: string | null;
  readonly sortOrder: number;
}

export interface ProductVariantApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  readonly optionValues: readonly { name: string; value: string }[];
  readonly barcode?: string | null;
  readonly currency: string;
  readonly sellingPriceMinor: number;
  readonly purchasePriceMinor?: number | null;
  readonly compareAtPriceMinor?: number | null;
  readonly shopifyVariantId?: string | null;
  readonly shopifyInventoryItemId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LocationApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly name: string;
  readonly code?: string | null;
  readonly isActive: boolean;
  readonly storeId?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly shopifyLocationId?: string | null;
  readonly shopifySyncStatus: string;
  readonly shopifyLastSyncAt?: string | null;
  readonly shopifyLastError?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryLevelApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly variantId: EntityId;
  readonly locationId: EntityId;
  readonly onHand: number;
  readonly available: number;
  readonly committed: number;
  readonly incoming: number;
  readonly reserved: number;
  readonly minThreshold: number;
  readonly updatedAt: string;
}

export interface StockMovementApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly type: StockMovement['type'];
  readonly variantId: EntityId;
  readonly sku: string;
  readonly locationId: EntityId;
  readonly targetLocationId?: string | null;
  readonly quantity: number;
  readonly direction?: StockMovement['direction'] | null;
  readonly reason?: string | null;
  readonly createdAt: string;
  readonly createdById?: string | null;
  readonly createdByName: string;
  readonly origin?: string | null;
}

function toIsoDate(value: string | null | undefined): IsoDateString | undefined {
  return value ?? undefined;
}

function mapShopifyLink(
  status: string,
  shopifyId?: string | null,
  lastSyncAt?: string | null,
  lastError?: string | null,
): ShopifyLink | undefined {
  if (status === ShopifySyncStatus.NotConnected && !shopifyId) {
    return undefined;
  }
  return {
    status: status as ShopifyLink['status'],
    shopifyId: shopifyId ?? undefined,
    lastSyncedAt: toIsoDate(lastSyncAt),
    lastError: lastError ?? undefined,
  };
}

function parseJsonArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(guard);
}

function isShopifyCollectionRef(item: unknown): item is { id: string; title: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    'title' in item &&
    typeof (item as { id: unknown }).id === 'string' &&
    typeof (item as { title: unknown }).title === 'string'
  );
}

function isShopifyMetafieldRef(item: unknown): item is {
  namespace: string;
  key: string;
  value: string;
  type?: string;
} {
  return (
    typeof item === 'object' &&
    item !== null &&
    'namespace' in item &&
    'key' in item &&
    'value' in item &&
    typeof (item as { namespace: unknown }).namespace === 'string' &&
    typeof (item as { key: unknown }).key === 'string' &&
    typeof (item as { value: unknown }).value === 'string'
  );
}

function isShopifyCategoryMetafieldValue(item: unknown): item is {
  attributeId: string;
  attributeName: string;
  namespace: string;
  key: string;
  metafieldType: string;
  values: readonly { id: string; name: string }[];
} {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const row = item as Record<string, unknown>;
  return (
    typeof row['attributeId'] === 'string' &&
    typeof row['key'] === 'string' &&
    typeof row['namespace'] === 'string' &&
    Array.isArray(row['values'])
  );
}

export function mapProductApiRow(row: ProductApiRow): Product {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: stripHtmlToPlainText(row.description),
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    shopifyTaxonomyCategoryId: row.shopifyTaxonomyCategoryId ?? undefined,
    shopifyTaxonomyCategoryFullName: row.shopifyTaxonomyCategoryFullName ?? undefined,
    season: row.season ?? undefined,
    tags: row.tags?.length ? [...row.tags] : undefined,
    seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined,
    shopifyCollections: parseJsonArray(row.shopifyCollections, isShopifyCollectionRef),
    shopifyMetafields: parseJsonArray(row.shopifyMetafields, isShopifyMetafieldRef),
    shopifyCategoryMetafields: parseJsonArray(
      row.shopifyCategoryMetafields,
      isShopifyCategoryMetafieldValue,
    ),
    status: row.status,
    catalogOrigin: row.catalogOrigin ?? CatalogOrigin.VestiFlow,
    options: row.options ?? [],
    images: (row.images ?? []).map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.altText ?? undefined,
      sortOrder: image.sortOrder,
    })),
    shopify: mapShopifyLink(
      row.shopifySyncStatus,
      row.shopifyProductId,
      row.shopifyLastSyncAt,
      row.shopifyLastError,
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapProductVariantApiRow(row: ProductVariantApiRow): ProductVariant {
  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    optionValues: row.optionValues ?? [],
    barcode: row.barcode ?? undefined,
    sellingPrice: { amountMinor: row.sellingPriceMinor, currencyCode: row.currency },
    purchasePrice:
      row.purchasePriceMinor != null
        ? { amountMinor: row.purchasePriceMinor, currencyCode: row.currency }
        : undefined,
    compareAtPrice:
      row.compareAtPriceMinor != null
        ? { amountMinor: row.compareAtPriceMinor, currencyCode: row.currency }
        : undefined,
    shopifyVariantId: row.shopifyVariantId ?? undefined,
    shopifyInventoryItemId: row.shopifyInventoryItemId ?? undefined,
  };
}

export function mapLocationApiRow(row: LocationApiRow): Location {
  const hasAddress = row.addressLine1 || row.city;
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    code: row.code ?? undefined,
    isActive: row.isActive,
    storeId: row.storeId ?? undefined,
    address: hasAddress
      ? {
          line1: row.addressLine1 ?? '',
          line2: row.addressLine2 ?? undefined,
          city: row.city ?? '',
          province: row.province ?? undefined,
          postalCode: row.postalCode ?? '',
          country: row.countryCode ?? 'IT',
        }
      : undefined,
    shopify: mapShopifyLink(
      row.shopifySyncStatus,
      row.shopifyLocationId,
      row.shopifyLastSyncAt,
      row.shopifyLastError,
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapInventoryLevelApiRow(row: InventoryLevelApiRow): InventoryLevel {
  return {
    id: row.id,
    variantId: row.variantId,
    locationId: row.locationId,
    onHand: row.onHand,
    available: row.available,
    committed: row.committed,
    incoming: row.incoming,
    reserved: row.reserved,
    minThreshold: row.minThreshold,
  };
}

export function mapStockMovementApiRow(row: StockMovementApiRow): StockMovement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    variantId: row.variantId,
    sku: row.sku,
    locationId: row.locationId,
    quantity: row.quantity,
    direction: row.direction ?? undefined,
    reason: row.reason ?? undefined,
    targetLocationId: row.targetLocationId ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdById ?? 'system',
    createdByName: row.createdByName,
    origin: row.origin ? (row.origin as StockMovement['origin']) : undefined,
  };
}
