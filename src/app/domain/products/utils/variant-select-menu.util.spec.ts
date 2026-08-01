import { describe, expect, it } from 'vitest';

import { toVariantSelectMenuOptions } from './variant-select-menu.util';

describe('toVariantSelectMenuOptions', () => {
  it('separa titolo variante e SKU', () => {
    const options = toVariantSelectMenuOptions([
      {
        variantId: 'var-1',
        productId: 'prod-1',
        sku: 'MAG-M-ROSSO',
        articleCode: '00001',
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

  const variantWithCost = {
    variantId: 'var-2',
    productId: 'prod-2',
    sku: 'SKU-2',
    articleCode: '00002',
    productName: 'Polo',
    title: 'Polo — L',
    barcode: '8001234567890',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    purchasePrice: { amountMinor: 1200, currencyCode: 'EUR' },
  } as const;

  it('include barcode e costo acquisto con il permesso costi', () => {
    const options = toVariantSelectMenuOptions([variantWithCost], { canSeeCosts: true });

    expect(options[0]?.detail).toContain('SKU-2');
    expect(options[0]?.detail).toContain('8001234567890');
    expect(options[0]?.detail).toContain('Costo');
  });

  // Dato sensibile (§permessi): il costo d'acquisto non deve raggiungere chi
  // non ha "Visualizza costi d'acquisto", nemmeno dentro il selettore articolo.
  it('nasconde il costo acquisto senza il permesso costi', () => {
    const options = toVariantSelectMenuOptions([variantWithCost], { canSeeCosts: false });

    expect(options[0]?.detail).toContain('SKU-2');
    expect(options[0]?.detail).toContain('8001234567890');
    expect(options[0]?.detail).not.toContain('Costo');
    expect(options[0]?.detail).not.toContain('12,00');
  });

  // Fail-safe: un nuovo punto d'uso che dimentica il flag non espone il costo.
  it('omette il costo se il chiamante non dichiara il permesso', () => {
    const options = toVariantSelectMenuOptions([variantWithCost]);

    expect(options[0]?.detail).not.toContain('Costo');
  });
});
