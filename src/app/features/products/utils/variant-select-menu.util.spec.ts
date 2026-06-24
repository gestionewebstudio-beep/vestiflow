import { describe, expect, it } from 'vitest';

import { toVariantSelectMenuOptions } from './variant-select-menu.util';

describe('toVariantSelectMenuOptions', () => {
  it('separa titolo variante e SKU', () => {
    const options = toVariantSelectMenuOptions([
      {
        variantId: 'var-1',
        productId: 'prod-1',
        sku: 'MAG-M-ROSSO',
        productName: 'Maglietta',
        title: 'Maglietta — M / Rosso',
        sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
      },
    ]);

    expect(options[0]).toEqual({
      value: 'var-1',
      label: 'Maglietta — M / Rosso',
      detail: 'MAG-M-ROSSO',
    });
  });
});
