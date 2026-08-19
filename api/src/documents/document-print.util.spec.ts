import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { DOCUMENT_TYPES } from './document-defaults';
import {
  documentPrintDisclaimer,
  documentPrintKind,
  documentPrintShowsValues,
  documentReferenceLabel,
  isPrintableDocumentType,
} from './document-print.util';

/**
 * I quattro tipi che NON si stampano, ciascuno col proprio perché. L'elenco
 * sta qui e non nel sorgente perché è il test a doverlo custodire: se domani
 * qualcuno spegne un tipo per sbaglio, deve venire a spiegarlo in questo file.
 */
const NON_PRINTABLE: ReadonlyArray<readonly [DocumentType, string]> = [
  [DocumentType.supplier_order, 'vive in supplier_orders, con PDF proprio'],
  [DocumentType.customer_order, 'vive in sales_orders, con PDF proprio'],
  [DocumentType.online_sale, 'registro interno: nessuna riga in documents'],
];

describe('document-print.util', () => {
  // In positivo, e su TUTTA la lista: prima qui viveva una sola asserzione
  // negativa (`inventory` non stampabile), e bastava abilitare quel tipo per
  // lasciare l'area senza rete.
  it('ogni tipo documento gestito ha un foglio', () => {
    const muti = DOCUMENT_TYPES.filter((type) => !isPrintableDocumentType(type));
    expect(muti).toEqual([DocumentType.supplier_order]);
  });

  it.each(NON_PRINTABLE)('%s non si stampa da qui: %s', (type) => {
    expect(isPrintableDocumentType(type)).toBe(false);
  });

  it('ogni tipo ha un ramo di layout dichiarato', () => {
    for (const type of Object.values(DocumentType)) {
      expect(documentPrintKind(type), `${type} senza ramo di layout`).toBeDefined();
    }
  });

  it('documentReferenceLabel usa riferimento o bozza', () => {
    expect(documentReferenceLabel('DDT-2026-0001', 'A')).toBe('DDT-2026-0001');
    expect(documentReferenceLabel(null, 'B')).toBe('Bozza · serie B');
  });

  it('documentPrintKind classifica le famiglie', () => {
    expect(documentPrintKind(DocumentType.transfer)).toBe('transfer');
    expect(documentPrintKind(DocumentType.goods_receipt)).toBe('goods_receipt');
    // Carico manuale e iniziale condividono maschera e testata con l'arrivo
    // merce: erano `generic` qui e `goods_receipt` nell'anteprima frontend.
    expect(documentPrintKind(DocumentType.manual_load)).toBe('goods_receipt');
    expect(documentPrintKind(DocumentType.initial_load)).toBe('goods_receipt');
    // La registrazione fattura NON è layout di vendita: l'intestatario è il
    // fornitore, e il layout vendita lo stamperebbe come cliente.
    expect(documentPrintKind(DocumentType.supplier_invoice)).toBe('purchase_invoice');
    expect(documentPrintKind(DocumentType.adjustment)).toBe('stock');
    expect(documentPrintKind(DocumentType.inventory)).toBe('stock');
    expect(documentPrintKind(DocumentType.sales_ddt)).toBe('sales');
    // Scarico manuale: layout vendita (Cliente + prezzi/totali).
    expect(documentPrintKind(DocumentType.manual_unload)).toBe('sales');
    expect(documentPrintKind(DocumentType.store_sale)).toBe('sales');
  });

  // Trasferimenti, rettifiche e inventari nascono con prezzo e totale a zero
  // scritti fissi: le colonne di valore stamperebbero una colonna di zeri.
  it('i documenti di solo magazzino non portano colonne di valore', () => {
    expect(documentPrintShowsValues(DocumentType.transfer)).toBe(false);
    expect(documentPrintShowsValues(DocumentType.adjustment)).toBe(false);
    expect(documentPrintShowsValues(DocumentType.inventory)).toBe(false);
  });

  it('i documenti con importi veri portano le colonne di valore', () => {
    expect(documentPrintShowsValues(DocumentType.goods_receipt)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.manual_load)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.supplier_invoice)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.invoice_draft)).toBe(true);
    expect(documentPrintShowsValues(DocumentType.store_sale)).toBe(true);
  });

  // L'avviso è la condizione perché il foglio della cassa possa esistere: senza,
  // un A4 con numero, IVA e totale è indistinguibile da un documento fiscale.
  it('proforma e cassa negozio dichiarano di non essere fiscali', () => {
    expect(documentPrintDisclaimer(DocumentType.proforma)).toContain('non fiscale');
    expect(documentPrintDisclaimer(DocumentType.store_sale)).toContain('non fiscale');
    expect(documentPrintDisclaimer(DocumentType.store_return)).toContain('non fiscale');
  });

  it('i documenti fiscali non portano avvisi', () => {
    expect(documentPrintDisclaimer(DocumentType.invoice_draft)).toBeNull();
    expect(documentPrintDisclaimer(DocumentType.sales_ddt)).toBeNull();
  });
});
