/** Valore taxonomy selezionato per un attributo categoria. */
export interface ShopifyCategoryMetafieldTaxonomyValue {
  readonly id: string;
  readonly name: string;
}

/** Attributo categoria Shopify persistito su Product.shopifyCategoryMetafields. */
export interface ShopifyCategoryMetafieldValue {
  readonly attributeId: string;
  readonly attributeName: string;
  readonly namespace: string;
  readonly key: string;
  readonly metafieldType: string;
  readonly values: readonly ShopifyCategoryMetafieldTaxonomyValue[];
}

/** Attributo taxonomy con valori disponibili (risposta API / picker UI). */
export interface ShopifyTaxonomyCategoryAttribute {
  readonly id: string;
  readonly name: string;
  readonly namespace: string;
  readonly key: string;
  readonly metafieldType: string;
  readonly values: readonly ShopifyCategoryMetafieldTaxonomyValue[];
}

export const SHOPIFY_CATEGORY_METAFIELD_NAMESPACE = 'shopify';
