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

/**
 * Il prodotto è COLLEGATO a Shopify adesso — asse diverso dall'origine.
 *
 * ⚠️ `catalogOrigin` dice da dove viene il prodotto, questo dice se ha un
 * collegamento vivo: un articolo nato in VestiFlow e poi pubblicato ha origine
 * `vestiflow` e collegamento presente. L'eliminazione si ferma su entrambi, e
 * per ragioni diverse.
 *
 * ⛔ Serve a non PROPORRE un comando che l'API rifiuterebbe: il controllo vero
 * resta lato server (`assertShopifyLinkedDeleteAllowed`), qui si evita solo di
 * offrire un'azione che non può riuscire.
 */
export function isShopifyLinkedProduct(product: Pick<Product, 'shopify'>): boolean {
  return Boolean(product.shopify?.shopifyId);
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
