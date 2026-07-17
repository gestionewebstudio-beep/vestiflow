import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

import { isGoodsReceiptDocumentType } from './document-goods-receipt.util';
import { isSalesDocumentType } from './document-sales.util';
import { isTransferDocumentType } from './document-transfer.util';

/** Tipi con anteprima/stampa HTML dedicata (B5). */
export const PRINTABLE_DOCUMENT_TYPES: readonly DocumentTypeValue[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.SalesDdt,
  DocumentType.Quote,
  DocumentType.Transfer,
  DocumentType.GoodsReceipt,
  DocumentType.SupplierDdt,
  DocumentType.SupplierInvoiceAccompanying,
] as const;

export function isPrintableDocumentType(type: DocumentTypeValue): boolean {
  return (PRINTABLE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isGoodsReceiptPrintType(type: DocumentTypeValue): boolean {
  return isGoodsReceiptDocumentType(type);
}

export function isTransferPrintType(type: DocumentTypeValue): boolean {
  return isTransferDocumentType(type);
}

export function isSalesPrintType(type: DocumentTypeValue): boolean {
  return isSalesDocumentType(type);
}
