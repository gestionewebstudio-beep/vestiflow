import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '../models/variant-summary.model';
import { findVariantSummaryById, mergeVariantSummaries } from './variant-summary-search.util';

function variant(id: string, sku = `SKU-${id}`): VariantSummary {
  return {
    variantId: id,
    productId: `prod-${id}`,
    sku,
    articleCode: `A-${id}`,
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

describe('findVariantSummaryById', () => {
  const pinnata = { variantId: 'var-1', sku: 'SKU-1' } as VariantSummary;
  const cercata = { variantId: 'var-2', sku: 'SKU-2' } as VariantSummary;

  it('senza variantId restituisce null', () => {
    expect(findVariantSummaryById(null, [pinnata], [cercata])).toBeNull();
    expect(findVariantSummaryById(undefined, [pinnata], [cercata])).toBeNull();
    expect(findVariantSummaryById('', [pinnata], [cercata])).toBeNull();
  });

  it('trova fra le varianti già selezionate', () => {
    expect(findVariantSummaryById('var-1', [pinnata], [cercata])).toBe(pinnata);
  });

  it('trova fra i risultati di ricerca', () => {
    expect(findVariantSummaryById('var-2', [pinnata], [cercata])).toBe(cercata);
  });

  it('variante sconosciuta: null, non undefined', () => {
    expect(findVariantSummaryById('var-ignota', [pinnata], [cercata])).toBeNull();
  });

  it('a parità di id vince il risultato di ricerca, più fresco', () => {
    const vecchia = { variantId: 'var-1', sku: 'VECCHIO' } as VariantSummary;
    const nuova = { variantId: 'var-1', sku: 'NUOVO' } as VariantSummary;

    expect(findVariantSummaryById('var-1', [vecchia], [nuova])?.sku).toBe('NUOVO');
  });
});
