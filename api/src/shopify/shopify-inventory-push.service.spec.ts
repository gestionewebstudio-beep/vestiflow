import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

describe('ShopifyInventoryPushService', () => {
  function createService(options: {
    connection?: { status: ShopifyConnectionStatus; scopes: string[] } | null;
    variant?: Record<string, unknown> | null;
    location?: Record<string, unknown> | null;
    level?: { onHand: number; committed: number } | null;
    lastPushed?: number | null;
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
      level = { onHand: 10, committed: 3 },
      lastPushed = null,
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
      shopifyInventorySyncState: {
        findUnique: vi.fn().mockResolvedValue(
          lastPushed == null ? null : { lastPushedAvailable: lastPushed },
        ),
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

    const reconciliation = {
      recordSuccessfulPush: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ShopifyInventoryPushService(
      prisma as unknown as PrismaService,
      shopifyOAuth as unknown as ShopifyOAuthService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      shopifyConnection as unknown as ShopifyConnectionService,
      reconciliation as unknown as ShopifyInventoryReconciliationService,
    );

    return { service, prisma, shopifyOAuth, shopifyAdmin, shopifyConnection, reconciliation };
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

  it('pushLevel invia quantità pubblicabile max(0, onHand - committed) a Shopify available', async () => {
    const { service, shopifyAdmin, reconciliation } = createService();

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: true, publishableAvailable: 7 });
    expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
      'shop.myshopify.com',
      'shpat_test',
      'gid://shopify/InventoryItem/1',
      'gid://shopify/Location/1',
      7,
    );
    expect(reconciliation.recordSuccessfulPush).toHaveBeenCalledWith(
      'tenant-1',
      'var-1',
      'loc-1',
      7,
    );
  });

  it('pushLevel invia 0 quando Disponibile interna è negativa', async () => {
    const { service, shopifyAdmin } = createService({
      level: { onHand: 5, committed: 7 },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result.publishableAvailable).toBe(0);
    expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      0,
    );
  });

  it('pushLevel salta se valore pubblicabile invariato', async () => {
    const { service, shopifyAdmin } = createService({ lastPushed: 7 });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel restituisce shopify_error se Admin API fallisce', async () => {
    const { service, shopifyAdmin } = createService();
    shopifyAdmin.setInventoryAvailable.mockRejectedValue(new Error('429 rate limit'));

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
  });
});
