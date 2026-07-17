import { DocumentType } from '@prisma/client';

/** Tipi con export PDF (allineato al frontend B5). */
export const PRINTABLE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.sales_ddt,
  DocumentType.quote,
  DocumentType.transfer,
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

const TRANSFER_TYPES: readonly DocumentType[] = [DocumentType.transfer] as const;

const GOODS_RECEIPT_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

const SALES_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.quote,
] as const;

export type DocumentPrintKind = 'transfer' | 'goods_receipt' | 'sales' | 'generic';

export function isPrintableDocumentType(type: DocumentType): boolean {
  return (PRINTABLE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function documentPrintKind(type: DocumentType): DocumentPrintKind {
  if ((TRANSFER_TYPES as readonly string[]).includes(type)) {
    return 'transfer';
  }
  if ((GOODS_RECEIPT_TYPES as readonly string[]).includes(type)) {
    return 'goods_receipt';
  }
  if ((SALES_TYPES as readonly string[]).includes(type)) {
    return 'sales';
  }
  return 'generic';
}

export function documentReferenceLabel(reference: string | null, series: string): string {
  if (reference) {
    return reference;
  }
  return `Bozza · serie ${series}`;
}
