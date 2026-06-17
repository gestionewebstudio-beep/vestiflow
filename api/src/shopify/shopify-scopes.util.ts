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

export function parseShopifyScopesCsv(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export interface ShopifyScopeDiagnostics {
  readonly requested: readonly string[];
  readonly granted: readonly string[];
  readonly missingFromGrant: readonly string[];
  readonly missingForCatalogImport: readonly string[];
  readonly catalogImportBlockedReason: 'none' | 'not_requested' | 'not_granted';
}

export function buildShopifyScopeDiagnostics(
  requested: readonly string[],
  granted: readonly string[],
): ShopifyScopeDiagnostics {
  const missingFromGrant = requested.filter((scope) => !granted.includes(scope));
  const missingForCatalogImport = shopifyHasProductReadScope(granted)
    ? []
    : [SHOPIFY_READ_PRODUCTS_SCOPE];

  let catalogImportBlockedReason: ShopifyScopeDiagnostics['catalogImportBlockedReason'] = 'none';
  if (missingForCatalogImport.length > 0) {
    catalogImportBlockedReason = requested.includes(SHOPIFY_READ_PRODUCTS_SCOPE)
      ? 'not_granted'
      : 'not_requested';
  }

  return {
    requested,
    granted,
    missingFromGrant,
    missingForCatalogImport,
    catalogImportBlockedReason,
  };
}

/** Istruzioni utente in base a chi deve correggere la config (server vs Shopify Partners). */
export function shopifyCatalogImportBlockMessage(
  diagnostics: ShopifyScopeDiagnostics,
): string | null {
  if (diagnostics.catalogImportBlockedReason === 'none') {
    return null;
  }
  if (diagnostics.catalogImportBlockedReason === 'not_requested') {
    return 'La configurazione del server non richiede read_products (variabile SHOPIFY_SCOPES). Aggiorna Railway con read_products incluso, ridistribuisci l’API e riconnetti Shopify.';
  }
  return 'Shopify non ha concesso read_products sul token attuale. Disinstalla l’app VestiFlow dall’admin del negozio (Impostazioni → App), salva in Partners, poi riconnetti.';
}
