import { describe, expect, it } from 'vitest';

import { CatalogOrigin } from '@core/models/catalog-origin.model';
import { ProductStatus } from '@core/models/product.model';

import { toProductLabelViewModels } from './product-label.mapper';

const product = {
  id: 'prod-1',
  tenantId: 'tenant-1',
  name: 'Maglietta Basic',
  brand: 'Brand X',
  status: ProductStatus.Active,
  catalogOrigin: CatalogOrigin.VestiFlow,
  options: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const variants = [
  {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-M',
    optionValues: [{ name: 'Taglia', value: 'M' }],
    sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
    compareAtPrice: { amountMinor: 3990, currencyCode: 'EUR' },
    barcode: '8001234567890',
  },
  {
    id: 'var-2',
    productId: 'prod-1',
    sku: 'SKU-L',
    optionValues: [{ name: 'Taglia', value: 'L' }],
    sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
    compareAtPrice: { amountMinor: 1990, currencyCode: 'EUR' },
    barcode: '',
  },
];

describe('toProductLabelViewModels', () => {
  it('mappa tutte le varianti se variantId non specificato', () => {
    const labels = toProductLabelViewModels(product, variants);
    expect(labels).toHaveLength(2);
    expect(labels[0]?.sku).toBe('SKU-M');
    expect(labels[0]?.compareAtPrice?.amountMinor).toBe(3990);
  });

  it('filtra per variantId singola', () => {
    const labels = toProductLabelViewModels(product, variants, 'var-2');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.sku).toBe('SKU-L');
  });

  it('esclude compareAtPrice se non valido rispetto al prezzo vendita', () => {
    const labels = toProductLabelViewModels(product, variants, 'var-2');
    expect(labels[0]?.compareAtPrice).toBeUndefined();
  });

  it('usa fallback brand se mancante', () => {
    const labels = toProductLabelViewModels({ ...product, brand: undefined }, variants, 'var-1');
    expect(labels[0]?.brand).toBe('Senza brand');
  });
});
