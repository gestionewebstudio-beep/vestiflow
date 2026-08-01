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
] as const;

/** Documenti vendita con anteprima stampa dedicata. */
export const SALES_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.SalesDdt,
  DocumentType.Quote,
] as const;

/**
 * Fatture di vendita: Fattura e Fattura accompagnatoria. Condividono elenco,
 * numeratore, form base e azioni fiscali; si differenziano per le sezioni
 * Trasporto/Destinazione e per lo scarico di magazzino.
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
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
