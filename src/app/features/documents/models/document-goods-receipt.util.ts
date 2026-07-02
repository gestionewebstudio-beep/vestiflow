import { DocumentType } from '@core/models/document.model';

/** Tipi documento Step 2: arrivo merce / carico fornitore (§3). */
export const GOODS_RECEIPT_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.GoodsReceipt,
  DocumentType.SupplierDdt,
  DocumentType.SupplierInvoiceAccompanying,
  DocumentType.ManualLoad,
  DocumentType.InitialLoad,
] as const;

export function isGoodsReceiptDocumentType(type: DocumentType): boolean {
  return (GOODS_RECEIPT_DOCUMENT_TYPES as readonly string[]).includes(type);
}
