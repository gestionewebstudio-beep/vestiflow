import { describe, expect, it } from 'vitest';

import { isShopifyCategoryMetafieldMultiValue } from './shopify-category-metafield.util';

describe('isShopifyCategoryMetafieldMultiValue', () => {
  it('restituisce true per tipi list.*', () => {
    expect(isShopifyCategoryMetafieldMultiValue('list.product_taxonomy_value_reference')).toBe(
      true,
    );
    expect(isShopifyCategoryMetafieldMultiValue('list.metaobject_reference')).toBe(true);
  });

  it('restituisce false per tipi singoli', () => {
    expect(isShopifyCategoryMetafieldMultiValue('product_taxonomy_value_reference')).toBe(false);
    expect(isShopifyCategoryMetafieldMultiValue('metaobject_reference')).toBe(false);
  });
});
