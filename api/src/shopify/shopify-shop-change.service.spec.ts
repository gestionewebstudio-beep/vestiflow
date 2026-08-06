import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ShopifyShopChangeService } from './shopify-shop-change.service';

describe('ShopifyShopChangeService', () => {
  const tenantId = 'tenant-1';

  function createLocationMocks() {
    const shopifyLocation = {
      id: 'loc-shopify',
      name: 'Shop location',
      addressLine1: '123 Main St',
      shopifyLocationId: 'gid://shopify/Location/1',
      shopifyLastSyncAt: new Date('2026-01-01'),
      code: 'LOC-02',
    };
    const orphanLocation = {
      id: 'loc-orphan',
      name: 'Orphan',
      addressLine1: '456 Side St',
      shopifyLocationId: null,
      shopifyLastSyncAt: null,
      code: 'LOC-03',
    };

    return {
      shopifyLocation,
      orphanLocation,
      findMany: vi.fn().mockResolvedValue([shopifyLocation, orphanLocation]),
      delete: vi.fn().mockResolvedValue({ id: 'loc-shopify' }),
      update: vi.fn().mockResolvedValue({ id: 'loc-shopify' }),
    };
  }

  function createService() {
    const location = createLocationMocks();

    const prisma = {
      shopifyCredential: {
        findUnique: vi.fn().mockResolvedValue({ shopDomain: 'old.myshopify.com' }),
      },
      shopifyConnection: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([{ id: 'var-1' }]),
        count: vi.fn().mockResolvedValue(1),
      },
      product: {
        count: vi.fn().mockResolvedValue(2),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      customer: {
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      salesOrder: {
        count: vi.fn().mockResolvedValue(4),
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      inventoryLevel: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      stockMovement: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 6 }),
      },
      inventoryCountLine: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryCountSession: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      supplierOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue({ name: 'Negozio test' }),
      },
      location,
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          productVariant: {
            findMany: vi.fn().mockResolvedValue([{ id: 'var-1' }]),
          },
          inventoryCountLine: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
          stockMovement: {
            deleteMany: vi.fn().mockResolvedValue({ count: 6 }),
            count: vi.fn().mockResolvedValue(0),
          },
          inventoryLevel: {
            deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
            count: vi.fn().mockResolvedValue(0),
          },
          product: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
          salesOrder: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
          customer: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
          location: {
            findMany: location.findMany,
            delete: location.delete,
            update: location.update,
          },
          inventoryCountSession: {
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          supplierOrder: {
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          store: {
            findFirst: vi.fn().mockResolvedValue({ name: 'Negozio test' }),
          },
        }),
      ),
    };

    const service = new ShopifyShopChangeService(prisma as unknown as PrismaService);
    return { service, prisma, location };
  }

  it('preview restituisce conteggi e blockers', async () => {
    const { service } = createService();

    const preview = await service.preview(tenantId);

    expect(preview.currentShopDomain).toBe('old.myshopify.com');
    expect(preview.counts.shopifyProducts).toBe(2);
    expect(preview.counts.shopifyLinkedLocations).toBe(1);
    expect(preview.counts.removableShopifyLocations).toBe(2);
    expect(preview.blockers).toEqual([]);
  });

  it('purge richiede dominio corrispondente', async () => {
    const { service } = createService();

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'other.myshopify.com',
        purgeCatalog: true,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('purge elimina dati selezionati e location Shopify vuote', async () => {
    const { service, location } = createService();

    const result = await service.purge(tenantId, {
      confirmShopDomain: 'old.myshopify.com',
      purgeCatalog: true,
      purgeCustomers: true,
      purgeOrders: true,
    });

    expect(result.purged.products).toBe(2);
    expect(result.purged.customers).toBe(3);
    expect(result.purged.salesOrders).toBe(4);
    expect(result.purged.locations).toBe(2);
    expect(location.delete).toHaveBeenCalledTimes(2);
  });

  it('purge blocca se manca connessione', async () => {
    const { service, prisma } = createService();
    prisma.shopifyCredential.findUnique.mockResolvedValue(null);
    prisma.shopifyConnection.findUnique.mockResolvedValue(null);

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: true,
        purgeCustomers: false,
        purgeOrders: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preview segnala ordini fornitore aperti', async () => {
    const { service, prisma } = createService();
    prisma.supplierOrder.findMany.mockResolvedValue([
      { id: 'po-1', reference: 'OF-2026-0001' },
    ]);

    const preview = await service.preview(tenantId);

    expect(preview.blockers).toHaveLength(1);
    expect(preview.blockers[0]?.code).toBe('supplier_orders_open');
    expect(preview.blockers[0]?.references[0]?.reference).toBe('OF-2026-0001');
    expect(prisma.supplierOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [SupplierOrderStatus.confirmed],
          },
        }),
      }),
    );
  });

  it('purge mappa vincoli FK Prisma in 422', async () => {
    const { service, prisma } = createService();
    const fkError = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: 'test',
    });
    prisma.$transaction.mockRejectedValue(fkError);

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: true,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
