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

/**
 * Fatture di vendita: Fattura e Fattura accompagnatoria. Condividono elenco,
 * numeratore e form base; si differenziano per trasporto/destinazione e per lo
 * scarico di magazzino (solo l'accompagnatoria, e solo senza DDT agganciato).
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.invoice_draft,
  DocumentType.invoice_accompanying,
] as const;

export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipo su cui chiavare il numeratore (DocumentSequence).
 *
 * Di norma coincide col tipo del documento. Fanno eccezione le fatture di
 * vendita: Fattura e Fattura accompagnatoria condividono UN SOLO progressivo,
 * quindi entrambe numerano sotto `invoice_draft`. La numerazione non si divide
 * per tipo — due fatture di tipo diverso non possono avere lo stesso numero.
 */
export function documentNumberingType(type: DocumentType): DocumentType {
  return type === DocumentType.invoice_accompanying ? DocumentType.invoice_draft : type;
}

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
