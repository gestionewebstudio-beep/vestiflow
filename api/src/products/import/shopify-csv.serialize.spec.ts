import { ProductStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildImportPreview } from './shopify-csv.mapper';
import { parseShopifyProductCsv } from './shopify-csv.parse';
import {
  escapeCsvField,
  serializeProductsToShopifyCsv,
  type ProductExportRecord,
} from './shopify-csv.serialize';

describe('escapeCsvField', () => {
  it('quota campi con virgola o newline', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('serializeProductsToShopifyCsv', () => {
  it('serializza prodotti con varianti e immagini', () => {
    const csv = serializeProductsToShopifyCsv([
      makeRecord({
        name: 'Maglietta Demo',
        description: 'Cotone morbido',
        brand: 'Brand X',
        category: 'Maglieria',
        tags: ['estate'],
        status: ProductStatus.active,
        options: [
          { name: 'Taglia', values: ['S', 'M'] },
          { name: 'Colore', values: ['Rosso'] },
        ],
        variants: [
          {
            sku: 'SKU-S',
            optionValues: [
              { name: 'Taglia', value: 'S' },
              { name: 'Colore', value: 'Rosso' },
            ],
            sellingPriceMinor: 2990,
            compareAtPriceMinor: 3990,
            barcode: '111',
          },
          {
            sku: 'SKU-M',
            optionValues: [
              { name: 'Taglia', value: 'M' },
              { name: 'Colore', value: 'Rosso' },
            ],
            sellingPriceMinor: 2990,
          },
        ],
        images: [{ url: 'https://example.com/a.jpg', altText: 'Fronte', sortOrder: 0 }],
      }),
    ]);

    expect(csv.startsWith('\uFEFFHandle,Title,Body (HTML)')).toBe(true);
    expect(csv).toContain('maglietta-demo');
    expect(csv).toContain('SKU-S');
    expect(csv).toContain('SKU-M');
    expect(csv).toContain('29.90');
    expect(csv).toContain('https://example.com/a.jpg');
  });

  it('è compatibile con il parser import (round-trip)', () => {
    const csv = serializeProductsToShopifyCsv([
      makeRecord({
        name: 'Pantalone Export',
        brand: 'Marino',
        category: 'Pantaloni',
        tags: ['SS26'],
        status: ProductStatus.draft,
        options: [{ name: 'Taglia', values: ['48', '50'] }],
        variants: [
          {
            sku: 'PNT-48',
            optionValues: [{ name: 'Taglia', value: '48' }],
            sellingPriceMinor: 5990,
          },
          {
            sku: 'PNT-50',
            optionValues: [{ name: 'Taglia', value: '50' }],
            sellingPriceMinor: 5990,
          },
        ],
        images: [],
      }),
    ]);

    const rows = parseShopifyProductCsv(csv.replace(/^\uFEFF/, ''));
    const preview = buildImportPreview(rows, new Set());

    expect(preview.summary.total).toBe(1);
    expect(preview.summary.ready).toBe(1);
    expect(preview.products[0]?.dto.name).toBe('Pantalone Export');
    expect(preview.products[0]?.dto.variants).toHaveLength(2);
  });
});

function makeRecord(input: {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  season?: string;
  tags?: string[];
  status?: ProductStatus;
  options: { name: string; values: string[] }[];
  variants: {
    sku: string;
    optionValues: { name: string; value: string }[];
    sellingPriceMinor: number;
    compareAtPriceMinor?: number;
    barcode?: string;
  }[];
  images: { url: string; altText?: string; sortOrder: number }[];
}): ProductExportRecord {
  const productId = '11111111-1111-1111-1111-111111111111';
  const tenantId = '22222222-2222-2222-2222-222222222222';

  return {
    product: {
      id: productId,
      tenantId,
      name: input.name,
      description: input.description ?? null,
      brand: input.brand ?? null,
      category: input.category ?? null,
      season: input.season ?? null,
      tags: input.tags ?? [],
      seoTitle: 'SEO title demo',
      seoDescription: 'SEO description demo',
      shopifyCollections: [],
      shopifyMetafields: [],
      status: input.status ?? ProductStatus.draft,
      options: input.options,
      shopifyProductId: null,
      shopifySyncStatus: 'not_connected',
      shopifyLastSyncAt: null,
      shopifyLastError: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      // Il serializzatore legge solo i campi valorizzati sopra: i nuovi campi
      // del modello (taxonomy, TikTok, IVA...) non servono al test.
    } as unknown as ProductExportRecord['product'],
    variants: input.variants.map((variant, index) => ({
      id: `33333333-3333-3333-3333-${String(index).padStart(12, '0')}`,
      tenantId,
      productId,
      sku: variant.sku,
      optionValues: variant.optionValues,
      barcode: variant.barcode ?? null,
      currency: 'EUR',
      sellingPriceMinor: variant.sellingPriceMinor,
      purchasePriceMinor: null,
      compareAtPriceMinor: variant.compareAtPriceMinor ?? null,
      shopifyVariantId: null,
      shopifyInventoryItemId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })) as unknown as ProductExportRecord['variants'],
    images: input.images.map((image, index) => ({
      id: `44444444-4444-4444-4444-${String(index).padStart(12, '0')}`,
      tenantId,
      productId,
      url: image.url,
      storagePath: null,
      altText: image.altText ?? null,
      sortOrder: image.sortOrder,
      shopifyImageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
  };
}
