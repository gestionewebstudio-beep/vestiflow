import { ConflictException } from '@nestjs/common';
import { CatalogOrigin, ShopifyCatalogLinkKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  assertShopifyCatalogDeleteAllowed,
  hasLocalCatalogMedia,
  isVestiflowCatalogOwner,
  resolveCatalogOriginForShopifyImport,
  resolveShopifyCatalogLinkKindForImport,
  shouldSkipShopifyCatalogImport,
} from './catalog-origin.util';

const createdAt = new Date('2026-01-10T10:00:00.000Z');
const syncedAtCreate = new Date('2026-01-10T10:00:02.000Z');
const syncedAfterPush = new Date('2026-01-10T10:05:00.000Z');

describe('catalog-origin.util', () => {
  it('rifiuta eliminazione prodotto Shopify-owned', () => {
    expect(() => assertShopifyCatalogDeleteAllowed(CatalogOrigin.shopify)).toThrow(
      ConflictException,
    );
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
