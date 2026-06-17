import type { ShopifyScopeDiagnostics } from '@core/models/shopify-connection.model';

/** Avviso se manca read_products, con causa (server vs Shopify Partners). */
export function shopifyProductReadScopeWarning(
  diagnostics: ShopifyScopeDiagnostics | undefined,
): string | null {
  if (!diagnostics || diagnostics.catalogImportBlockedReason === 'none') {
    return null;
  }

  if (diagnostics.catalogImportBlockedReason === 'not_requested') {
    return 'La configurazione del server non richiede read_products (variabile SHOPIFY_SCOPES su Railway). Aggiungi read_products, ridistribuisci l’API e riconnetti Shopify.';
  }

  return 'Shopify non ha concesso read_products sul token attuale. Disinstalla l’app VestiFlow dall’admin del negozio (Impostazioni → App), poi riconnetti da VestiFlow. Se persiste, verifica che SHOPIFY_API_KEY su Railway corrisponda al Client ID dell’app vestiflow-1.1.';
}

/** Dettaglio tecnico-leggibile per admin (ambiti mancanti). */
export function shopifyScopeDiagnosticsDetail(
  diagnostics: ShopifyScopeDiagnostics | undefined,
): string | null {
  if (!diagnostics || diagnostics.catalogImportBlockedReason === 'none') {
    return null;
  }

  const missing = diagnostics.missingForCatalogImport.join(', ') || 'read_products';
  return `Ambiti concessi dal negozio: ${diagnostics.granted.join(', ') || 'nessuno'}. Mancante per import catalogo: ${missing}.`;
}
