import { DocumentType } from '@prisma/client';

/** Tipi documento che generano carichi di magazzino alla conferma (§2.1, §3). */
export const DOCUMENT_STOCK_LOAD_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
  DocumentType.manual_load,
  DocumentType.initial_load,
] as const;

/** Tipi arrivo merce collegabili a una registrazione fattura (documenti fornitore). */
export const INVOICE_LINKABLE_RECEIPT_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

/**
 * Tipi documento che generano scarichi di magazzino alla conferma (§2, §5).
 *
 * La Fattura accompagnatoria è l'unico tipo condizionale dell'elenco: scarica
 * SOLO se non ha DDT agganciati, perché con un DDT le giacenze sono già scese.
 * La condizione non è esprimibile qui (dipende dai link del singolo
 * documento): la verifica vive in `invoiceAccompanyingUnloadsStock`.
 */
export const DOCUMENT_STOCK_UNLOAD_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.manual_unload,
  DocumentType.invoice_accompanying,
] as const;

/**
 * Fattura accompagnatoria: lo scarico avviene solo senza DDT agganciato.
 * Con almeno un DDT il documento è puramente fiscale — un secondo scarico
 * porterebbe le giacenze in negativo per la stessa merce.
 */
export function invoiceAccompanyingUnloadsStock(linkedSalesDdtCount: number): boolean {
  return linkedSalesDdtCount === 0;
}

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
