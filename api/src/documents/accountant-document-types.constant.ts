import { DocumentType } from '@prisma/client';

/** Tipi documento rilevanti per il registro commercialista. */
export const ACCOUNTANT_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.invoice_draft,
  // ⚠️ La nota di credito entra col proprio VERSO NEGATIVO. Renderla visibile
  // senza applicare il segno la farebbe sommare come una fattura in più: il
  // commercialista vedrebbe uno storno come un ricavo. Il censimento dei punti
  // di aggregazione è in `docs/07-specifica-famiglia-fattura.md` §16.
  DocumentType.credit_note,
  DocumentType.goods_receipt,
  DocumentType.supplier_invoice,
] as const;

export const SALES_DDT_ACTIVE_STATUSES = [
  'confirmed',
  'printed',
  'sent',
] as const;
