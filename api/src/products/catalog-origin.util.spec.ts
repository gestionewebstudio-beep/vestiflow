import { ConflictException } from '@nestjs/common';
import { CatalogOrigin, ShopifyCatalogLinkKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  assertShopifyCatalogDeleteAllowed,
  assertShopifyCatalogUpdateAllowed,
  hasLocalCatalogMedia,
  isVestiflowCatalogOwner,
  resolveCatalogOriginForShopifyImport,
  resolveShopifyCatalogLinkKindForImport,
  shouldSkipShopifyCatalogImport,
  SHOPIFY_CATALOG_LOCKED_MESSAGE,
} from './catalog-origin.util';
import type { UpdateProductDto } from './dto/update-product.dto';

const createdAt = new Date('2026-01-10T10:00:00.000Z');
const syncedAtCreate = new Date('2026-01-10T10:00:02.000Z');
const syncedAfterPush = new Date('2026-01-10T10:05:00.000Z');

const existing = {
  catalogOrigin: CatalogOrigin.shopify,
  name: 'Giacca',
  description: 'Desc',
  brand: 'Brand',
  category: 'Outerwear',
  shopifyTaxonomyCategoryId: null,
  shopifyTaxonomyCategoryFullName: null,
  shopifyCategoryMetafields: [],
  tiktokCategoryId: null,
  season: 'FW25',
  tags: ['donna'],
  status: 'active',
  options: [{ name: 'Taglia', values: ['M'] }],
  variants: [
    {
      id: 'var-1',
      sku: 'SKU-1',
      optionValues: [{ name: 'Taglia', value: 'M' }],
      barcode: null,
      currency: 'EUR',
      sellingPriceMinor: 5000,
      compareAtPriceMinor: null,
      purchasePriceMinor: 2000,
    },
  ],
};

describe('catalog-origin.util', () => {
  it('consente update operativo su prodotto Shopify-owned', () => {
    const dto: UpdateProductDto = {
      season: 'SS26',
      variants: [
        {
          id: 'var-1',
          sku: 'SKU-1',
          optionValues: [{ name: 'Taglia', value: 'M' }],
          sellingPrice: { amountMinor: 5000, currency: 'EUR' },
          purchasePrice: { amountMinor: 2500, currency: 'EUR' },
        },
      ],
    };

    expect(() => assertShopifyCatalogUpdateAllowed(existing, dto)).not.toThrow();
  });

  it('rifiuta modifica titolo su prodotto Shopify-owned', () => {
    expect(() =>
      assertShopifyCatalogUpdateAllowed(existing, { name: 'Nuovo titolo' }),
    ).toThrow(ConflictException);
    expect(() =>
      assertShopifyCatalogUpdateAllowed(existing, { name: 'Nuovo titolo' }),
    ).toThrow(SHOPIFY_CATALOG_LOCKED_MESSAGE);
  });

  it('rifiuta eliminazione prodotto Shopify-owned', () => {
    expect(() => assertShopifyCatalogDeleteAllowed(CatalogOrigin.shopify)).toThrow(
      ConflictException,
    );
  });

  it('consente mutazioni su prodotto VestiFlow-owned', () => {
    expect(() =>
      assertShopifyCatalogUpdateAllowed(
        { ...existing, catalogOrigin: CatalogOrigin.vestiflow },
        { name: 'Nuovo titolo' },
      ),
    ).not.toThrow();
  });

  it('rileva media locale nel catalogo', () => {
    expect(hasLocalCatalogMedia([{ storagePath: null }])).toBe(false);
    expect(hasLocalCatalogMedia([{ storagePath: 'tenant/p1/a.jpg' }])).toBe(true);
  });

  it('considera owner VestiFlow prodotti pushati dal gestionale', () => {
    const snapshot = {
      catalogOrigin: CatalogOrigin.vestiflow,
      shopifyProductId: '123',
      shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
      createdAt,
      shopifyLastSyncAt: syncedAtCreate,
      images: [{ storagePath: null }],
    };
    expect(isVestiflowCatalogOwner(snapshot)).toBe(true);
    expect(shouldSkipShopifyCatalogImport(snapshot)).toBe(true);
  });

  it('considera owner VestiFlow prodotti con upload locali collegati a Shopify', () => {
    const snapshot = {
      catalogOrigin: CatalogOrigin.vestiflow,
      shopifyProductId: '123',
      shopifyCatalogLinkKind: null,
      createdAt,
      shopifyLastSyncAt: syncedAtCreate,
      images: [{ storagePath: 'tenant/p1/a.jpg' }],
    };
    expect(isVestiflowCatalogOwner(snapshot)).toBe(true);
    expect(shouldSkipShopifyCatalogImport(snapshot)).toBe(true);
  });

  it('promuove import legacy Shopify collegati alla create', () => {
    const snapshot = {
      catalogOrigin: CatalogOrigin.vestiflow,
      shopifyProductId: '123',
      shopifyCatalogLinkKind: null,
      createdAt,
      shopifyLastSyncAt: syncedAtCreate,
      images: [{ storagePath: null }],
    };
    expect(isVestiflowCatalogOwner(snapshot)).toBe(false);
    expect(shouldSkipShopifyCatalogImport(snapshot)).toBe(false);
    expect(resolveCatalogOriginForShopifyImport(snapshot)).toBe(CatalogOrigin.shopify);
    expect(resolveShopifyCatalogLinkKindForImport(snapshot)).toBe(ShopifyCatalogLinkKind.imported);
  });

  it('mantiene owner VestiFlow se push Shopify arriva dopo la create', () => {
    const snapshot = {
      catalogOrigin: CatalogOrigin.vestiflow,
      shopifyProductId: '123',
      shopifyCatalogLinkKind: null,
      createdAt,
      shopifyLastSyncAt: syncedAfterPush,
      images: [{ storagePath: null }],
    };
    expect(isVestiflowCatalogOwner(snapshot)).toBe(true);
  });
});
