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

/**
 * Documenti creati SOLO dal flusso cassa (fase 3): consultabili nel registro
 * ma mai modificabili, annullabili o eliminabili dai form documenti generici.
 */
export function isStoreFlowDocumentType(type: DocumentType): boolean {
  return type === DocumentType.StoreSale || type === DocumentType.StoreReturn;
}
