import type { Product } from '@core/models/product.model';

/** Categoria mostrata in lista/dettaglio: taxonomy Shopify se presente, altrimenti product_type. */
export function productDisplayCategory(product: Product): string {
  const taxonomy = product.shopifyTaxonomyCategoryFullName?.trim();
  if (taxonomy) {
    return taxonomy;
  }
  const productType = product.category?.trim();
  return productType || '—';
}

/** Solo il nome foglia della categoria taxonomy (per colonne strette). */
export function productDisplayCategoryShort(product: Product): string {
  const full = product.shopifyTaxonomyCategoryFullName?.trim();
  if (full) {
    const segments = full.split('>').map((segment) => segment.trim());
    return segments.at(-1) ?? full;
  }
  const productType = product.category?.trim();
  return productType || '—';
}
