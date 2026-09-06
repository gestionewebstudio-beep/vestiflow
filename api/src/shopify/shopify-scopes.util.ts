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

export const SHOPIFY_WRITE_INVENTORY_SCOPE = 'write_inventory';
export const SHOPIFY_READ_INVENTORY_SCOPE = 'read_inventory';
export const SHOPIFY_WRITE_PRODUCTS_SCOPE = 'write_products';
export const SHOPIFY_READ_PRODUCTS_SCOPE = 'read_products';
export const SHOPIFY_WRITE_METAOBJECTS_SCOPE = 'write_metaobjects';
export const SHOPIFY_READ_METAOBJECT_DEFINITIONS_SCOPE = 'read_metaobject_definitions';

export function shopifyHasInventoryReadScope(scopes: readonly string[]): boolean {
  return shopifyHasScope(scopes, SHOPIFY_READ_INVENTORY_SCOPE);
}

export const SHOPIFY_READ_ORDERS_SCOPE = 'read_orders';
export const SHOPIFY_READ_CUSTOMERS_SCOPE = 'read_customers';

/**
 * Publication (canali di vendita). Servono a `publishablePublish` /
 * `publishableUnpublish`, cioè all'atto commerciale con cui una variante smette
 * di essere acquistabile senza toccare le quantità (docs/24 §10.1).
 *
 * ⚠️ Un negozio collegato PRIMA della Tranche 2A non li ha: il token è vecchio.
 *    Va dichiarato «da riautorizzare», non lasciato fallire alla prima chiamata.
 */
export const SHOPIFY_READ_PUBLICATIONS_SCOPE = 'read_publications';
export const SHOPIFY_WRITE_PUBLICATIONS_SCOPE = 'write_publications';

export const SHOPIFY_PUBLICATIONS_SCOPES = [
  SHOPIFY_READ_PUBLICATIONS_SCOPE,
  SHOPIFY_WRITE_PUBLICATIONS_SCOPE,
] as const;

/** Gli ambiti publication mancanti fra quelli concessi. Vuoto = ci sono entrambi. */
export function shopifyMissingPublicationsScopes(
  scopes: readonly string[],
): readonly string[] {
  return SHOPIFY_PUBLICATIONS_SCOPES.filter((scope) => !shopifyHasScope(scopes, scope));
}

export function shopifyHasPublicationsScopes(scopes: readonly string[]): boolean {
  return shopifyMissingPublicationsScopes(scopes).length === 0;
}

/** Messaggio utente se mancano gli ambiti publication (pubblicazione per canale). */
export function shopifyPublicationsScopeError(scopes: readonly string[]): string | null {
  const missing = shopifyMissingPublicationsScopes(scopes);
  if (missing.length === 0) {
    return null;
  }
  return (
    `Il collegamento Shopify non può gestire i canali di vendita (mancano: ${missing.join(', ')}). ` +
    'Disconnetti e riconnetti lo store da Impostazioni per aggiornare i permessi.'
  );
}

export function shopifyHasOrdersReadScope(scopes: readonly string[]): boolean {
  return shopifyHasScope(scopes, SHOPIFY_READ_ORDERS_SCOPE);
}

export function shopifyHasCustomersReadScope(scopes: readonly string[]): boolean {
  return shopifyHasScope(scopes, SHOPIFY_READ_CUSTOMERS_SCOPE);
}

/** Messaggio utente se manca read_orders (import vendite). */
export function shopifyOrdersReadScopeError(scopes: readonly string[]): string | null {
  if (shopifyHasOrdersReadScope(scopes)) {
    return null;
  }
  return 'Mancano i permessi per leggere gli ordini su Shopify. Ricollega lo store da Impostazioni.';
}

/** Messaggio utente se manca read_customers (import clienti). */
export function shopifyCustomersReadScopeError(scopes: readonly string[]): string | null {
  if (shopifyHasCustomersReadScope(scopes)) {
    return null;
  }
  return 'Mancano i permessi per leggere i clienti su Shopify. Ricollega lo store da Impostazioni.';
}

/** Messaggio utente se manca read_inventory (import giacenze). */
export function shopifyInventoryReadScopeError(scopes: readonly string[]): string | null {
  if (shopifyHasInventoryReadScope(scopes)) {
    return null;
  }
  if (shopifyHasScope(scopes, SHOPIFY_WRITE_INVENTORY_SCOPE)) {
    return 'Il collegamento Shopify può scrivere le giacenze ma non leggerle. Disconnetti e riconnetti lo store per aggiornare i permessi (read_inventory).';
  }
  return 'Mancano i permessi per leggere le giacenze su Shopify. Ricollega lo store da Impostazioni.';
}

/** Normalizza scope da CSV env o dalla risposta OAuth (virgola o spazio). */
export function parseShopifyScopesString(raw: string): readonly string[] {
  return raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

/** @deprecated Usa parseShopifyScopesString */
export function parseShopifyScopesCsv(raw: string): readonly string[] {
  return parseShopifyScopesString(raw);
}

export interface ShopifyScopeDiagnostics {
  readonly requested: readonly string[];
  readonly granted: readonly string[];
  readonly missingFromGrant: readonly string[];
  readonly missingForCatalogImport: readonly string[];
  readonly catalogImportBlockedReason: 'none' | 'not_requested' | 'not_granted';
  /** Ambiti publication mancanti (Tranche 2A): vuoto = il canale si può gestire. */
  readonly missingForPublications: readonly string[];
  /**
   * Perché la gestione dei canali è bloccata. `not_requested` = il server non li
   * chiede (variabile d'ambiente); `not_granted` = il negozio ha un token vecchio
   * e va **riautorizzato**. La distinzione dice a chi tocca correggere.
   */
  readonly publicationsBlockedReason: 'none' | 'not_requested' | 'not_granted';
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

  const missingForPublications = shopifyMissingPublicationsScopes(granted);
  let publicationsBlockedReason: ShopifyScopeDiagnostics['publicationsBlockedReason'] = 'none';
  if (missingForPublications.length > 0) {
    // Se il server li chiede e il negozio non li ha, il token è vecchio: si
    // riautorizza. Se non li chiede nemmeno, riconnettere non servirebbe a nulla.
    publicationsBlockedReason = missingForPublications.every((scope) => requested.includes(scope))
      ? 'not_granted'
      : 'not_requested';
  }

  return {
    requested,
    granted,
    missingFromGrant,
    missingForCatalogImport,
    catalogImportBlockedReason,
    missingForPublications,
    publicationsBlockedReason,
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
  const missing = diagnostics.missingFromGrant.join(', ') || SHOPIFY_READ_PRODUCTS_SCOPE;
  return (
    'Shopify non ha concesso tutti gli ambiti richiesti sul token attuale ' +
    `(mancano: ${missing}). ` +
    'In Dev Dashboard → vestiflow-1.1 → Versioni → versione attiva verifica che siano selezionati ' +
    'read_products e read_inventory (non solo write_*). Rilascia una nuova versione, disinstalla l’app dal negozio, ' +
    'ridistribuisci l’API su Railway e riconnetti.'
  );
}
