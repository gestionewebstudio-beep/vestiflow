/**
 * Le etichette dell'**origine** di una riga del Registro.
 *
 * ⭐ Stavano dentro il componente tabella, ed è lì che erano nate. Sono uscite
 * quando è arrivato l'ordinamento (`10` §20): si ordina **per l'etichetta che
 * l'operatore legge** (`14` §H13), e a ordinare è la pagina — due copie della
 * stessa mappa avrebbero significato un ordine che, il giorno in cui divergono,
 * non corrisponde più ai nomi in colonna.
 */
const SOURCE_LABELS: Record<string, string> = {
  shopify_online: 'Shopify online',
  shopify_pos: 'Shopify POS',
  store: 'Vendita al banco',
  manual: 'Manuale',
  // La quarta sorgente (`docs/10` §12). Condivide con la Vendita al banco la
  // coppia Fisico/POS · VestiFlow, ma non l'origine: una registrazione digitata
  // e una vendita battuta al banco non devono confondersi in colonna.
  manual_receipt: 'Corrispettivo manuale',
};

/** L'etichetta dell'origine; un valore sconosciuto resta sé stesso. */
export function corrispettivoSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** «Non determinata» non è una terza possibilità: è l'assenza, detta (`10` §12). */
export const LOCATION_UNDETERMINED_LABEL = 'Non determinata';
