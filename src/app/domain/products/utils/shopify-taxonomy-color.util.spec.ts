import { describe, expect, it } from 'vitest';

import {
  findShopifyColorCategoryMetafield,
  isShopifyColorCategoryAttribute,
  shopifyTaxonomyColorSwatch,
} from './shopify-taxonomy-color.util';

describe('shopify-taxonomy-color.util', () => {
  describe('isShopifyColorCategoryAttribute', () => {
    it('riconosce color/colore per key o name', () => {
      expect(isShopifyColorCategoryAttribute({ key: 'color', name: 'Colore' })).toBe(true);
      expect(isShopifyColorCategoryAttribute({ key: 'size', name: 'Taglia' })).toBe(false);
    });
  });

  describe('findShopifyColorCategoryMetafield', () => {
    it('trova il metafield colore con valori concatenati', () => {
      const result = findShopifyColorCategoryMetafield([
        {
          key: 'size',
          attributeName: 'Taglia',
          values: [{ name: 'M' }],
        },
        {
          key: 'color',
          attributeName: 'Colore',
          values: [{ name: 'Rosso' }, { name: 'Blu' }],
        },
      ]);

      expect(result).toEqual({ attributeName: 'Colore', valueLabel: 'Rosso, Blu' });
    });

    it('ritorna null se nessun attributo colore valorizzato', () => {
      expect(findShopifyColorCategoryMetafield([])).toBeNull();
    });
  });

  describe('shopifyTaxonomyColorSwatch', () => {
    it('mappa nomi EN e IT a CSS', () => {
      expect(shopifyTaxonomyColorSwatch('Red')).toBe('#ff0000');
      expect(shopifyTaxonomyColorSwatch('Rosso')).toBe('#ff0000');
      expect(shopifyTaxonomyColorSwatch('Multicolor')).toContain('conic-gradient');
    });

    it('ritorna undefined per colori sconosciuti', () => {
      expect(shopifyTaxonomyColorSwatch('')).toBeUndefined();
      expect(shopifyTaxonomyColorSwatch('ColoreCustom')).toBeUndefined();
    });
  });
});
