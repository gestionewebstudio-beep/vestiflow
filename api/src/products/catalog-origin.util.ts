import { ConflictException } from '@nestjs/common';
import {
  CatalogOrigin,
  ShopifyCatalogLinkKind,
  type ProductVariant,
} from '@prisma/client';

import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';

export const SHOPIFY_CATALOG_LOCKED_MESSAGE =
  'Il catalogo di questo prodotto è gestito in Shopify Admin. Modifica titolo, prezzi di vendita e varianti da Shopify; in VestiFlow puoi aggiornare solo stagione e prezzo di acquisto.';

export const SHOPIFY_CATALOG_DELETE_MESSAGE =
  'Questo prodotto proviene da Shopify: eliminalo da Shopify Admin, non dal gestionale.';

export const SHOPIFY_CATALOG_MEDIA_MESSAGE =
  'Le immagini del catalogo sono gestite in Shopify Admin per i prodotti importati.';

export const SHOPIFY_CATALOG_SYNC_MESSAGE =
  'Il catalogo si allinea automaticamente da Shopify. Usa Shopify Admin per modificarlo.';

export function isShopifyCatalogOrigin(origin: CatalogOrigin): boolean {
  return origin === CatalogOrigin.shopify;
}

export type CatalogOriginProductSnapshot = {
  readonly catalogOrigin: CatalogOrigin;
  readonly shopifyProductId: string | null;
  readonly shopifyCatalogLinkKind: ShopifyCatalogLinkKind | null;
  readonly createdAt: Date;
  readonly shopifyLastSyncAt: Date | null;
  readonly images: readonly { readonly storagePath: string | null }[];
};

/** Tolleranza tra createdAt e shopifyLastSyncAt per import nato su Shopify. */
export const SHOPIFY_LINK_AT_CREATION_TOLERANCE_MS = 15_000;

/** Immagini caricate in VestiFlow (Supabase Storage) — segnale di catalogo nato gestionale. */
export function hasLocalCatalogMedia(
  images: readonly { readonly storagePath: string | null }[],
): boolean {
  return images.some(
    (image) => image.storagePath != null && image.storagePath.trim().length > 0,
  );
}

/**
 * Import Shopify: shopifyProductId e shopifyLastSyncAt vengono scritti nella stessa create.
 * Create VestiFlow + push async: shopifyLastSyncAt arriva dopo createdAt.
 */
export function wasShopifyLinkedAtProductCreation(
  snapshot: Pick<CatalogOriginProductSnapshot, 'createdAt' | 'shopifyLastSyncAt'>,
): boolean {
  if (!snapshot.shopifyLastSyncAt) {
    return false;
  }
  return (
    Math.abs(snapshot.shopifyLastSyncAt.getTime() - snapshot.createdAt.getTime()) <=
    SHOPIFY_LINK_AT_CREATION_TOLERANCE_MS
  );
}

/**
 * Prodotto di origine VestiFlow: creato/pushato dal gestionale.
 * Import Shopify (linkKind imported) e legacy import restano di competenza Shopify.
 */
export function isVestiflowCatalogOwner(snapshot: CatalogOriginProductSnapshot): boolean {
  if (snapshot.catalogOrigin === CatalogOrigin.shopify) {
    return false;
  }
  if (snapshot.shopifyCatalogLinkKind === ShopifyCatalogLinkKind.imported) {
    return false;
  }
  if (snapshot.shopifyCatalogLinkKind === ShopifyCatalogLinkKind.pushed) {
    return true;
  }
  if (!snapshot.shopifyProductId) {
    return true;
  }
  if (hasLocalCatalogMedia(snapshot.images)) {
    return true;
  }
  return !wasShopifyLinkedAtProductCreation(snapshot);
}

/** Blocca pull/webhook Shopify quando il catalogo è di competenza VestiFlow. */
export function shouldSkipShopifyCatalogImport(snapshot: CatalogOriginProductSnapshot): boolean {
  return isVestiflowCatalogOwner(snapshot);
}

export function resolveCatalogOriginForShopifyImport(
  snapshot: CatalogOriginProductSnapshot,
): CatalogOrigin {
  if (isVestiflowCatalogOwner(snapshot)) {
    return CatalogOrigin.vestiflow;
  }
  return CatalogOrigin.shopify;
}

export function resolveShopifyCatalogLinkKindForImport(
  snapshot: CatalogOriginProductSnapshot,
): ShopifyCatalogLinkKind | null {
  if (isVestiflowCatalogOwner(snapshot)) {
    return snapshot.shopifyCatalogLinkKind;
  }
  return ShopifyCatalogLinkKind.imported;
}

type ProductVariantSnapshot = Pick<
  ProductVariant,
  | 'id'
  | 'sku'
  | 'optionValues'
  | 'barcode'
  | 'currency'
  | 'sellingPriceMinor'
  | 'compareAtPriceMinor'
  | 'purchasePriceMinor'
>;

type ProductCatalogSnapshot = {
  readonly catalogOrigin: CatalogOrigin;
  readonly name: string;
  readonly description: string | null;
  readonly brand: string | null;
  readonly category: string | null;
  readonly shopifyTaxonomyCategoryId: string | null;
  readonly shopifyTaxonomyCategoryFullName: string | null;
  readonly shopifyCategoryMetafields: unknown;
  readonly tiktokCategoryId: string | null;
  readonly season: string | null;
  readonly tags: readonly string[];
  readonly status: string;
  readonly options: unknown;
  readonly variants: readonly ProductVariantSnapshot[];
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  if (!tags) {
    return [];
  }
  return [...tags].map((tag) => tag.trim()).filter(Boolean).sort();
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function variantCatalogEqual(
  current: ProductVariantSnapshot,
  payload: UpdateVariantDto,
): boolean {
  return (
    current.sku.trim().toLowerCase() === payload.sku.trim().toLowerCase() &&
    jsonEqual(current.optionValues, payload.optionValues) &&
    normalizeOptionalString(current.barcode) === normalizeOptionalString(payload.barcode) &&
    current.currency === payload.sellingPrice.currency &&
    current.sellingPriceMinor === payload.sellingPrice.amountMinor &&
    (current.compareAtPriceMinor ?? null) === (payload.compareAtPrice?.amountMinor ?? null)
  );
}

/** Blocca mutazioni distruttive su prodotti importati da Shopify. */
export function assertShopifyCatalogDeleteAllowed(origin: CatalogOrigin): void {
  if (isShopifyCatalogOrigin(origin)) {
    throw new ConflictException(SHOPIFY_CATALOG_DELETE_MESSAGE);
  }
}

/** Blocca push/sync manuale catalogo su prodotti importati da Shopify. */
export function assertShopifyCatalogManualSyncAllowed(origin: CatalogOrigin): void {
  if (isShopifyCatalogOrigin(origin)) {
    throw new ConflictException(SHOPIFY_CATALOG_SYNC_MESSAGE);
  }
}

/** Blocca upload/eliminazione immagini catalogo su prodotti importati da Shopify. */
export function assertShopifyCatalogMediaMutationAllowed(origin: CatalogOrigin): void {
  if (isShopifyCatalogOrigin(origin)) {
    throw new ConflictException(SHOPIFY_CATALOG_MEDIA_MESSAGE);
  }
}

/**
 * Verifica che un PATCH non modifichi campi catalogo su prodotti Shopify-owned.
 * Consente solo stagione e prezzo di acquisto varianti.
 */
export function assertShopifyCatalogUpdateAllowed(
  existing: ProductCatalogSnapshot,
  dto: UpdateProductDto,
): void {
  if (!isShopifyCatalogOrigin(existing.catalogOrigin)) {
    return;
  }

  if (dto.name !== undefined && dto.name.trim() !== existing.name.trim()) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.description !== undefined &&
    normalizeOptionalString(dto.description) !== normalizeOptionalString(existing.description)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.brand !== undefined &&
    normalizeOptionalString(dto.brand) !== normalizeOptionalString(existing.brand)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.category !== undefined &&
    normalizeOptionalString(dto.category) !== normalizeOptionalString(existing.category)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.shopifyTaxonomyCategoryId !== undefined &&
    normalizeOptionalString(dto.shopifyTaxonomyCategoryId) !==
      normalizeOptionalString(existing.shopifyTaxonomyCategoryId)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.shopifyTaxonomyCategoryFullName !== undefined &&
    normalizeOptionalString(dto.shopifyTaxonomyCategoryFullName) !==
      normalizeOptionalString(existing.shopifyTaxonomyCategoryFullName)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.shopifyCategoryMetafields !== undefined &&
    !jsonEqual(dto.shopifyCategoryMetafields, existing.shopifyCategoryMetafields)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (
    dto.tiktokCategoryId !== undefined &&
    normalizeOptionalString(dto.tiktokCategoryId) !==
      normalizeOptionalString(existing.tiktokCategoryId)
  ) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (dto.tags !== undefined && !jsonEqual(normalizeTags(dto.tags), normalizeTags(existing.tags))) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (dto.status !== undefined && dto.status !== existing.status) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }
  if (dto.options !== undefined && !jsonEqual(dto.options, existing.options)) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }

  if (!dto.variants) {
    return;
  }

  const currentById = new Map(existing.variants.map((variant) => [variant.id, variant]));
  if (dto.variants.length !== existing.variants.length) {
    throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  }

  for (const payload of dto.variants) {
    if (!payload.id) {
      throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
    }
    const current = currentById.get(payload.id);
    if (!current) {
      throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
    }
    if (!variantCatalogEqual(current, payload)) {
      throw new ConflictException(SHOPIFY_CATALOG_LOCKED_MESSAGE);
    }
  }
}
