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

/**
 * Avviso se mancano gli ambiti publication (canali di vendita, Tranche 2A).
 *
 * ⛔ **Un negozio già collegato non fallisce in silenzio**: il suo token è stato
 *    emesso prima che questi ambiti esistessero, quindi la prima chiamata a
 *    `publishablePublish` sarebbe un errore Shopify senza spiegazione. Qui lo si
 *    dice PRIMA, e si dice che cosa fare: riautorizzare.
 */
export function shopifyPublicationsScopeWarning(
  diagnostics: ShopifyScopeDiagnostics | undefined,
): string | null {
  if (!diagnostics || diagnostics.publicationsBlockedReason === 'none') {
    return null;
  }

  const missing =
    diagnostics.missingForPublications.join(', ') || 'read_publications, write_publications';

  if (diagnostics.publicationsBlockedReason === 'not_requested') {
    return (
      `La configurazione del server non richiede gli ambiti dei canali di vendita (mancano: ${missing}). ` +
      'Aggiungili a SHOPIFY_SCOPES su Railway, ridistribuisci l’API e riconnetti Shopify.'
    );
  }

  return (
    `Questo negozio è collegato con un token che non copre i canali di vendita (mancano: ${missing}). ` +
    'Pubblicazione e ritiro per canale non sono disponibili finché non riautorizzi: ' +
    'disconnetti e riconnetti lo store da Impostazioni.'
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
