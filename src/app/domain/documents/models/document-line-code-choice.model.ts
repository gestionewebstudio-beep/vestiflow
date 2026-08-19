import type { DocumentLineSuggestionItem } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.model';

/**
 * Suggerimento già pronto da mostrare. La card non riceve la variante grezza:
 * comporre «SKU · EAN · prezzo» richiede la formattazione della valuta, che è
 * lavoro del form, non di chi disegna. Estende la voce del pannello condiviso
 * (`app-document-line-suggestions`) con l'identità della variante, che il
 * pannello non conosce: al pick restituisce l'indice, la card lo traduce in id.
 */
export interface LineSuggestion extends DocumentLineSuggestionItem {
  readonly variantId: string;
  readonly detail: string;
}

/** Il campo codice su cui l'utente ha confermato: il form ci cerca il prodotto. */
export type LineCodeField = 'articleCode' | 'sku' | 'barcode';

/**
 * La scelta fra più corrispondenze esatte di un codice, per la vista mobile.
 *
 * Su desktop la scelta si scorre con le frecce e si prende con Invio; qui non
 * c'è tastiera fisica, quindi **si prende toccando** — stesso pannello del nome
 * prodotto, che è già tarato per il tocco (target minimo fisso e stato
 * `:active`, perché `:hover` su touch non è affidabile).
 *
 * `field` dice sotto quale dei tre campi codice va mostrata: uno solo per volta,
 * ed è il campo da cui l'operatore ha confermato.
 */
export interface LineCodeChoice {
  readonly field: LineCodeField;
  readonly items: readonly LineSuggestion[];
}
