import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

/**
 * Chi ha un foglio, e chi no.
 *
 * È una mappa esaustiva e non un elenco: un tipo nuovo nell'enum non compila
 * finché qualcuno non dichiara se si stampa. È l'unica difesa che regge nel
 * tempo contro la divergenza col gemello API — quella che aveva lasciato la
 * Fattura accompagnatoria stampabile di là e muta qui, senza che un test se ne
 * accorgesse. La guardia `npm run check:print-types` confronta i due file.
 *
 * A `false` stanno solo i tipi che non hanno mai una riga in `documents`:
 * l'ordine fornitore e l'ordine cliente vivono in tabelle proprie e hanno un
 * PDF proprio.
 */
const HAS_PRINTED_SHEET: Readonly<Record<DocumentTypeValue, boolean>> = {
  // Vive in `supplier_orders`: lo stampa la sezione Ordini fornitori.
  [DocumentType.SupplierOrder]: false,
  [DocumentType.GoodsReceipt]: true,
  [DocumentType.SupplierInvoice]: true,
  [DocumentType.ManualLoad]: true,
  [DocumentType.InitialLoad]: true,
  [DocumentType.SalesDdt]: true,
  [DocumentType.Transfer]: true,
  [DocumentType.ManualUnload]: true,
  [DocumentType.Adjustment]: true,
  [DocumentType.Inventory]: true,
  [DocumentType.Proforma]: true,
  [DocumentType.Invoice]: true,
  [DocumentType.InvoiceAccompanying]: true,
  // Si stampa come le altre due: e' un documento fiscale.
  [DocumentType.CreditNote]: true,
  // Vive in `sales_orders`: lo stampa la sezione Ordini cliente.
  [DocumentType.CustomerOrder]: false,
  [DocumentType.StoreSale]: true,
  [DocumentType.StoreReturn]: true,
  [DocumentType.Quote]: true,
};

/** Tipi con anteprima/stampa dedicata (allineato all'API). */
export const PRINTABLE_DOCUMENT_TYPES: readonly DocumentTypeValue[] = (
  Object.keys(HAS_PRINTED_SHEET) as DocumentTypeValue[]
).filter((type) => HAS_PRINTED_SHEET[type]);

export type DocumentPrintKind =
  'transfer' | 'goods_receipt' | 'purchase_invoice' | 'sales' | 'stock' | 'generic';

/**
 * Quale testata mette il foglio: decide SOLO i dati di contesto (fornitore,
 * cliente, sedi), non le colonne delle righe — quelle le decide
 * `documentPrintShowsValues`, che è un asse indipendente.
 */
const PRINT_KIND: Readonly<Record<DocumentTypeValue, DocumentPrintKind>> = {
  [DocumentType.SupplierOrder]: 'generic',
  // Famiglia carico: fornitore + sede + causale. Sul carico manuale e su
  // quello iniziale il fornitore spesso manca, e la causale resta l'unica cosa
  // che dice cos'è quel documento.
  [DocumentType.GoodsReceipt]: 'goods_receipt',
  [DocumentType.ManualLoad]: 'goods_receipt',
  [DocumentType.InitialLoad]: 'goods_receipt',
  // Registrazione fattura fornitore: testata propria. Non è il layout di
  // vendita — l'intestatario, lì, è il FORNITORE.
  [DocumentType.SupplierInvoice]: 'purchase_invoice',
  [DocumentType.SalesDdt]: 'sales',
  [DocumentType.Transfer]: 'transfer',
  // Vendita manuale: layout vendita (Cliente + righe con prezzi/totali).
  [DocumentType.ManualUnload]: 'sales',
  // Rettifica e inventario: la sede è tutto il contesto che hanno.
  [DocumentType.Adjustment]: 'stock',
  [DocumentType.Inventory]: 'stock',
  [DocumentType.Proforma]: 'sales',
  [DocumentType.Invoice]: 'sales',
  [DocumentType.InvoiceAccompanying]: 'sales',
  // Stesso impaginato della famiglia commerciale: cambiano titolo, verso e
  // contenuto, non la forma del foglio.
  [DocumentType.CreditNote]: 'sales',
  [DocumentType.CustomerOrder]: 'sales',
  // Vendita al banco: il cliente può non esserci, la sede c'è sempre.
  [DocumentType.StoreSale]: 'sales',
  [DocumentType.StoreReturn]: 'sales',
  [DocumentType.Quote]: 'sales',
};

/**
 * I tipi la cui riga non porta un valore. Non è una scelta d'impaginazione:
 * trasferimenti, rettifiche e inventari nascono con prezzo, sconto e totale a
 * zero scritti fissi lato API. Stampare per loro le colonne
 * Prezzo/Sconto/IVA/Totale vuol dire stampare una colonna di zeri sotto un
 * totale di zero — che è esattamente ciò che il Trasferimento faceva.
 */
const VALUELESS_KINDS: readonly DocumentPrintKind[] = ['transfer', 'stock'] as const;

/**
 * La vendita al banco si dichiara «interna non fiscale» all'operatore. Un foglio
 * con numero, IVA e totale che NON lo ripete è tipograficamente
 * indistinguibile da un documento fiscale: l'avviso è la condizione perché
 * quel foglio possa esistere.
 */
export const STORE_SALE_FISCAL_DISCLAIMER =
  'Registrazione interna non fiscale. Lo scontrino è emesso dalla cassa esterna.';

export const PROFORMA_FISCAL_DISCLAIMER =
  'Documento non fiscale / Proforma non valida ai fini IVA.';

/**
 * Avviso in testa al foglio, per i soli documenti che non sono fiscali. Mappa
 * parziale di proposito: il valore assente significa «documento senza avviso»,
 * non «documento da classificare».
 */
const FISCAL_DISCLAIMER: Readonly<Partial<Record<DocumentTypeValue, string>>> = {
  [DocumentType.Proforma]: PROFORMA_FISCAL_DISCLAIMER,
  [DocumentType.StoreSale]: STORE_SALE_FISCAL_DISCLAIMER,
  [DocumentType.StoreReturn]: STORE_SALE_FISCAL_DISCLAIMER,
};

export function isPrintableDocumentType(type: DocumentTypeValue): boolean {
  return HAS_PRINTED_SHEET[type];
}

export function documentPrintKind(type: DocumentTypeValue): DocumentPrintKind {
  return PRINT_KIND[type];
}

/** Il foglio porta le colonne di valore e il blocco totali? */
export function documentPrintShowsValues(type: DocumentTypeValue): boolean {
  return !VALUELESS_KINDS.includes(documentPrintKind(type));
}

export function documentPrintDisclaimer(type: DocumentTypeValue): string | null {
  return FISCAL_DISCLAIMER[type] ?? null;
}
