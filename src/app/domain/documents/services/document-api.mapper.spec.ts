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

/**
 * ⭐ **IL TRASPORTO DEGLI SNAPSHOT DI IDENTITÀ** — tranche 0A.2b.
 *
 * ⛔ È l'anello che può rompersi senza far rumore: le prove di componente
 * partono da un `DocumentRecord` già mappato, quindi un campo che il mapper
 * smette di copiare le lascerebbe tutte verdi — e la maschera tornerebbe a
 * mostrare la cella vuota, cioè metà del difetto che la tranche chiude.
 */
describe('mapDocumentApiRow — identità fotografata sulla riga', () => {
  function documentoConIdentita(riga: Record<string, unknown>): DocumentApiRow {
    return {
      id: 'doc-1',
      tenantId: 'tenant-1',
      type: 'sales_ddt',
      status: 'draft',
      series: 'DDT',
      year: 2026,
      documentDate: '2026-03-15',
      currency: 'EUR',
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      pricesIncludeVat: false,
      createdByName: 'Prova',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
      lines: [
        {
          id: 'riga-1',
          lineNumber: 1,
          description: 'Articolo di prova',
          quantity: 1,
          unitPriceMinor: 1000,
          discountPercent: 0,
          lineTotalMinor: 1000,
          loadsStock: true,
          ...riga,
        },
      ],
    };
  }

  it('⭐ porta codice articolo, nome prodotto e barcode fino al modello', () => {
    const doc = mapDocumentApiRow(
      documentoConIdentita({
        articleCode: 'ART-DI-ALLORA',
        productName: 'Maglia cotone — nome di allora',
        barcode: '8001111111111',
      }),
    );

    expect(doc.lines?.[0]).toMatchObject({
      articleCode: 'ART-DI-ALLORA',
      productName: 'Maglia cotone — nome di allora',
      barcode: '8001111111111',
    });
  });

  /*
    ⛔ **Assente resta assente.** Una riga salvata prima che le colonne
    esistessero non ha l'identità: il mapper non deve inventarla, e chi la
    legge deve poter distinguere «non c'è» da «è una stringa vuota».
  */
  it('⛔ riga senza identità: i tre campi restano assenti, non stringhe vuote', () => {
    const doc = mapDocumentApiRow(documentoConIdentita({}));

    const riga = doc.lines?.[0];
    expect(riga?.articleCode).toBeUndefined();
    expect(riga?.productName).toBeUndefined();
    expect(riga?.barcode).toBeUndefined();
  });
});
