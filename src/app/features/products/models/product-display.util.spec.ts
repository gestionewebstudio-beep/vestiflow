import { describe, expect, it } from 'vitest';

import { CatalogOrigin } from '@core/models/catalog-origin.model';

import { productDisplayCategory, productDisplayCategoryShort } from './product-display.util';

const baseProduct = {
  id: 'p1',
  tenantId: 't1',
  name: 'Giacca',
  status: 'active' as const,
  catalogOrigin: CatalogOrigin.VestiFlow,
  options: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('product-display.util', () => {
  describe('productDisplayCategory', () => {
    it('preferisce taxonomy Shopify completa', () => {
      expect(
        productDisplayCategory({
          ...baseProduct,
          shopifyTaxonomyCategoryFullName: 'Abbigliamento > Uomo > Giacche',
          category: 'Giacche',
        }),
      ).toBe('Abbigliamento > Uomo > Giacche');
    });

    it('fallback su product_type e trattino se assente', () => {
      expect(productDisplayCategory({ ...baseProduct, category: '  Cappotti  ' })).toBe('Cappotti');
      expect(productDisplayCategory(baseProduct)).toBe('—');
    });
  });

  describe('productDisplayCategoryShort', () => {
    it('estrae foglia taxonomy', () => {
      expect(
        productDisplayCategoryShort({
          ...baseProduct,
          shopifyTaxonomyCategoryFullName: 'Abbigliamento > Uomo > Giacche',
        }),
      ).toBe('Giacche');
    });

    it('fallback su category o trattino', () => {
      expect(productDisplayCategoryShort({ ...baseProduct, category: 'Maglieria' })).toBe(
        'Maglieria',
      );
      expect(productDisplayCategoryShort(baseProduct)).toBe('—');
    });
  });
});
