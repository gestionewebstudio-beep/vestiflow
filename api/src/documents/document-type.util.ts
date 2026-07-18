import { DocumentType } from '@prisma/client';

/** Documenti che di norma non movimentano magazzino (§2.1, §9). */
export const NON_STOCK_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.supplier_order,
  DocumentType.supplier_invoice,
  // Preventivo: mai effetti magazzino (non impegna e non blocca disponibilità).
  DocumentType.quote,
] as const;

/** Avviso obbligatorio in stampa/note proforma (§9.1). */
export const PROFORMA_FISCAL_DISCLAIMER =
  'Documento non fiscale / Proforma non valida ai fini IVA.';

export const PROFORMA_DEFAULT_NOTES = PROFORMA_FISCAL_DISCLAIMER;

/** Tipi ammessi in conversione da proforma (§9.1). */
export const PROFORMA_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.invoice_draft,
] as const;

/**
 * Tipi generabili dal DDT vendita (prompt DDT §GENERAZIONE DOCUMENTI):
 * Bozza fattura o Proforma — la fattura vera non è prevista in questa fase.
 */
export const SALES_DDT_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.invoice_draft,
  DocumentType.proforma,
] as const;

export function documentTypeDefaultLoadsStock(type: DocumentType): boolean {
  return !(NON_STOCK_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isProformaConvertTarget(type: DocumentType): boolean {
  return (PROFORMA_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}

export function isSalesDdtConvertTarget(type: DocumentType): boolean {
  return (SALES_DDT_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}
