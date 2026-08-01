import {
  CatalogOrigin,
  type CatalogOrigin as CatalogOriginType,
} from '@core/models/catalog-origin.model';
import type { Product } from '@core/models/product.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

export function isShopifyCatalogProduct(
  product: Pick<Product, 'catalogOrigin'>,
): product is Product & { readonly catalogOrigin: typeof CatalogOrigin.Shopify } {
  return product.catalogOrigin === CatalogOrigin.Shopify;
}

export function catalogOriginLabel(origin: CatalogOriginType): string {
  return origin === CatalogOrigin.Shopify ? 'Fonte: Shopify' : 'Fonte: VestiFlow';
}

/** Etichetta compatta per colonne tabella (header = «Fonte»). */
export function catalogOriginShortLabel(origin: CatalogOriginType): string {
  return origin === CatalogOrigin.Shopify ? 'Shopify' : 'VestiFlow';
}

export function catalogOriginTone(origin: CatalogOriginType): BadgeTone {
  return origin === CatalogOrigin.Shopify ? 'info' : 'vestiflow';
}

export const SHOPIFY_CATALOG_READONLY_BANNER =
  'Il catalogo ecommerce di questo prodotto è gestito in Shopify Admin. In VestiFlow puoi aggiornare solo stagione e prezzo di acquisto.';

export const SHOPIFY_CATALOG_EDIT_TITLE = 'Modifica dati operativi';
