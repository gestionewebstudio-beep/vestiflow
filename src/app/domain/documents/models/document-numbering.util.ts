import { DocumentType } from '@core/models/document.model';

/**
 * Il tipo che **possiede** il numeratore. Mirror di `documentNumberingType`
 * (`api/src/documents/document-type.util.ts`), e va tenuto allineato con lui.
 *
 * Di norma coincide col tipo del documento. Fanno eccezione **Fattura
 * accompagnatoria e Nota di credito**: non hanno una numerazione propria,
 * ereditano quella della Fattura — sono documenti della stessa famiglia e
 * stanno nella stessa serie progressiva.
 *
 * **Serve ovunque si parli di contatori, non di documenti.** Un contatore
 * esiste solo per il tipo che possiede il numeratore: chiedere quelli del tipo
 * grezzo restituisce un elenco vuoto, e crearne uno lì viene rifiutato dall'API
 * con 422 (`isCounterConfigurableDocumentType`).
 */
export function documentNumberingType(type: DocumentType): DocumentType {
  return NUMBERING_SHARED_WITH_INVOICE.includes(type) ? DocumentType.InvoiceDraft : type;
}

/** I tipi che pescano dal numeratore della Fattura senza possederlo. */
const NUMBERING_SHARED_WITH_INVOICE: readonly DocumentType[] = [
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
];
