import { MovementOrigin, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyProductPullService } from './shopify-product-pull.service';
import type { ShopifyOrderDocumentService } from './shopify-order-document.service';
import { ShopifySyncService } from './shopify-sync.service';

describe('ShopifySyncService', () => {
  function createService() {
    const prisma = {
      customer: {
        findUnique: vi.fn(),
        upsert: vi.fn().mockResolvedValue({}),
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

    const shopifyConnection = {
      touchSync: vi.fn().mockResolvedValue(undefined),
    };

    const shopifyProductPull = {
      importProductFromWebhook: vi.fn().mockResolvedValue(undefined),
    };

    const shopifyOrderDocument = {
      syncFromShopifyOrder: vi.fn().mockResolvedValue(null),
    };

    const service = new ShopifySyncService(
      prisma as unknown as PrismaService,
      shopifyConnection as unknown as ShopifyConnectionService,
      shopifyProductPull as unknown as ShopifyProductPullService,
      shopifyOrderDocument as unknown as ShopifyOrderDocumentService,
    );

    return { service, prisma, shopifyConnection, shopifyProductPull, shopifyOrderDocument };
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
    expect(prisma.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shopifyCustomerId: 'gid://shopify/Customer/42',
          firstName: 'Mario',
          lastName: 'Rossi',
        }),
      }),
    );
  });

  it('applyCustomerFromShopify salta payload senza id', async () => {
    const { service, prisma } = createService();

    const result = await service.applyCustomerFromShopify('tenant-1', { email: 'x@y.com' });

    expect(result).toBe('skipped');
    expect(prisma.customer.upsert).not.toHaveBeenCalled();
  });

  it('applyInventoryLevelFromShopify salta se mapping mancante', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue(null);
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      10,
      'Sync inventario Shopify',
    );

    expect(result).toBe('skipped');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applyInventoryLevelFromShopify crea livello e movimento shopify', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const tx = {
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      5,
      'Sync inventario Shopify',
    );

    expect(result).toBe('created');
    expect(tx.inventoryLevel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          available: 5,
          onHand: 5,
        }),
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.return,
          origin: MovementOrigin.shopify,
          quantity: 5,
        }),
      }),
    );
  });

  it('applyInventoryLevelFromShopify allinea livello esistente con update atomico', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const tx = {
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 10, onHand: 10 }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      4,
      'Sync inventario Shopify',
    );

    expect(result).toBe('updated');
    // Update atomico via SQL parametrizzato (no read-modify-write su onHand).
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.sale,
          origin: MovementOrigin.shopify,
          quantity: 6,
        }),
      }),
    );
  });

  it('applyInventoryLevelFromShopify restituisce unchanged se quantità uguale', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });

    const tx = {
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 8, onHand: 8 }),
        update: vi.fn(),
      },
      stockMovement: {
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));

    const result = await service.applyInventoryLevelFromShopify(
      'tenant-1',
      'inv-1',
      'shop-loc-1',
      8,
      'Sync inventario Shopify',
    );

    expect(result).toBe('unchanged');
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('applyOrderFromShopify salta payload senza id ordine', async () => {
    const { service, prisma } = createService();

    const result = await service.applyOrderFromShopify('tenant-1', { email: 'buyer@example.com' });

    expect(result).toBe('skipped');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
