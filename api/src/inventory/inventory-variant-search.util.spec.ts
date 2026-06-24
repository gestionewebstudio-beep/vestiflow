import { describe, expect, it } from 'vitest';

import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';

describe('buildInventoryVariantSearchWhere', () => {
  it('include SKU, barcode e nome prodotto', () => {
    expect(buildInventoryVariantSearchWhere('EAN123')).toEqual({
      OR: [
        { sku: { contains: 'EAN123', mode: 'insensitive' } },
        { barcode: { contains: 'EAN123', mode: 'insensitive' } },
        { product: { name: { contains: 'EAN123', mode: 'insensitive' } } },
      ],
    });
  });
});
