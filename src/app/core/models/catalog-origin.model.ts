export const CatalogOrigin = {
  VestiFlow: 'vestiflow',
  Shopify: 'shopify',
} as const;

export type CatalogOrigin = (typeof CatalogOrigin)[keyof typeof CatalogOrigin];
