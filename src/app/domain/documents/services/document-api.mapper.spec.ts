import { describe, expect, it } from 'vitest';

import { mapDocumentApiRow, type DocumentApiRow } from './document-api.mapper';

/**
 * Il ponte del costo digitato: `DocumentLine.enteredUnitCost` è
 * `NUMERIC(16,6)` **in euro**, il modello Angular lo vuole in unità minori.
 * La conversione è un ×100 e può lasciare una coda — che è esattamente ciò che
 * la migration `20260822170412_purchase_costs_six_decimals` serve a conservare.
 */
function documentoConCosto(enteredUnitCost: string | number | null): DocumentApiRow {
  return {
    id: 'doc-1',
    tenantId: 'tenant-1',
    type: 'goods_receipt',
    status: 'draft',
    series: 'CAR',
    year: 2026,
    documentDate: '2026-08-22',
    currency: 'EUR',
    subtotalMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
    pricesIncludeVat: false,
    createdByName: 'Prova',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    lines: [
      {
        id: 'riga-1',
        lineNumber: 1,
        description: 'Articolo di prova',
        quantity: 1,
        unitPriceMinor: 2049.1803,
        discountPercent: 0,
        lineTotalMinor: 2049,
        loadsStock: true,
        enteredUnitCost,
      },
    ],
  };
}

describe('mapDocumentApiRow — coda decimale del costo digitato', () => {
  it('conserva la coda di un costo nato da uno scorporo IVA', () => {
    // 25,00 ivati al 22% valgono 2049,1803 centesimi netti, cioè 20,491803 EUR
    // in colonna. Con `Math.round` tornavano 2049, e il costo rimostrato ivato
    // diventava 24,99.
    const riga = mapDocumentApiRow(documentoConCosto('20.491803')).lines?.[0];

    expect(riga?.enteredUnitCostMinor).toBe(2049.1803);
  });

  it('riduce la coda a quello che il contratto conserva, non oltre', () => {
    // Quattro cifre di centesimo: la quinta è rumore del float, non precisione.
    const riga = mapDocumentApiRow(documentoConCosto('20.49180328')).lines?.[0];

    expect(riga?.enteredUnitCostMinor).toBe(2049.1803);
  });

  it('lascia intatto un costo senza coda', () => {
    const riga = mapDocumentApiRow(documentoConCosto('84.00')).lines?.[0];

    expect(riga?.enteredUnitCostMinor).toBe(8400);
  });

  it('distingue il costo assente dallo zero digitato', () => {
    const assente = mapDocumentApiRow(documentoConCosto(null)).lines?.[0];
    const zero = mapDocumentApiRow(documentoConCosto('0.000000')).lines?.[0];

    expect(assente?.enteredUnitCostMinor).toBeUndefined();
    expect(zero?.enteredUnitCostMinor).toBe(0);
  });
});
