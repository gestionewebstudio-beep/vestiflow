import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';

describe('ShopifyTaxonomyLocalizationService', () => {
  let service: ShopifyTaxonomyLocalizationService;

  beforeEach(() => {
    service = new ShopifyTaxonomyLocalizationService();
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/attributes.txt')) {
        return {
          ok: true,
          text: async () => 'gid://shopify/TaxonomyAttribute/1 : Tessuto\n',
        } as Response;
      }
      return { ok: true, text: async () => '' } as Response;
    });
  });

  it('localizeProductCategoryMetafieldsSync traduce i nomi attributo in italiano', async () => {
    await service.prepareAttributes();

    const result = service.localizeProductCategoryMetafieldsSync({
      shopifyCategoryMetafields: [
        {
          attributeId: 'gid://shopify/TaxonomyAttribute/1',
          attributeName: 'Fabric',
          namespace: 'shopify',
          key: 'fabric',
          metafieldType: 'list.product_taxonomy_value_reference',
          values: [{ id: 'gid://shopify/TaxonomyValue/9', name: 'Canvas' }],
        },
      ],
    });

    expect(result.shopifyCategoryMetafields).toEqual([
      expect.objectContaining({
        attributeName: 'Tessuto',
        values: [{ id: 'gid://shopify/TaxonomyValue/9', name: 'Canvas' }],
      }),
    ]);
  });
});
