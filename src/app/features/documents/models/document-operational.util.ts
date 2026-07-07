import { DocumentType } from '@core/models/document.model';

/** Tipi gestionali/operativi: niente badge «Bozza» in UI (§ Arrivo merce 8). */
export const OPERATIONAL_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.SupplierOrder,
  DocumentType.GoodsReceipt,
  DocumentType.SupplierDdt,
  DocumentType.SupplierInvoiceAccompanying,
  DocumentType.SupplierInvoice,
  DocumentType.ManualLoad,
  DocumentType.InitialLoad,
  DocumentType.SalesDdt,
  DocumentType.Transfer,
  DocumentType.ManualUnload,
  DocumentType.Adjustment,
  DocumentType.Inventory,
] as const;

export function isOperationalDocumentType(type: DocumentType): boolean {
  return (OPERATIONAL_DOCUMENT_TYPES as readonly string[]).includes(type);
}
