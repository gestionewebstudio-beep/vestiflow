import { describe, expect, it } from 'vitest';

import {
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
      { vatCodeId: null, ratePercent: 10, netMinor: 10_000, vatMinor: 1_000 },
      { vatCodeId: null, ratePercent: 22, netMinor: 20_000, vatMinor: 4_400 },
    ]);
  });


  /**
   * ⭐ **Il raggruppamento è per CODICE IVA, non per aliquota.**
   *
   * ⛔ La chiave era la sola `ratePercent`, e due righe al 22% finivano nella
   * stessa quota anche quando una era ordinaria e l'altra in **inversione
   * contabile**. Sono due fatti fiscali diversi che si sommavano in uno.
   *
   * ⚠️ La conseguenza arriva sulla riga materializzata: includendo quell'arrivo
   * la Registrazione fattura riceveva UNA riga da 200,00 al 22%, e il reverse
   * charge spariva — con lui la Natura N6 e `vatAffectsSupplierTotal: false`,
   * cioè il fatto che quell'IVA **non è dovuta al fornitore**.
   */
  it('⭐ due righe alla stessa aliquota ma con CODICI diversi restano due quote', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 20_000,
      taxMinor: 4_400,
      lines: [
        {
          lineTotalMinor: 10_000,
          lineVatTotalMinor: 2_200,
          vatCodeId: 'vat-22',
          vatSnapshot: { ratePercent: 22 },
        },
        {
          lineTotalMinor: 10_000,
          lineVatTotalMinor: 2_200,
          vatCodeId: 'vat-22r',
          vatSnapshot: { ratePercent: 22 },
        },
      ],
    });

    expect(breakdown).toEqual([
      { vatCodeId: 'vat-22', ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 },
      { vatCodeId: 'vat-22r', ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 },
    ]);
  });

  it('⭐ due righe con lo STESSO codice si sommano, come prima', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 20_000,
      taxMinor: 4_400,
      lines: [
        {
          lineTotalMinor: 10_000,
          lineVatTotalMinor: 2_200,
          vatCodeId: 'vat-22',
          vatSnapshot: { ratePercent: 22 },
        },
        {
          lineTotalMinor: 10_000,
          lineVatTotalMinor: 2_200,
          vatCodeId: 'vat-22',
          vatSnapshot: { ratePercent: 22 },
        },
      ],
    });

    expect(breakdown).toEqual([
      { vatCodeId: 'vat-22', ratePercent: 22, netMinor: 20_000, vatMinor: 4_400 },
    ]);
  });

  it('⛔ e le righe STORICHE senza codice si raggruppano ancora per aliquota', () => {
    // ⚠️ Tutte le righe di arrivo salvate prima del Codice IVA hanno
    // `vat_code_id` NULL: se il raggruppamento le separasse una per una, un
    // arrivo vecchio con dieci righe al 22% produrrebbe dieci righe di fattura.
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 20_000,
      taxMinor: 4_400,
      lines: [
        { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
        { lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: { ratePercent: 22 } },
      ],
    });

    expect(breakdown).toEqual([
      { vatCodeId: null, ratePercent: 22, netMinor: 20_000, vatMinor: 4_400 },
    ]);
  });

  it('deriva l’aliquota dagli importi quando manca lo snapshot', () => {
    const breakdown = receiptVatBreakdown({
      subtotalMinor: 10_000,
      taxMinor: 2_200,
      lines: [{ lineTotalMinor: 10_000, lineVatTotalMinor: 2_200, vatSnapshot: null }],
    });
    expect(breakdown).toEqual([
      { vatCodeId: null, ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 },
    ]);
  });

  it('senza righe usa i totali documento come quota unica', () => {
    const breakdown = receiptVatBreakdown({ subtotalMinor: 5_000, taxMinor: 500, lines: [] });
    expect(breakdown).toEqual([
      { vatCodeId: null, ratePercent: 10, netMinor: 5_000, vatMinor: 500 },
    ]);
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
    expect(breakdown).toEqual([
      { vatCodeId: null, ratePercent: 22, netMinor: 10_000, vatMinor: 2_200 },
    ]);
  });
});

/**
 * ⛔ Qui c'era `describe('buildPurchaseInvoiceVatSummary')`, con due prove sul
 * riepilogo che il SERVER ricalcolava a ogni salvataggio.
 *
 * ⚠️ Quella funzione e' stata tolta il 25/08/2026 insieme al meccanismo che
 * serviva: le righe economiche sono una lista sola e tutte modificabili, e il
 * server le scrive come arrivano invece di rigenerarle. Le prove se ne vanno
 * con lei — inchiodavano un comportamento che non deve piu' esistere.
 */
