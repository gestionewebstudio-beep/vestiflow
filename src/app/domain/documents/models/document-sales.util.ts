import { DocumentType } from '@core/models/document.model';

/**
 * Documenti vendita gestiti dal form condiviso (proforma, fatture).
 * Il DDT vendita usa la maschera dell'Ordine cliente (prompt DDT §BASE):
 * rotta dedicata /app/documents/sales-ddt.
 */
export const SALES_FORM_DOCUMENT_TYPES = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  // La nota di credito usa la stessa base di maschera, con le proprie
  // differenze di dominio (casella «Carica magazzino», verso economico).
  DocumentType.CreditNote,
] as const;

/**
 * I tipi che la maschera vendita gestisce, come unione di letterali.
 *
 * L'annotazione `readonly DocumentType[]` qui sopra è stata tolta apposta:
 * allargava il tipo e rendeva impossibile derivare questa unione. Serve a far
 * pretendere dal compilatore una voce per ogni tipo dove l'elenco non basta —
 * i segmenti di rotta, per esempio: un tipo aggiunto qui e dimenticato là
 * darebbe una maschera senza indirizzo, e nessun test lo direbbe.
 */
export type SalesFormDocumentType = (typeof SALES_FORM_DOCUMENT_TYPES)[number];

/** Documenti vendita con anteprima stampa dedicata. */
export const SALES_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
  DocumentType.SalesDdt,
  DocumentType.Quote,
] as const;

/**
 * La famiglia Fattura: Fattura, Fattura accompagnatoria e Nota di credito.
 * Condividono elenco, numeratore, form base, permessi e azioni fiscali; si
 * differenziano per le sezioni Trasporto/Destinazione (accompagnatoria), per il
 * verso economico e la casella «Carica magazzino» (nota di credito).
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
] as const;

export function isSalesFormDocumentType(type: DocumentType): boolean {
  return (SALES_FORM_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isSalesDocumentType(type: DocumentType): boolean {
  return (SALES_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isSalesDdtDocumentType(type: DocumentType): boolean {
  return type === DocumentType.SalesDdt;
}

export function isProformaDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Proforma;
}

export function isInvoiceDraftDocumentType(type: DocumentType): boolean {
  return type === DocumentType.InvoiceDraft;
}

/** Fattura accompagnatoria: trasporto, destinazione e scarico magazzino. */
export function isInvoiceAccompanyingDocumentType(type: DocumentType): boolean {
  return type === DocumentType.InvoiceAccompanying;
}

/** Una delle due fatture di vendita (azioni fiscali, XML, numeratore comune). */
export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/** Preventivo: maschera dedicata (stessa impostazione dell'Ordine cliente). */
export function isQuoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Quote;
}
