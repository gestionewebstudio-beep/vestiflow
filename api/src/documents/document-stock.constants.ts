import { DocumentType } from '@prisma/client';

/** Tipi documento che generano carichi di magazzino alla conferma (§2.1, §3). */
export const DOCUMENT_STOCK_LOAD_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

/** Tipi documento che generano scarichi di magazzino alla conferma (§2, §5). */
export const DOCUMENT_STOCK_UNLOAD_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.manual_unload,
] as const;

/** Tipi documento con rettifica inventario alla conferma (§2 adjustment). */
export const DOCUMENT_STOCK_ADJUSTMENT_TYPES: readonly DocumentType[] = [
  DocumentType.adjustment,
] as const;

/** Tipi documento con trasferimento origine → destinazione alla conferma (§10.2). */
export const DOCUMENT_STOCK_TRANSFER_TYPES: readonly DocumentType[] = [
  DocumentType.transfer,
] as const;

export function documentTypeLoadsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_LOAD_TYPES as readonly string[]).includes(type);
}

export function documentTypeUnloadsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_UNLOAD_TYPES as readonly string[]).includes(type);
}

export function documentTypeTransfersStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_TRANSFER_TYPES as readonly string[]).includes(type);
}

export function documentTypeAdjustsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_ADJUSTMENT_TYPES as readonly string[]).includes(type);
}

export function documentTypeAffectsStockOnConfirm(type: DocumentType): boolean {
  return (
    documentTypeLoadsStockOnConfirm(type) ||
    documentTypeUnloadsStockOnConfirm(type) ||
    documentTypeTransfersStockOnConfirm(type) ||
    documentTypeAdjustsStockOnConfirm(type)
  );
}
