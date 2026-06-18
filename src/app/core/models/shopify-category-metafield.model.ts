/** Valore taxonomy per un attributo categoria Shopify. */
export interface ShopifyCategoryMetafieldValue {
  readonly attributeId: string;
  readonly attributeName: string;
  readonly namespace: string;
  readonly key: string;
  readonly metafieldType: string;
  readonly values: readonly { readonly id: string; readonly name: string }[];
}

/** Attributo taxonomy con valori disponibili (picker form). */
export interface ShopifyTaxonomyCategoryAttribute {
  readonly id: string;
  readonly name: string;
  readonly namespace: string;
  readonly key: string;
  readonly metafieldType: string;
  readonly values: readonly { readonly id: string; readonly name: string }[];
}
