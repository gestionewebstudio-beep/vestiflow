import { describe, expect, it } from 'vitest';

import {
  aggregateStockLines,
  buildRevisionSummary,
} from './document-stock-reconcile.util';

describe('document-stock-reconcile.util', () => {
  it('aggregateStockLines somma per variante ignorando righe non stock', () => {
    const map = aggregateStockLines([
      { variantId: 'v1', sku: 'A', quantity: 2, loadsStock: true },
      { variantId: 'v1', sku: 'A', quantity: 3, loadsStock: true },
      { variantId: 'v2', sku: 'B', quantity: 1, loadsStock: false },
      { variantId: null, sku: null, quantity: 10, loadsStock: true },
    ]);

    expect(map.size).toBe(1);
    expect(map.get('v1')).toEqual({ variantId: 'v1', sku: 'A', quantity: 5 });
  });

  it('buildRevisionSummary descrive modifica e annullamento', () => {
    expect(buildRevisionSummary(true, [{ sku: 'SKU-1', delta: 2 }])).toContain('SKU-1 +2');
    expect(buildRevisionSummary(false, [{ sku: 'SKU-1', delta: -3 }], true)).toContain(
      'annullato',
    );
  });
});
