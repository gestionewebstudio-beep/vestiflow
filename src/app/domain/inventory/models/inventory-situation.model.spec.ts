import { describe, expect, it } from 'vitest';

import { StockStatus } from '@core/models/inventory-level.model';

import { mapInventorySituationApiRow } from './inventory-situation.model';
import type { InventorySituationApiRow } from './inventory-situation.model';

function apiRow(overrides: Partial<InventorySituationApiRow> = {}): InventorySituationApiRow {
  return {
    variantId: 'var-1',
    productId: 'prod-1',
    title: 'Blazer — M',
    articleCode: '00001',
    sku: 'SKU-1',
    category: 'Giacche',
    supplierId: 'sup-1',
    supplierName: 'Manifattura Rossi',
    currency: 'EUR',
    sellingPriceMinor: 4900,
    purchasePriceMinor: 2000,
    available: 3,
    onHand: 4,
    committed: 1,
    incoming: 2,
    minThreshold: 5,
    totalIn: 10,
    totalOut: 7,
    stockStatus: StockStatus.Low,
    ...overrides,
  };
}

describe('mapInventorySituationApiRow', () => {
  it('mappa la riga API con Codice = cod. articolo', () => {
    const row = mapInventorySituationApiRow(apiRow());

    expect(row).toMatchObject({
      variantId: 'var-1',
      title: 'Blazer — M',
      code: '00001',
      sku: 'SKU-1',
      category: 'Giacche',
      supplierName: 'Manifattura Rossi',
      available: 3,
      onHand: 4,
      totalIn: 10,
      totalOut: 7,
      status: StockStatus.Low,
    });
  });

  it('senza cod. articolo ripiega sullo SKU; null normalizzati a stringa vuota', () => {
    const row = mapInventorySituationApiRow(
      apiRow({
        articleCode: '',
        sku: 'SKU-2',
        category: null,
        supplierId: null,
        supplierName: null,
        purchasePriceMinor: null,
      }),
    );

    expect(row.code).toBe('SKU-2');
    expect(row.category).toBe('');
    expect(row.supplierId).toBe('');
    expect(row.supplierName).toBe('');
    expect(row.purchasePriceMinor).toBeNull();
  });

  it('senza cod. articolo né SKU il codice resta vuoto', () => {
    const row = mapInventorySituationApiRow(apiRow({ articleCode: '', sku: null }));
    expect(row.code).toBe('');
    expect(row.sku).toBe('');
  });
});
