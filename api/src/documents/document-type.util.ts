import { DocumentType } from '@prisma/client';

/** Documenti che di norma non movimentano magazzino (§2.1, §9). */
export const NON_STOCK_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice,
  DocumentType.supplier_order,
  DocumentType.supplier_invoice,
  // Preventivo: mai effetti magazzino (non impegna e non blocca disponibilità).
  DocumentType.quote,
  // ⚠️ Nota di credito: qui significa **default della spunta spento**, non «non
  // può movimentare». Questa lista ha un solo consumatore,
  // `documentTypeDefaultLoadsStock`, e governa il valore iniziale della casella
  // di riga. Il carico della nota esiste, è opzionale per riga e passa dal
  // percorso per riga (`docs/09` §4-ter): sono due domande diverse.
  DocumentType.credit_note,
] as const;

/**
 * Fatture di vendita: Fattura e Fattura accompagnatoria. Condividono elenco,
 * numeratore e form base; si differenziano per trasporto/destinazione e per lo
 * scarico di magazzino (solo l'accompagnatoria, e solo senza DDT agganciato).
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.invoice,
  DocumentType.invoice_accompanying,
  // Terzo tipo della famiglia: stesso registro, stessa maschera, stesso
  // numeratore. Il verso economico negativo lo dà il tipo, non il segno.
  DocumentType.credit_note,
] as const;

export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipo su cui chiavare il numeratore (DocumentSequence).
 *
 * Di norma coincide col tipo del documento. Fanno eccezione le fatture di
 * vendita: Fattura e Fattura accompagnatoria condividono UN SOLO progressivo,
 * quindi entrambe numerano sotto `invoice`. La numerazione non si divide
 * per tipo — due fatture di tipo diverso non possono avere lo stesso numero.
 */
export function documentNumberingType(type: DocumentType): DocumentType {
  return (SALES_INVOICE_NUMBERING_SHARED_TYPES as readonly string[]).includes(type)
    ? DocumentType.invoice
    : type;
}

/**
 * I tipi che NON possiedono il numeratore ma ci pescano dentro: numerano sotto
 * `invoice`. Dichiarati una volta sola perché `documentNumberingType` e
 * `documentNumberingTypes` non possano divergere — sono la stessa regola letta
 * nei due versi, e disallinearle è il difetto che la migration del 11/08 chiude.
 */
const SALES_INVOICE_NUMBERING_SHARED_TYPES: readonly DocumentType[] = [
  DocumentType.invoice_accompanying,
  DocumentType.credit_note,
] as const;

/**
 * TUTTI i tipi che pescano dallo stesso numeratore, incluso quello passato.
 *
 * Serve a LEGGERE la partizione del numero. `documentNumberingType` da sola
 * indica solo chi «possiede» il numeratore, e usarla come filtro di uguaglianza
 * sulla colonna `type` è un errore silenzioso: la colonna porta il tipo grezzo,
 * quindi una Fattura accompagnatoria non rientra mai in `type = invoice`.
 * Chi legge vedrebbe metà partizione — massimo, anteprima, buchi, conteggi — e
 * proporrebbe numeri già occupati, che l'indice unico (partizionato sul
 * numeratore, migration 20260811090000) boccerebbe. Il risultato è peggiore del
 * difetto che l'indice chiude: il tipo diventa insalvabile.
 *
 * Ogni lettura della partizione usa `{ type: { in: documentNumberingTypes(t) } }`.
 */
export function documentNumberingTypes(type: DocumentType): readonly DocumentType[] {
  const owner = documentNumberingType(type);
  if (owner === DocumentType.invoice) {
    return [DocumentType.invoice, ...SALES_INVOICE_NUMBERING_SHARED_TYPES];
  }
  return [owner];
}

/** Avviso obbligatorio in stampa/note proforma (§9.1). */
export const PROFORMA_FISCAL_DISCLAIMER =
  'Documento non fiscale / Proforma non valida ai fini IVA.';

export const PROFORMA_DEFAULT_NOTES = PROFORMA_FISCAL_DISCLAIMER;

/** Tipi ammessi in conversione da proforma (§9.1). */
export const PROFORMA_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.invoice,
] as const;

/**
 * Tipi generabili dal DDT vendita (prompt DDT §GENERAZIONE DOCUMENTI):
 * Fattura o Proforma.
 */
export const SALES_DDT_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.invoice,
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
