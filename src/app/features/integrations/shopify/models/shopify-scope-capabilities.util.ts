/** Avviso se manca read_products (collegamento OAuth datato o permessi incompleti). */
export function shopifyProductReadScopeWarning(
  scopes: readonly string[] | undefined,
): string | null {
  if (!scopes?.length) {
    return null;
  }
  if (scopes.includes('read_products')) {
    return null;
  }
  if (scopes.includes('write_products')) {
    return 'Il collegamento Shopify è incompleto: puoi modificare il catalogo ma non importarlo. Disconnetti e riconnetti lo store per aggiornare i permessi.';
  }
  return 'Mancano i permessi per leggere il catalogo su Shopify. Ricollega lo store da Impostazioni.';
}
