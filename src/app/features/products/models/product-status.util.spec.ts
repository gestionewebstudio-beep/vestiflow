import { describe, expect, it } from 'vitest';

import { ProductStatus } from '@core/models/product.model';

import { productStatusLabel, productStatusTone } from './product-status.util';

describe('product-status.util', () => {
  it('fornisce label per ogni stato prodotto', () => {
    expect(productStatusLabel(ProductStatus.Active)).toBe('Attivo');
    expect(productStatusLabel(ProductStatus.Draft)).toBe('Bozza');
    expect(productStatusLabel(ProductStatus.Archived)).toBe('Archiviato');
  });

  it('fornisce tono badge per ogni stato prodotto', () => {
    expect(productStatusTone(ProductStatus.Active)).toBe('success');
    expect(productStatusTone(ProductStatus.Draft)).toBe('neutral');
    expect(productStatusTone(ProductStatus.Archived)).toBe('warning');
  });
});
