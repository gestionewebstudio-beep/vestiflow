import { DocumentType } from '@prisma/client';

import { PROFORMA_FISCAL_DISCLAIMER } from './document-type.util';

/**
 * La vendita al banco si dichiara «interna non fiscale» all'operatore
 * (`store-sale-register.component.html`) e scrive la stessa cosa nel commento
 * interno del documento. Un A4 con numero, IVA e totale che NON lo ripete è
 * tipograficamente indistinguibile da un documento fiscale: l'avviso è la
 * condizione perché quel foglio possa esistere.
 */
export const STORE_SALE_FISCAL_DISCLAIMER =
  'Registrazione interna non fiscale. Lo scontrino è emesso dalla cassa esterna.';

/**
 * Avviso in testa al foglio, per i soli documenti che non sono fiscali.
 * Mappa parziale di proposito: il valore assente significa «documento senza
 * avviso», non «documento da classificare».
 */
const FISCAL_DISCLAIMER: Readonly<Partial<Record<DocumentType, string>>> = {
  [DocumentType.proforma]: PROFORMA_FISCAL_DISCLAIMER,
  [DocumentType.store_sale]: STORE_SALE_FISCAL_DISCLAIMER,
  [DocumentType.store_return]: STORE_SALE_FISCAL_DISCLAIMER,
};

export function documentPrintDisclaimer(type: DocumentType): string | null {
  return FISCAL_DISCLAIMER[type] ?? null;
}

/**
 * Chi ha un foglio, e chi no.
 *
 * È una mappa esaustiva e non un elenco: un tipo nuovo nell'enum non compila
 * finché qualcuno non dichiara se si stampa. È l'unica difesa che regge nel
 * tempo contro la divergenza col gemello frontend — quella che aveva lasciato
 * la Fattura accompagnatoria stampabile qui e muta di là, per mesi, senza che
 * un test si accorgesse di niente.
 *
 * A `false` stanno solo i tipi che non hanno MAI una riga in `documents`:
 * l'ordine fornitore e l'ordine cliente vivono in tabelle proprie e hanno un
 * PDF proprio (`SupplierOrderPdfService`, `SalesOrderPdfService`), gli altri
 * due sono registri interni che un documento non ce l'hanno affatto.
 */
const HAS_PRINTED_SHEET: Readonly<Record<DocumentType, boolean>> = {
  // Vive in `supplier_orders`: lo stampa SupplierOrderPdfService.
  [DocumentType.supplier_order]: false,
  [DocumentType.goods_receipt]: true,
  [DocumentType.supplier_invoice]: true,
  [DocumentType.manual_load]: true,
  [DocumentType.initial_load]: true,
  [DocumentType.sales_ddt]: true,
  [DocumentType.transfer]: true,
  [DocumentType.manual_unload]: true,
  [DocumentType.adjustment]: true,
  [DocumentType.inventory]: true,
  [DocumentType.proforma]: true,
  [DocumentType.invoice]: true,
  [DocumentType.invoice_accompanying]: true,
  // Si stampa e si consegna come le altre due: e' un documento fiscale.
  [DocumentType.credit_note]: true,
  // Registri interni della fase 2: nessuna riga in `documents`.
  [DocumentType.online_sale]: false,
  // Vive in `manual_receipts`: non e' un documento e non ha un foglio da
  // stampare. Compare nella stampa del REGISTRO come una riga fra le altre.
  [DocumentType.manual_receipt]: false,
  // Vive in `sales_orders`: lo stampa SalesOrderPdfService.
  [DocumentType.customer_order]: false,
  [DocumentType.store_sale]: true,
  [DocumentType.store_return]: true,
  [DocumentType.quote]: true,
};

/** Tipi con export PDF (allineato al frontend). */
export const PRINTABLE_DOCUMENT_TYPES: readonly DocumentType[] = (
  Object.keys(HAS_PRINTED_SHEET) as DocumentType[]
).filter((type) => HAS_PRINTED_SHEET[type]);

export type DocumentPrintKind =
  | 'transfer'
  | 'goods_receipt'
  | 'purchase_invoice'
  | 'sales'
  | 'stock'
  | 'generic';

/**
 * Quale testata mette il foglio: decide SOLO i dati di contesto (fornitore,
 * cliente, sedi), non le colonne delle righe — quelle le decide
 * `documentPrintShowsValues`, che è un asse indipendente.
 */
const PRINT_KIND: Readonly<Record<DocumentType, DocumentPrintKind>> = {
  // Non ha un foglio da stampare (`HAS_PRINTED_SHEET` lo dice a `false`): la
  // voce esiste solo perché la mappa è esaustiva. Se un giorno arrivasse qui
  // davvero, «generic» è l'unica testata che non promette dati che non ha —
  // nessun fornitore, nessun cliente.
  [DocumentType.manual_receipt]: 'generic',
  [DocumentType.supplier_order]: 'generic',
  // Famiglia carico: fornitore + sede + causale. Sul carico manuale e su
  // quello iniziale il fornitore spesso manca, e la causale resta l'unica cosa
  // che dice cos'è quel documento.
  [DocumentType.goods_receipt]: 'goods_receipt',
  [DocumentType.manual_load]: 'goods_receipt',
  [DocumentType.initial_load]: 'goods_receipt',
  // Registrazione fattura fornitore: testata propria. Non è il layout di
  // vendita — `recipientAddress`, lì, è lo snapshot del FORNITORE, e riusarlo
  // stamperebbe un foglio che dichiara il fornitore come cliente.
  [DocumentType.supplier_invoice]: 'purchase_invoice',
  [DocumentType.sales_ddt]: 'sales',
  [DocumentType.transfer]: 'transfer',
  // Scarico manuale: layout vendita (Cliente + righe con prezzi/totali).
  [DocumentType.manual_unload]: 'sales',
  // Rettifica e inventario: la sede è tutto il contesto che hanno.
  [DocumentType.adjustment]: 'stock',
  [DocumentType.inventory]: 'stock',
  [DocumentType.proforma]: 'sales',
  [DocumentType.invoice]: 'sales',
  [DocumentType.invoice_accompanying]: 'sales',
  // Stesso impaginato della famiglia commerciale: cambiano titolo, verso e
  // contenuto, non la forma del foglio.
  [DocumentType.credit_note]: 'sales',
  [DocumentType.online_sale]: 'sales',
  [DocumentType.customer_order]: 'sales',
  // Vendita al banco: il cliente può non esserci, la sede c'è sempre.
  [DocumentType.store_sale]: 'sales',
  [DocumentType.store_return]: 'sales',
  [DocumentType.quote]: 'sales',
};

/**
 * I tipi la cui riga non porta un valore. Non è una scelta d'impaginazione:
 * trasferimenti, rettifiche e inventari nascono con `unitPriceMinor: 0`,
 * `discountPercent: 0` e `lineTotalMinor: 0` scritti fissi in
 * `transfer-adjustment-workflow.service.ts`. Stampare per loro le colonne
 * Prezzo/Sconto/IVA/Totale vuol dire stampare una colonna di zeri sotto un
 * totale di zero — che è esattamente ciò che il Trasferimento faceva.
 */
const VALUELESS_KINDS: readonly DocumentPrintKind[] = ['transfer', 'stock'] as const;

export function isPrintableDocumentType(type: DocumentType): boolean {
  return HAS_PRINTED_SHEET[type];
}

export function documentPrintKind(type: DocumentType): DocumentPrintKind {
  return PRINT_KIND[type];
}

/** Il foglio porta le colonne di valore e il blocco totali? */
export function documentPrintShowsValues(type: DocumentType): boolean {
  return !VALUELESS_KINDS.includes(documentPrintKind(type));
}

export function documentReferenceLabel(reference: string | null, series: string | null): string {
  if (reference) {
    return reference;
  }
  return series ? `Bozza · serie ${series}` : 'Bozza · senza serie';
}
