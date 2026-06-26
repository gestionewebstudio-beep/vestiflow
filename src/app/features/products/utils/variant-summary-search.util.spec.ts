import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '../models/variant-summary.model';
import { mergeVariantSummaries } from './variant-summary-search.util';

function variant(id: string, sku = `SKU-${id}`): VariantSummary {
  return {
    variantId: id,
    productId: `prod-${id}`,
    sku,
    productName: `Prodotto ${id}`,
    title: `Prodotto ${id} — ${sku}`,
    sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
  };
}

describe('mergeVariantSummaries', () => {
  it('unisce pinned e searched preservando entrambi', () => {
    const result = mergeVariantSummaries([variant('a')], [variant('b')]);

    expect(result.map((v) => v.variantId)).toEqual(['a', 'b']);
  });

  it('deduplica per variantId', () => {
    const result = mergeVariantSummaries([variant('a')], [variant('a'), variant('b')]);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.variantId).sort()).toEqual(['a', 'b']);
  });

  it('i risultati di ricerca sovrascrivono il pinned con stesso id (dati più freschi)', () => {
    const pinned = variant('a', 'OLD');
    const searched = variant('a', 'NEW');

    const result = mergeVariantSummaries([pinned], [searched]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sku).toBe('NEW');
  });

  it('gestisce liste vuote', () => {
    expect(mergeVariantSummaries([], [])).toEqual([]);
    expect(mergeVariantSummaries([variant('a')], [])).toHaveLength(1);
    expect(mergeVariantSummaries([], [variant('b')])).toHaveLength(1);
  });
});
