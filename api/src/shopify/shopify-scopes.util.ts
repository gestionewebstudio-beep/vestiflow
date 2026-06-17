/** Unisce gli scope salvati su connessione e credenziale (OAuth può differire). */
export function mergeShopifyScopes(
  ...scopeLists: readonly (readonly string[] | undefined)[]
): readonly string[] {
  const merged = new Set<string>();
  for (const list of scopeLists) {
    for (const scope of list ?? []) {
      if (scope.trim()) {
        merged.add(scope.trim());
      }
    }
  }
  return [...merged];
}

/** Verifica presenza di uno scope OAuth nel token salvato per il tenant. */
export function shopifyHasScope(scopes: readonly string[], required: string): boolean {
  return scopes.includes(required);
}

export function shopifyHasProductReadScope(scopes: readonly string[]): boolean {
  return shopifyHasScope(scopes, SHOPIFY_READ_PRODUCTS_SCOPE);
}

/** Messaggio utente se manca read_products (es. collegamento OAuth datato). */
export function shopifyProductReadScopeError(scopes: readonly string[]): string | null {
  if (shopifyHasProductReadScope(scopes)) {
    return null;
  }
  if (shopifyHasScope(scopes, SHOPIFY_WRITE_PRODUCTS_SCOPE)) {
    return 'Il collegamento Shopify è incompleto: puoi modificare il catalogo ma non importarlo. Disconnetti e riconnetti lo store per aggiornare i permessi.';
  }
  return 'Mancano i permessi per leggere il catalogo su Shopify. Ricollega lo store da Impostazioni.';
}

export const SHOPIFY_WRITE_INVENTORY_SCOPE = 'write_inventory';
export const SHOPIFY_WRITE_PRODUCTS_SCOPE = 'write_products';
export const SHOPIFY_READ_PRODUCTS_SCOPE = 'read_products';
