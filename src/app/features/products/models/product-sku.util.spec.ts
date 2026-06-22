import { describe, expect, it } from 'vitest';

import { productCodeFromName, slugifySkuSegment, suggestVariantSku } from './product-sku.util';

describe('product-sku.util', () => {
  it('slugifySkuSegment rimuove accenti e caratteri non alfanumerici', () => {
    expect(slugifySkuSegment('Rosso fuoco')).toBe('ROSSOFUOCO');
    expect(slugifySkuSegment('Caffè')).toBe('CAFFE');
  });

  it('productCodeFromName usa slug completo se entro il limite', () => {
    expect(productCodeFromName('Maglietta')).toBe('MAGLIETTA');
  });

  it('productCodeFromName usa acronimo se lo slug supera 12 caratteri', () => {
    expect(productCodeFromName('Maglietta Basic')).toBe('MB');
  });

  it('productCodeFromName comprime nomi lunghi in acronimo', () => {
    const code = productCodeFromName('Giacca Impermeabile Autunnale Premium Collection');
    expect(code.length).toBeLessThanOrEqual(12);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('suggestVariantSku concatena codice prodotto e valori opzione', () => {
    expect(suggestVariantSku('Maglietta Basic', ['M', 'Rosso'])).toBe('MB-M-ROSSO');
  });

  it('suggestVariantSku salta segmenti vuoti', () => {
    expect(suggestVariantSku('Maglietta', ['', 'Rosso'])).toBe('MAGLIETTA-ROSSO');
  });
});
