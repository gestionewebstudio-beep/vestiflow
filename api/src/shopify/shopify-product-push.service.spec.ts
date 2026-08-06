import { ProductStatus, ShopifyConnectionStatus, ShopifySyncStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ShopifyProductPushService } from './shopify-product-push.service';

/**
 * Punto di USCITA verso Shopify (§sei decimali): il prezzo memorizzato può
 * portare la coda decimale di uno scorporo IVA, il payload no. Qui si verifica
 * quello che parte davvero, non la funzione di conversione — quella ha il suo
 * test in `shopify-money.util.spec.ts`.
 */
describe('ShopifyProductPushService — prezzo nel payload', () => {
  function createService(shopifyPriceMinor: number) {
    const product = {
      id: 'prod-1',
      tenantId: 'tenant-1',
      name: 'Maglietta',
      description: null,
      status: ProductStatus.active,
      shopifySyncEnabled: true,
      shopifyProductId: null,
      brand: null,
      category: null,
      tags: [],
      options: [],
      compareAtPriceMinor: null,
      shopifyTaxonomyCategoryId: null,
      season: null,
      variants: [
        {
          id: 'var-1',
          sku: 'SKU-1',
          barcode: null,
          optionValues: [],
          shopifyPriceMinor,
          purchasePriceMinor: null,
          shopifyVariantId: null,
          shopifyInventoryItemId: null,
        },
      ],
      images: [],
    };

    const prisma = {
      shopifyConnection: {
        findUnique: vi.fn().mockResolvedValue({
          status: ShopifyConnectionStatus.connected,
          scopes: ['write_products'],
        }),
      },
      shopifyCredential: { findUnique: vi.fn().mockResolvedValue({ scopes: ['write_products'] }) },
      product: {
        findFirst: vi.fn().mockResolvedValue(product),
        findUnique: vi.fn().mockResolvedValue({ shopifySyncStatus: ShopifySyncStatus.synced }),
        update: vi.fn().mockResolvedValue(product),
      },
      productVariant: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      productImage: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    };

    const shopifyAdmin = {
      createProduct: vi.fn().mockResolvedValue({ id: 111, variants: [], images: [] }),
      updateProduct: vi.fn(),
      listProductMetafields: vi.fn().mockResolvedValue([]),
      upsertProductMetafield: vi.fn(),
      updateInventoryItemCost: vi.fn(),
      createProductImage: vi.fn(),
    };

    const service = new ShopifyProductPushService(
      prisma as unknown as PrismaService,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'shop.myshopify.com', accessToken: 'shpat_test' }),
      } as unknown as ShopifyOAuthService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      { markSynced: vi.fn(), markError: vi.fn() } as unknown as ShopifyConnectionService,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as unknown as ShopifyTaxonomyService,
      {
        buildMetafields: vi.fn().mockResolvedValue([]),
      } as unknown as ShopifyCategoryMetafieldsService,
    );

    return { service, shopifyAdmin };
  }

  function pushedPrice(payload: unknown): unknown {
    const product = (payload as { product?: Record<string, unknown> }).product ?? payload;
    const variants = (product as { variants?: Record<string, unknown>[] }).variants ?? [];
    return variants[0]?.['price'];
  }

  it('pubblica due decimali quando il netto porta la coda decimale', async () => {
    // 123,97 ivati al 22% valgono 10161,4754 centesimi netti.
    const { service, shopifyAdmin } = createService(10161.4754);

    await service.pushProduct('tenant-1', 'prod-1');

    const payload = shopifyAdmin.createProduct.mock.calls[0]?.[2];
    expect(pushedPrice(payload)).toBe('101.61');
  });

  it('un prezzo intero resta quello che era', async () => {
    const { service, shopifyAdmin } = createService(2990);

    await service.pushProduct('tenant-1', 'prod-1');

    const payload = shopifyAdmin.createProduct.mock.calls[0]?.[2];
    expect(pushedPrice(payload)).toBe('29.90');
  });
});
