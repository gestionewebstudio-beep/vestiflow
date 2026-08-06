/** Collezione Shopify importata (snapshot read-only). */
export interface ShopifyCollectionRef {
  readonly id: string;
  readonly title: string;
}

/** Metafield Shopify importato (snapshot read-only). */
export interface ShopifyMetafieldRef {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly type?: string;
}
