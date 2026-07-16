import { describe, expect, it } from 'vitest';

import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';

describe('buildInventoryVariantSearchWhere', () => {
  it('include SKU, barcode, nome prodotto, codice articolo e codice fornitore', () => {
    expect(buildInventoryVariantSearchWhere('EAN123')).toEqual({
      OR: [
        { sku: { contains: 'EAN123', mode: 'insensitive' } },
        { barcode: { contains: 'EAN123', mode: 'insensitive' } },
        { product: { name: { contains: 'EAN123', mode: 'insensitive' } } },
        { product: { articleCode: { contains: 'EAN123', mode: 'insensitive' } } },
        {
          supplierLinks: {
            some: { supplierSku: { contains: 'EAN123', mode: 'insensitive' } },
          },
        },
      ],
    });
  });
});
