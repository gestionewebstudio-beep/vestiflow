import { DocumentType } from '@prisma/client';

/** Tipi documento rilevanti per il registro commercialista. */
export const ACCOUNTANT_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.invoice_draft,
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
  DocumentType.supplier_invoice,
] as const;

export const SALES_DDT_ACTIVE_STATUSES = [
  'confirmed',
  'printed',
  'sent',
] as const;
