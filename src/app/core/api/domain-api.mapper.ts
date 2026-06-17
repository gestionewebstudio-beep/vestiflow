import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product, ProductOption } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { ShopifyLink } from '@core/models/shopify.model';
import type { StockMovement } from '@core/models/stock-movement.model';

/** Riga prodotto come restituita dall'API NestJS (Prisma JSON). */
export interface ProductApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly name: string;
  readonly description?: string | null;
  readonly brand?: string | null;
  readonly category?: string | null;
  readonly season?: string | null;
  readonly status: Product['status'];
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

export function mapProductApiRow(row: ProductApiRow): Product {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? undefined,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    season: row.season ?? undefined,
    status: row.status,
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
  };
}
