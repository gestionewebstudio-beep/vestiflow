import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  PRINTABLE_DOCUMENT_TYPES,
  documentPrintDisclaimer,
  documentPrintKind,
  documentPrintShowsValues,
  isPrintableDocumentType,
} from './document-print.util';

/**
 * Prima di questo file il frontend non aveva NESSUNO spec sulla stampa dei
 * documenti. È così che la Fattura accompagnatoria ha potuto restare muta di
 * qua ed essere stampabile di là: nessuno guardava.
 *
 * Il gemello lato API è `api/src/documents/document-print.util.spec.ts` e fa le
 * stesse domande; la guardia `npm run check:print-types` verifica che le due
 * mappe diano le stesse risposte.
 */
describe('document-print.util (frontend)', () => {
  const ALL_TYPES = Object.values(DocumentType);

  const NON_PRINTABLE = [
    [DocumentType.SupplierOrder, 'vive in sales/supplier orders, con PDF proprio'],
    [DocumentType.CustomerOrder, 'vive in sales_orders, con PDF proprio'],
  ] as const;

  it('ogni tipo dell’enum ha una risposta dichiarata', () => {
    for (const type of ALL_TYPES) {
      expect(typeof isPrintableDocumentType(type), `${type} senza stampabilità`).toBe('boolean');
      expect(documentPrintKind(type), `${type} senza ramo di layout`).toBeDefined();
    }
  });

  it('si stampa tutto tranne i due ordini, che hanno un PDF proprio', () => {
    const muti = ALL_TYPES.filter((type) => !isPrintableDocumentType(type));
    expect(muti.sort()).toEqual([DocumentType.SupplierOrder, DocumentType.CustomerOrder].sort());
  });

  it.each(NON_PRINTABLE)('%s non si stampa da qui: %s', (type) => {
    expect(isPrintableDocumentType(type)).toBe(false);
  });

  // Il difetto che ha innescato il lavoro: c'era di là, non di qua.
  it('la Fattura accompagnatoria si stampa', () => {
    expect(isPrintableDocumentType(DocumentType.InvoiceAccompanying)).toBe(true);
    expect(PRINTABLE_DOCUMENT_TYPES).toContain(DocumentType.InvoiceAccompanying);
  });

  it('carico manuale e iniziale hanno la testata dell’arrivo merce', () => {
    expect(documentPrintKind(DocumentType.ManualLoad)).toBe('goods_receipt');
    expect(documentPrintKind(DocumentType.InitialLoad)).toBe('goods_receipt');
  });

  it('la registrazione fattura non usa il layout di vendita', () => {
    // Lì l'intestatario è il FORNITORE: il layout vendita lo stamperebbe come
    // cliente, cioè un foglio che dichiara il falso.
    expect(documentPrintKind(DocumentType.SupplierInvoice)).toBe('purchase_invoice');
  });

  it('i documenti di solo magazzino non portano colonne di valore', () => {
    expect(documentPrintShowsValues(DocumentType.Transfer)).toBe(false);
    expect(documentPrintShowsValues(DocumentType.Adjustment)).toBe(false);
    expect(documentPrintShowsValues(DocumentType.Inventory)).toBe(false);
  });

  it('i documenti con importi veri portano le colonne di valore', () => {
    expect(documentPrintShowsValues(DocumentType.GoodsReceipt)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.SupplierInvoice)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.InvoiceDraft)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.StoreSale)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.ManualUnload)).toBe(true);
  });

  it('proforma e cassa negozio dichiarano di non essere fiscali', () => {
    expect(documentPrintDisclaimer(DocumentType.Proforma)).toContain('non fiscale');
    expect(documentPrintDisclaimer(DocumentType.StoreSale)).toContain('non fiscale');
    expect(documentPrintDisclaimer(DocumentType.StoreReturn)).toContain('non fiscale');
  });

  it('i documenti fiscali non portano avvisi', () => {
    expect(documentPrintDisclaimer(DocumentType.InvoiceDraft)).toBeNull();
    expect(documentPrintDisclaimer(DocumentType.SalesDdt)).toBeNull();
    expect(documentPrintDisclaimer(DocumentType.Transfer)).toBeNull();
  });
});
