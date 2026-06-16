/** Verifica presenza di uno scope OAuth nel token salvato per il tenant. */
export function shopifyHasScope(scopes: readonly string[], required: string): boolean {
  return scopes.includes(required);
}

export const SHOPIFY_WRITE_INVENTORY_SCOPE = 'write_inventory';
export const SHOPIFY_WRITE_PRODUCTS_SCOPE = 'write_products';
