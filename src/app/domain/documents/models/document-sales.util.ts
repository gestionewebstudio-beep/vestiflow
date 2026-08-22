import { DocumentType } from '@core/models/document.model';

/**
 * Documenti vendita gestiti dal form condiviso (proforma, fatture).
 * Il DDT vendita usa la maschera dell'Ordine cliente (prompt DDT §BASE):
 * rotta dedicata /app/documents/sales-ddt.
 */
export const SALES_FORM_DOCUMENT_TYPES = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  // La nota di credito usa la stessa base di maschera, con le proprie
  // differenze di dominio (casella «Carica magazzino», verso economico).
  DocumentType.CreditNote,
] as const;

/**
 * I tipi che la maschera vendita gestisce, come unione di letterali.
 *
 * L'annotazione `readonly DocumentType[]` qui sopra è stata tolta apposta:
 * allargava il tipo e rendeva impossibile derivare questa unione. Serve a far
 * pretendere dal compilatore una voce per ogni tipo dove l'elenco non basta —
 * i segmenti di rotta, per esempio: un tipo aggiunto qui e dimenticato là
 * darebbe una maschera senza indirizzo, e nessun test lo direbbe.
 */
export type SalesFormDocumentType = (typeof SALES_FORM_DOCUMENT_TYPES)[number];

/** Documenti vendita con anteprima stampa dedicata. */
export const SALES_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
  DocumentType.SalesDdt,
  DocumentType.Quote,
] as const;

/**
 * La famiglia Fattura: Fattura, Fattura accompagnatoria e Nota di credito.
 * Condividono elenco, numeratore, form base, permessi e azioni fiscali; si
 * differenziano per le sezioni Trasporto/Destinazione (accompagnatoria), per il
 * verso economico e la casella «Carica magazzino» (nota di credito).
 */
export const SALES_INVOICE_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.CreditNote,
] as const;

export function isSalesFormDocumentType(type: DocumentType): boolean {
  return (SALES_FORM_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isSalesDocumentType(type: DocumentType): boolean {
  return (SALES_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isSalesDdtDocumentType(type: DocumentType): boolean {
  return type === DocumentType.SalesDdt;
}

export function isProformaDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Proforma;
}

export function isInvoiceDraftDocumentType(type: DocumentType): boolean {
  return type === DocumentType.InvoiceDraft;
}

/** Fattura accompagnatoria: trasporto, destinazione e scarico magazzino. */
export function isInvoiceAccompanyingDocumentType(type: DocumentType): boolean {
  return type === DocumentType.InvoiceAccompanying;
}

/** Una delle due fatture di vendita (azioni fiscali, XML, numeratore comune). */
export function isSalesInvoiceDocumentType(type: DocumentType): boolean {
  return (SALES_INVOICE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * **Chi può agganciare un DDT vendita** («Riferimento DDT»).
 *
 * ⛔ **L'accompagnatoria NO, ed è la regola vigente** (`12` §matrice: «mai
 * DDT»). L'accompagnatoria **sostituisce** il DDT nella stessa uscita:
 * agganciarne uno è la stessa contraddizione di una Fattura dentro un DDT.
 *
 * ⚠️ Fino al 22/08/2026 la maschera lo offriva anche lì, perché usava
 * `isSalesInvoiceDocumentType` — che è la famiglia intera, giusta per XML,
 * numeratore e azioni fiscali, sbagliata per questo. Il codice permetteva ciò
 * che la specifica vieta, e il proprietario ha confermato che **è il codice a
 * cedere, non la matrice**.
 *
 * ⭐ **A cosa serve davvero l'aggancio**: è la fattura DIFFERITA — DDT durante
 * il periodo, Fattura che li riepiloga. Alimenta i riferimenti DDT nell'XML
 * FatturaPA e la riga «Riferimento DDT» in stampa. Funzione legittima, con la
 * porta d'ingresso sbagliata.
 *
 * ⏸️ **La Nota di credito resta come prima**: nessuna regola scritta le vieta
 * il collegamento, e toglierlo qui sarebbe una decisione non richiesta.
 */
export function supportsLinkedSalesDdt(type: DocumentType): boolean {
  return isSalesInvoiceDocumentType(type) && !isInvoiceAccompanyingDocumentType(type);
}

/** Preventivo: maschera dedicata (stessa impostazione dell'Ordine cliente). */
export function isQuoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Quote;
}
