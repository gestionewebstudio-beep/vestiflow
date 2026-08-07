import { DocumentType } from '@core/models/document.model';

/**
 * Documenti vendita gestiti dal form condiviso (proforma, fatture).
 * Il DDT vendita usa la maschera dell'Ordine cliente (prompt DDT §BASE):
 * rotta dedicata /app/documents/sales-ddt.
 */
export const SALES_FORM_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
] as const;

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
 * Fatture di vendita: Fattura, Fattura accompagnatoria e Nota di credito.
 * Condividono elenco, numeratore, form base e azioni fiscali; si differenziano
 * per trasporto/destinazione (accompagnatoria) e per il TipoDocumento TD04
 * con riferimento alla fattura rettificata (nota di credito).
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

/** Nota di credito (TD04): rettifica una fattura emessa, mai magazzino. */
export function isCreditNoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.CreditNote;
}

/** Una delle due fatture di vendita (azioni fiscali, XML, numeratore comune). */
export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/** Preventivo: maschera dedicata (stessa impostazione dell'Ordine cliente). */
export function isQuoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Quote;
}
