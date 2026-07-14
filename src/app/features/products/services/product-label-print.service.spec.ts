import { describe, expect, it } from 'vitest';

import type { ProductLabelViewModel } from '../models/product-label.model';

import { clampLabelCopies, expandLabelCopies } from './product-label-print.service';

const LABEL_A: ProductLabelViewModel = {
  variantId: 'v1',
  productName: 'Maglietta',
  brand: 'Brand',
  sku: 'SKU-1',
  barcode: '123456',
  sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
};

const LABEL_B: ProductLabelViewModel = {
  variantId: 'v2',
  productName: 'Pantalone',
  brand: 'Brand',
  sku: 'SKU-2',
  barcode: '654321',
  sellingPrice: { amountMinor: 4990, currencyCode: 'EUR' },
};

describe('clampLabelCopies', () => {
  it('lascia invariato un valore già nel range 1-500', () => {
    expect(clampLabelCopies(5)).toBe(5);
  });

  it('arrotonda per difetto un valore non intero', () => {
    expect(clampLabelCopies(3.9)).toBe(3);
  });

  it('impone almeno 1 copia (mai 0 o negativo)', () => {
    expect(clampLabelCopies(0)).toBe(1);
    expect(clampLabelCopies(-4)).toBe(1);
  });

  it('limita a 500 copie (limite foglio)', () => {
    expect(clampLabelCopies(10_000)).toBe(500);
  });
});

describe('expandLabelCopies', () => {
  it('caso particolare: un solo articolo con 1 copia resta invariato', () => {
    expect(expandLabelCopies([LABEL_A], 1)).toEqual([LABEL_A]);
  });

  it('ripete ogni etichetta della lista per il numero di copie richiesto', () => {
    const result = expandLabelCopies([LABEL_A, LABEL_B], 3);

    expect(result).toHaveLength(6);
    expect(result).toEqual([LABEL_A, LABEL_A, LABEL_A, LABEL_B, LABEL_B, LABEL_B]);
  });

  it('applica comunque il clamp (0 copie -> almeno 1)', () => {
    expect(expandLabelCopies([LABEL_A], 0)).toEqual([LABEL_A]);
  });

  it('lista vuota resta vuota indipendentemente dalle copie', () => {
    expect(expandLabelCopies([], 5)).toEqual([]);
  });
});
