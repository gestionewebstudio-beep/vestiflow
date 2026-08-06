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

  const missing = diagnostics.missingFromGrant.join(', ') || 'read_products';
  return (
    'Shopify non ha concesso tutti gli ambiti richiesti sul token ' +
    `(mancano: ${missing}). ` +
    'In Dev Dashboard → vestiflow-1.1 → Versioni → versione attiva verifica read_products e read_inventory ' +
    '(non solo write_*). Rilascia una nuova versione, disinstalla l’app dal negozio, ridistribuisci Railway e riconnetti.'
  );
}

/** Dettaglio tecnico-leggibile per admin (ambiti richiesti vs concessi). */
export function shopifyScopeDiagnosticsDetail(
  diagnostics: ShopifyScopeDiagnostics | undefined,
): string | null {
  if (!diagnostics || diagnostics.catalogImportBlockedReason === 'none') {
    return null;
  }

  const missing = diagnostics.missingForCatalogImport.join(', ') || 'read_products';
  const requested = diagnostics.requested.join(', ') || '—';
  const granted = diagnostics.granted.join(', ') || 'nessuno';
  return (
    `Ambiti richiesti dal server: ${requested}. ` +
    `Ambiti concessi dal negozio: ${granted}. ` +
    `Mancante per import catalogo: ${missing}.`
  );
}
