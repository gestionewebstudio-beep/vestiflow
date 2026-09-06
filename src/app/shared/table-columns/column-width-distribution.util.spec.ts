import { describe, expect, it } from 'vitest';

import { redistributeColumnWidths, type ColumnWidth } from './column-width-distribution.util';

const columns: readonly ColumnWidth[] = [
  { id: 'code', px: 100, minPx: 50 },
  { id: 'product', px: 300, minPx: 100 },
  { id: 'qty', px: 100, minPx: 50 },
  { id: 'total', px: 100, minPx: 50 },
];

const sum = (widths: ReadonlyMap<string, number>): number =>
  [...widths.values()].reduce((total, px) => total + px, 0);

describe('redistributeColumnWidths', () => {
  it('mantiene la somma invariata quando una colonna si allarga', () => {
    const next = redistributeColumnWidths(columns, 'product', 400);

    expect(next.get('product')).toBe(400);
    expect(sum(next)).toBeCloseTo(600, 6);
  });

  it('fa cedere spazio alle colonne di ENTRAMBI i lati', () => {
    const next = redistributeColumnWidths(columns, 'qty', 200);

    // 'code' e 'product' stanno a sinistra, 'total' a destra: si stringono tutte.
    expect(next.get('code')!).toBeLessThan(100);
    expect(next.get('product')!).toBeLessThan(300);
    expect(next.get('total')!).toBeLessThan(100);
    expect(sum(next)).toBeCloseTo(600, 6);
  });

  it('restituisce spazio alle altre quando una colonna si stringe', () => {
    const next = redistributeColumnWidths(columns, 'product', 200);

    expect(next.get('product')).toBe(200);
    expect(next.get('code')!).toBeGreaterThan(100);
    expect(next.get('total')!).toBeGreaterThan(100);
    expect(sum(next)).toBeCloseTo(600, 6);
  });

  it('non porta nessuna colonna sotto il proprio minimo', () => {
    const next = redistributeColumnWidths(columns, 'product', 10_000);

    for (const column of columns) {
      expect(next.get(column.id)!).toBeGreaterThanOrEqual(column.minPx - 1e-6);
    }
    // Al massimo la colonna prende tutto lo spazio oltre i minimi altrui.
    expect(next.get('product')).toBe(600 - (50 + 50 + 50));
    expect(sum(next)).toBeCloseTo(600, 6);
  });

  it('rispetta il minimo della colonna trascinata', () => {
    const next = redistributeColumnWidths(columns, 'product', 10);

    expect(next.get('product')).toBe(100);
    expect(sum(next)).toBeCloseTo(600, 6);
  });

  it('lascia tutto invariato quando lo spostamento è impercettibile', () => {
    const next = redistributeColumnWidths(columns, 'product', 300.2);

    expect([...next.entries()]).toEqual(columns.map((column) => [column.id, column.px]));
  });

  it('non fa nulla con una sola colonna', () => {
    const single: readonly ColumnWidth[] = [{ id: 'only', px: 100, minPx: 50 }];

    expect(redistributeColumnWidths(single, 'only', 400).get('only')).toBe(100);
  });
});
