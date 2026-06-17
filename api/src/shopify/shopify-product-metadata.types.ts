/** Riferimento collezione Shopify importato su Product.shopifyCollections. */
export interface ShopifyCollectionRef {
  readonly id: string;
  readonly title: string;
}

/** Snapshot metafield Shopify su Product.shopifyMetafields. */
export interface ShopifyMetafieldRef {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly type?: string;
}

/** Dati arricchiti da Admin API oltre al payload prodotto base. */
export interface ProductShopifyEnrichment {
  readonly tags: readonly string[];
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly season: string | null;
  readonly collections: readonly ShopifyCollectionRef[];
  readonly metafields: readonly ShopifyMetafieldRef[];
  /** Chiave = shopify variant id numerico; valore = costo in unità minori. */
  readonly variantPurchasePriceMinor: ReadonlyMap<number, number>;
}

export const VESTIFLOW_METAFIELD_NAMESPACE = 'vestiflow';
export const VESTIFLOW_SEASON_METAFIELD_KEY = 'season';

export const PRODUCT_IMPORT_TX = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;
