import { DocumentType } from '@core/models/document.model';

/**
 * Documenti vendita gestiti dal form condiviso (proforma, fatture).
 * Il DDT vendita usa la maschera dell'Ordine cliente (prompt DDT §BASE):
 * rotta dedicata /app/documents/sales-ddt.
 */
export const SALES_FORM_DOCUMENT_TYPES = [
  DocumentType.Proforma,
  DocumentType.Invoice,
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
  DocumentType.Invoice,
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
  DocumentType.Invoice,
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

export function isInvoiceDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Invoice;
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
 * **Chi può agganciare un DDT vendita** («Riferimento DDT»): **solo la
 * Fattura**.
 *
 * ⭐ **A cosa serve l'aggancio**: è la fattura DIFFERITA — DDT durante il
 * periodo, Fattura che li riepiloga. Alimenta i riferimenti DDT nell'XML
 * FatturaPA e la riga «Riferimento DDT» in stampa. Funzione legittima, e solo
 * di questo tipo.
 *
 * ⛔ **Fattura accompagnatoria: mai DDT** (`12` §matrice). Sostituisce il DDT
 * nella stessa uscita: agganciarne uno è la stessa contraddizione di una
 * Fattura dentro un DDT.
 *
 * ⛔ **Nota di credito: nemmeno lei**, e la ragione non è un divieto testuale.
 * La matrice dice che la NC **non usa «Includi documento»** e **nasce da
 * Fattura o Accompagnatoria**: un DDT non è una sua sorgente. Verificato che
 * non le serva a niente — la NC **non genera XML FatturaPA** (nessun `TD04`
 * nel generatore) e in stampa i DDT che la riguardano sono quelli della
 * **fattura originaria**.
 *
 * ⭐ **Se un giorno serviranno fiscalmente, si recuperano attraverso la
 * relazione con la fattura di origine** (`Document.sourceDocumentId`), non
 * aprendo un ingresso DDT → Nota di credito. La differenza non è formale: il
 * primo conserva la catena, il secondo inventa una sorgente che il modello
 * documentale non prevede.
 *
 * ⚠️ Fino al 22/08/2026 questo lo decideva `isSalesInvoiceDocumentType`, che è
 * la famiglia intera — giusta per XML, numeratore e azioni fiscali, sbagliata
 * qui. Il codice permetteva ciò che la matrice non prevede, e cede il codice.
 */
export function supportsLinkedSalesDdt(type: DocumentType): boolean {
  return type === DocumentType.Invoice;
}

/** Preventivo: maschera dedicata (stessa impostazione dell'Ordine cliente). */
export function isQuoteDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Quote;
}
