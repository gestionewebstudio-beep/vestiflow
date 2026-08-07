import { DocumentType } from '@prisma/client';

/** Documenti che di norma non movimentano magazzino (§2.1, §9). */
export const NON_STOCK_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.supplier_order,
  DocumentType.supplier_invoice,
  // Preventivo: mai effetti magazzino (non impegna e non blocca disponibilità).
  DocumentType.quote,
  // Nota di credito: rettifica contabile; il rientro fisico è dello store_return.
  DocumentType.credit_note,
] as const;

/**
 * Fatture di vendita: Fattura, Fattura accompagnatoria e Nota di credito.
 * Condividono elenco, numeratore e form base; l'accompagnatoria si distingue
 * per trasporto/destinazione e scarico (solo senza DDT agganciato), la nota di
 * credito per il TipoDocumento TD04 e il riferimento alla fattura rettificata.
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.invoice_draft,
  DocumentType.invoice_accompanying,
  DocumentType.credit_note,
] as const;

export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipo su cui chiavare il numeratore (DocumentSequence).
 *
 * Di norma coincide col tipo del documento. Fanno eccezione le fatture di
 * vendita: Fattura, Fattura accompagnatoria e Nota di credito condividono UN
 * SOLO progressivo (stile Danea), quindi numerano tutte sotto `invoice_draft`.
 * La numerazione non si divide per tipo — due fatture di tipo diverso non
 * possono avere lo stesso numero.
 */
export function documentNumberingType(type: DocumentType): DocumentType {
  return type === DocumentType.invoice_accompanying || type === DocumentType.credit_note
    ? DocumentType.invoice_draft
    : type;
}

/**
 * Insieme dei tipi che condividono il numeratore del tipo dato: la famiglia
 * fatture al completo, altrimenti il solo tipo. I documenti sono salvati col
 * tipo CONCRETO, quindi il massimo del progressivo va cercato su tutto
 * l'insieme — cercarlo sul solo tipo normalizzato ignorerebbe i numeri già
 * presi da accompagnatorie e note di credito.
 */
export function documentNumberingTypeSet(type: DocumentType): readonly DocumentType[] {
  return documentNumberingType(type) === DocumentType.invoice_draft
    ? SALES_INVOICE_DOCUMENT_TYPES
    : [type];
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

/**
 * Tipi generabili da una fattura emessa: la sola Nota di credito. La NC nasce
 * sempre come rettifica di una fattura, mai il contrario.
 */
export const INVOICE_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.credit_note,
] as const;

export function isProformaConvertTarget(type: DocumentType): boolean {
  return (PROFORMA_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}

export function isSalesDdtConvertTarget(type: DocumentType): boolean {
  return (SALES_DDT_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}

export function isInvoiceConvertTarget(type: DocumentType): boolean {
  return (INVOICE_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}
