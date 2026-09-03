import { ConflictException } from '@nestjs/common';
import {
  CatalogOrigin,
  ShopifyCatalogLinkKind,
} from '@prisma/client';



export const SHOPIFY_CATALOG_DELETE_MESSAGE =
  'Questo prodotto proviene da Shopify: eliminalo da Shopify Admin, non dal gestionale.';

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

/** Blocca mutazioni distruttive su prodotti importati da Shopify. */
export function assertShopifyCatalogDeleteAllowed(origin: CatalogOrigin): void {
  if (isShopifyCatalogOrigin(origin)) {
    throw new ConflictException(SHOPIFY_CATALOG_DELETE_MESSAGE);
  }
}
