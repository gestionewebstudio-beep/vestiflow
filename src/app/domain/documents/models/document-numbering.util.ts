import { DocumentType } from '@core/models/document.model';

/**
 * Il tipo che **possiede** il numeratore. Mirror di `documentNumberingType`
 * (`api/src/documents/document-type.util.ts`), e va tenuto allineato con lui.
 *
 * Di norma coincide col tipo del documento. Fa eccezione la Fattura
 * accompagnatoria: non ha una numerazione propria, eredita quella della
 * Fattura — è una fattura a tutti gli effetti e sta nella stessa serie
 * progressiva.
 *
 * **Serve ovunque si parli di contatori, non di documenti.** Un contatore
 * esiste solo per il tipo che possiede il numeratore: chiedere quelli del tipo
 * grezzo restituisce un elenco vuoto, e crearne uno lì viene rifiutato dall'API
 * con 422 (`isCounterConfigurableDocumentType`).
 */
export function documentNumberingType(type: DocumentType): DocumentType {
  return type === DocumentType.InvoiceAccompanying ? DocumentType.InvoiceDraft : type;
}
