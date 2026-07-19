import { describe, expect, it } from 'vitest';

import {
  buildPurchaseInvoiceVatSummary,
  receiptVatBreakdown,
  type PurchaseInvoiceReceiptInput,
} from './purchase-invoice-vat-summary.util';

function receipt(overrides: Partial<PurchaseInvoiceReceiptInput>): PurchaseInvoiceReceiptInput {
  return {
    id: 'r1',
    number: 1,
    reference: 'ARR-2026-0001',
    documentDate: new Date('2026-07-15T00:00:00.000Z'),
    subtotalMinor: 0,
    taxMinor: 0,
    lines: [],
    ...overrides,
  };
}

describe('receiptVatBreakdown', () => {
  it('raggruppa le righe per aliquota dallo snapshot IVA', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 30_000,
      taxMinor: 5_400,
      lines: [
        { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
        { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
        { lineTotalMinor: 10_000, lineVatTotalMinor: 1_000, vatSnapshot: { ratePercent: 10 } },
      ],
    });
    expect(breakdown).toEqual([
      { ratePercent: 10, netMinor: 10_000, vatMinor: 1_000 },
      { ratePercent: 22, netMinor: 20_000, vatMinor: 4_400 },
    ]);
  });

  it('deriva l’aliquota dagli importi quando manca lo snapshot', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 10_000,
      taxMinor: 2_200,
      lines: [{ lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: null }],
    });
    expect(breakdown).toEqual([{ ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 }]);
  });

  it('senza righe usa i totali documento come quota unica', () => {
    const breakdown = receiptVatBreakdown({ subtotalMinor: 5_000, taxMinor: 500, lines: [] });
    expect(breakdown).toEqual([{ ratePercent: 10, netMinor: 5_000, vatMinor: 500 }]);
  });

  it('ignora le righe puramente descrittive (importi a zero)', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 10_000,
      taxMinor: 2_200,
      lines: [
        { lineTotalMinor: 0, lineVatTotalMinor: 0, vatSnapshot: null },
        { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
      ],
    });
    expect(breakdown).toEqual([{ ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 }]);
  });
});

describe('buildPurchaseInvoiceVatSummary', () => {
  it('somma per aliquota tra più arrivi e compone il riferimento in ordine di data', () => {
    const summary = buildPurchaseInvoiceVatSummary([
      receipt({
        id: 'r8',
        number: 8,
        documentDate: new Date('2026-07-15T00:00:00.000Z'),
        lines: [
          { lineTotalMinor: 5_000, lineVatTotalMinor: 1_100, vatSnapshot: { ratePercent: 22 } },
        ],
      }),
      receipt({
        id: 'r6',
        number: 6,
        documentDate: new Date('2026-07-15T00:00:00.000Z'),
        lines: [
          { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
          { lineTotalMinor: 4_000, lineVatTotalMinor: 400, vatSnapshot: { ratePercent: 10 } },
        ],
      }),
    ]);
    expect(summary).toEqual([
      {
        ratePercent: 10,
        netMinor: 4_000,
        vatMinor: 400,
        description: 'Rif. Arrivo merce 6 del 15/07/2026',
      },
      {
        ratePercent: 22,
        netMinor: 15_000,
        vatMinor: 3_300,
        description: 'Rif. Arrivo merce 6 del 15/07/2026, 8 del 15/07/2026',
      },
    ]);
  });

  it('usa il riferimento leggibile quando manca il numero', () => {
    const summary = buildPurchaseInvoiceVatSummary([
      receipt({
        number: null,
        reference: 'ARR-2026-0009',
        documentDate: new Date('2026-05-26T00:00:00.000Z'),
        lines: [
          { lineTotalMinor: 1_000, lineVatTotalMinor: 220, vatSnapshot: { ratePercent: 22 } },
        ],
      }),
    ]);
    expect(summary[0]?.description).toBe('Rif. Arrivo merce ARR-2026-0009 del 26/05/2026');
  });
});
