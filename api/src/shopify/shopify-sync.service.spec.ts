import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { OnlineOrderLifecycleService } from '../order-reservations/online-order-lifecycle.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import type { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import type { ShopifyProductPullService } from './shopify-product-pull.service';
import type { ShopifyOrderDocumentService } from './shopify-order-document.service';
import { ShopifySyncService } from './shopify-sync.service';

describe('ShopifySyncService', () => {
  function createService() {
    const prisma = {
      customer: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
      party: {
        create: vi.fn().mockResolvedValue({ id: 'party-new' }),
        update: vi.fn().mockResolvedValue({}),
      },
      salesOrder: {
        findFirst: vi.fn(),
      },
      productVariant: {
        findFirst: vi.fn(),
      },
      location: {
        findFirst: vi.fn(),
      },
      inventoryLevel: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      stockMovement: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });

    const shopifyConnection = {
      touchSync: vi.fn().mockResolvedValue(undefined),
    };

    const shopifyProductPull = {
      importProductFromWebhook: vi.fn().mockResolvedValue(undefined),
    };

    const shopifyOrderDocument = {
      syncFromShopifyOrder: vi.fn().mockResolvedValue(null),
    };

    const onlineOrderLifecycle = {
      handle: vi.fn().mockResolvedValue('applied'),
    };

    const inventoryReconciliation = {
      reconcileFromShopifyWebhook: vi.fn().mockResolvedValue('skipped'),
    };

    const inventoryPush = {
      pushLevel: vi.fn().mockResolvedValue({ pushed: true }),
    };

    const service = new ShopifySyncService(
      prisma as unknown as PrismaService,
      shopifyConnection as unknown as ShopifyConnectionService,
      shopifyProductPull as unknown as ShopifyProductPullService,
      shopifyOrderDocument as unknown as ShopifyOrderDocumentService,
      onlineOrderLifecycle as unknown as OnlineOrderLifecycleService,
      inventoryReconciliation as unknown as ShopifyInventoryReconciliationService,
      inventoryPush as unknown as ShopifyInventoryPushService,
    );

    return {
      service,
      prisma,
      shopifyConnection,
      shopifyProductPull,
      shopifyOrderDocument,
      onlineOrderLifecycle,
      inventoryReconciliation,
      inventoryPush,
    };
  }

  it('handleWebhook ignora topic sconosciuto', async () => {
    const { service, shopifyConnection } = createService();

    await service.handleWebhook('tenant-1', 'shop/redact', { id: 1 });

    expect(shopifyConnection.touchSync).not.toHaveBeenCalled();
  });

  it('handleWebhook importa prodotto e aggiorna lastSync', async () => {
    const { service, shopifyConnection, shopifyProductPull } = createService();

    await service.handleWebhook('tenant-1', 'products/update', { id: 999 });

    expect(shopifyProductPull.importProductFromWebhook).toHaveBeenCalledWith('tenant-1', {
      id: 999,
    });
    expect(shopifyConnection.touchSync).toHaveBeenCalledWith('tenant-1');
  });

  it('applyCustomerFromShopify crea cliente con id Shopify', async () => {
    const { service, prisma } = createService();
    prisma.customer.findUnique.mockResolvedValue(null);

    const result = await service.applyCustomerFromShopify('tenant-1', {
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@example.com',
    });

    expect(result).toBe('created');
    expect(prisma.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'Mario',
          lastName: 'Rossi',
          email: 'mario@example.com',
        }),
      }),
    );
    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopifyCustomerId: 'gid://shopify/Customer/42',
          partyId: 'party-new',
        }),
      }),
    );
  });

  it('applyCustomerFromShopify salta payload senza id', async () => {
    const { service, prisma } = createService();

    const result = await service.applyCustomerFromShopify('tenant-1', { email: 'x@y.com' });

    expect(result).toBe('skipped');
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.party.create).not.toHaveBeenCalled();
  });

  it('applyInventoryLevelFromShopify delega alla riconciliazione senza modificare giacenze', async () => {
    const { service, inventoryReconciliation, inventoryPush } = createService();
    inventoryReconciliation.reconcileFromShopifyWebhook.mockResolvedValue('reconciled');

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      7,
      'Sync inventario Shopify',
    );

    expect(result).toBe('unchanged');
    expect(inventoryReconciliation.reconcileFromShopifyWebhook).toHaveBeenCalledWith(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      7,
    );
    expect(inventoryPush.pushLevel).not.toHaveBeenCalled();
  });

  it('applyInventoryLevelFromShopify Caso D: ripubblica valore VestiFlow', async () => {
    const { service, prisma, inventoryReconciliation, inventoryPush } = createService();
    inventoryReconciliation.reconcileFromShopifyWebhook.mockResolvedValue('mismatch_republish');
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      3,
      'Sync inventario Shopify',
    );

    expect(result).toBe('updated');
    await Promise.resolve();
    expect(inventoryPush.pushLevel).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-1');
  });

  it('applyInventoryLevelFromShopify restituisce skipped se riconciliazione differita', async () => {
    const { service, inventoryReconciliation } = createService();
    inventoryReconciliation.reconcileFromShopifyWebhook.mockResolvedValue('deferred');

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      5,
      'Sync inventario Shopify',
    );

    expect(result).toBe('skipped');
  });

  it('applyOrderFromShopify salta payload senza id ordine', async () => {
    const { service, prisma } = createService();

    const result = await service.applyOrderFromShopify('tenant-1', { email: 'buyer@example.com' });

    expect(result).toBe('skipped');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
