/** Attributi categoria con tipo `list.*` accettano più valori taxonomy (come Shopify Admin). */
export function isShopifyCategoryMetafieldMultiValue(metafieldType: string): boolean {
  return metafieldType.trim().toLowerCase().startsWith('list.');
}
