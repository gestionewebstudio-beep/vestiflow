import { describe, expect, it } from 'vitest';

import { computeDocumentTotals, type DocumentTotalsLine } from './document-totals.util';

function line(over: Partial<DocumentTotalsLine> = {}): DocumentTotalsLine {
  return {
    netMinor: 10000,
    vatMinor: 2200,
    vatRate: 22,
    countsVatInTotal: true,
    ...over,
  };
}

const EUR = 'EUR';
const minors = (totals: ReturnType<typeof computeDocumentTotals>) => ({
  linesTotal: totals.linesTotal.amountMinor,
  documentDiscount: totals.documentDiscount.amountMinor,
  subtotal: totals.subtotal.amountMinor,
  tax: totals.tax.amountMinor,
  total: totals.total.amountMinor,
});

describe('computeDocumentTotals', () => {
  it('documento senza righe: tutto a zero', () => {
    expect(minors(computeDocumentTotals([], 0, EUR))).toEqual({
      linesTotal: 0,
      documentDiscount: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
    });
  });

  it('propaga la valuta a ogni importo', () => {
    const totals = computeDocumentTotals([line()], 0, 'USD');

    expect(totals.linesTotal.currencyCode).toBe('USD');
    expect(totals.total.currencyCode).toBe('USD');
  });

  it('senza sconto somma le imposte di riga già calcolate', () => {
    expect(
      minors(
        computeDocumentTotals(
          [
            line({ netMinor: 10000, vatMinor: 2200 }),
            line({ netMinor: 5000, vatMinor: 500, vatRate: 10 }),
          ],
          0,
          EUR,
        ),
      ),
    ).toEqual({
      linesTotal: 15000,
      documentDiscount: 0,
      subtotal: 15000,
      tax: 2700,
      total: 17700,
    });
  });

  it('esclude dal totale l’imposta delle righe che non vi concorrono', () => {
    // Reverse charge: imponibile sì, imposta no.
    expect(minors(computeDocumentTotals([line({ countsVatInTotal: false })], 0, EUR))).toEqual({
      linesTotal: 10000,
      documentDiscount: 0,
      subtotal: 10000,
      tax: 0,
      total: 10000,
    });
  });

  it('sconto documento: riduce l’imponibile e ricalcola l’imposta sul netto scontato', () => {
    // 100,00 − 10% = 90,00 → IVA 19,80 → totale 109,80
    expect(minors(computeDocumentTotals([line()], 10, EUR))).toEqual({
      linesTotal: 10000,
      documentDiscount: 1000,
      subtotal: 9000,
      tax: 1980,
      total: 10980,
    });
  });

  it('sconto documento su due aliquote: ripartizione proporzionale', () => {
    // 200,00 − 10% = 180,00 ripartito 50/50 → 90,00 per aliquota
    // IVA = 19,80 + 9,00 = 28,80
    expect(
      minors(
        computeDocumentTotals(
          [
            line({ netMinor: 10000, vatMinor: 2200, vatRate: 22 }),
            line({ netMinor: 10000, vatMinor: 1000, vatRate: 10 }),
          ],
          10,
          EUR,
        ),
      ),
    ).toEqual({
      linesTotal: 20000,
      documentDiscount: 2000,
      subtotal: 18000,
      tax: 2880,
      total: 20880,
    });
  });

  it('sconto documento su quote diseguali: la ripartizione segue il peso della riga', () => {
    // 300,00: riga A 100,00 (22%), riga B 200,00 (10%). Sconto 10% → 270,00.
    // A: 270,00·(1/3) = 90,00 → 19,80   B: 270,00·(2/3) = 180,00 → 18,00
    expect(
      minors(
        computeDocumentTotals(
          [
            line({ netMinor: 10000, vatRate: 22 }),
            line({ netMinor: 20000, vatRate: 10, vatMinor: 2000 }),
          ],
          10,
          EUR,
        ),
      ),
    ).toEqual({
      linesTotal: 30000,
      documentDiscount: 3000,
      subtotal: 27000,
      tax: 3780,
      total: 30780,
    });
  });

  it('sconto documento con riga esclusa: l’imponibile scontato la comprende comunque', () => {
    // Lo sconto agisce su tutto l'imponibile; l'imposta esclusa resta esclusa.
    expect(
      minors(
        computeDocumentTotals(
          [
            line({ netMinor: 10000, vatRate: 22 }),
            line({ netMinor: 10000, vatRate: 22, countsVatInTotal: false }),
          ],
          10,
          EUR,
        ),
      ),
    ).toEqual({
      linesTotal: 20000,
      documentDiscount: 2000,
      subtotal: 18000,
      tax: 1980,
      total: 19980,
    });
  });

  it('aliquota zero: nessuna imposta nemmeno con sconto', () => {
    expect(minors(computeDocumentTotals([line({ vatRate: 0, vatMinor: 0 })], 10, EUR))).toEqual({
      linesTotal: 10000,
      documentDiscount: 1000,
      subtotal: 9000,
      tax: 0,
      total: 9000,
    });
  });

  it('sconto 100%: imponibile e imposta azzerati', () => {
    expect(minors(computeDocumentTotals([line()], 100, EUR))).toEqual({
      linesTotal: 10000,
      documentDiscount: 10000,
      subtotal: 0,
      tax: 0,
      total: 0,
    });
  });

  it('imponibile nullo con sconto: nessuna divisione per zero', () => {
    expect(minors(computeDocumentTotals([line({ netMinor: 0, vatMinor: 0 })], 10, EUR))).toEqual({
      linesTotal: 0,
      documentDiscount: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
    });
  });
});
