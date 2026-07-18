import { DocumentType } from '@core/models/document.model';

/**
 * Documenti vendita gestiti dal form condiviso (proforma, bozza fattura).
 * Il DDT vendita usa la maschera dell'Ordine cliente (prompt DDT §BASE):
 * rotta dedicata /app/documents/sales-ddt.
 */
export const SALES_FORM_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
] as const;

/** Documenti vendita con anteprima stampa dedicata. */
export const SALES_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.SalesDdt,
  DocumentType.Quote,
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

/** Preventivo: maschera dedicata (stessa impostazione dell'Ordine cliente). */
export function isQuoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Quote;
}
