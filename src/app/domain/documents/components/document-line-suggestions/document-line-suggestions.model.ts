/**
 * Voce del pannello suggerimenti di riga documento: testo già pronto da
 * mostrare. Chi chiama compone titolo e dettaglio («SKU · EAN · Disp.»,
 * formattazione valuta…) e tiene per sé l'identità della variante: il
 * pannello restituisce l'indice della voce scelta, non un id.
 */
export interface DocumentLineSuggestionItem {
  readonly title: string;
  readonly detail?: string;
}
