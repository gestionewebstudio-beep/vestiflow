import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

describe('ShopifyInventoryPushService', () => {
  function createService(options: {
    connection?: { status: ShopifyConnectionStatus; scopes: string[] } | null;
    variant?: Record<string, unknown> | null;
    location?: Record<string, unknown> | null;
    level?: { available: number } | null;
  } = {}) {
    const {
      connection = {
        status: ShopifyConnectionStatus.connected,
        scopes: ['read_inventory', 'write_inventory'],
      },
      variant = {
        id: 'var-1',
        sku: 'SKU-1',
        shopifyInventoryItemId: 'gid://shopify/InventoryItem/1',
        shopifyVariantId: 'gid://shopify/ProductVariant/1',
      },
      location = { shopifyLocationId: 'gid://shopify/Location/1', name: 'Napoli' },
      level = { available: 12 },
    } = options;

    const prisma = {
      shopifyConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(variant),
        update: vi.fn(),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue(location),
      },
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue(level),
      },
    };

    const shopifyOAuth = {
      getAccessToken: vi.fn().mockResolvedValue({
        shopDomain: 'shop.myshopify.com',
        accessToken: 'shpat_test',
      }),
    };

    const shopifyAdmin = {
      setInventoryAvailable: vi.fn().mockResolvedValue(undefined),
      getVariant: vi.fn(),
    };

    const shopifyConnection = {
      touchSync: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ShopifyInventoryPushService(
      prisma as unknown as PrismaService,
      shopifyOAuth as unknown as ShopifyOAuthService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      shopifyConnection as unknown as ShopifyConnectionService,
    );

    return { service, prisma, shopifyOAuth, shopifyAdmin, shopifyConnection };
  }

  it('pushLevel salta se Shopify non connesso', async () => {
    const { service, shopifyAdmin } = createService({ connection: null });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'not_connected' });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel salta se manca scope write_inventory', async () => {
    const { service, shopifyAdmin } = createService({
      connection: {
        status: ShopifyConnectionStatus.connected,
        scopes: ['read_inventory'],
      },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'missing_write_inventory_scope' });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel invia quantità disponibile a Shopify', async () => {
    const { service, shopifyAdmin, shopifyConnection } = createService();

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: true });
    expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
      'shop.myshopify.com',
      'shpat_test',
      'gid://shopify/InventoryItem/1',
      'gid://shopify/Location/1',
      12,
    );
    expect(shopifyConnection.touchSync).toHaveBeenCalledWith('tenant-1');
  });

  it('pushLevel restituisce shopify_error se Admin API fallisce', async () => {
    const { service, shopifyAdmin } = createService();
    shopifyAdmin.setInventoryAvailable.mockRejectedValue(new Error('429 rate limit'));

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
  });

  it('pushLevels deduplica location e propaga push per ciascuna', async () => {
    const { service, shopifyAdmin } = createService();
    const pushLevel = vi.spyOn(service, 'pushLevel').mockResolvedValue({ pushed: true });

    await service.pushLevels('tenant-1', 'var-1', ['loc-1', 'loc-1', 'loc-2']);

    expect(pushLevel).toHaveBeenCalledTimes(2);
    expect(pushLevel).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-1');
    expect(pushLevel).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-2');
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });
});
