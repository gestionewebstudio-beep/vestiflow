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

  it('include barcode e costo acquisto nel dettaglio', () => {
    const options = toVariantSelectMenuOptions([
      {
        variantId: 'var-2',
        productId: 'prod-2',
        sku: 'SKU-2',
        productName: 'Polo',
        title: 'Polo — L',
        barcode: '8001234567890',
        sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
        purchasePrice: { amountMinor: 1200, currencyCode: 'EUR' },
      },
    ]);

    expect(options[0]?.detail).toContain('SKU-2');
    expect(options[0]?.detail).toContain('8001234567890');
    expect(options[0]?.detail).toContain('Costo');
  });
});
