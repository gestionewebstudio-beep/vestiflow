import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const tenantId = 'tenant-1';
  const ownerUser = testOwnerUser();

  function createPrismaMock() {
    return {
      location: {
        findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      productVariant: { findMany: vi.fn() },
      inventoryLevel: {
        findMany: vi.fn(),
        count: vi.fn(),
        fields: { minThreshold: 'minThreshold' },
      },
      stockMovement: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  it('listLocations filtra per tenant e ordina per nome', async () => {
    const prisma = createPrismaMock();
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1', name: 'Shop' }]);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const locations = await service.listLocations(tenantId);

    expect(locations).toEqual([{ id: 'loc-1', name: 'Shop' }]);
    expect(prisma.location.findMany).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  });

  it('listLevels senza locationId filtra solo sedi licenziate attive', async () => {
    const prisma = createPrismaMock();
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]);
    prisma.inventoryLevel.findMany.mockResolvedValue([]);
    prisma.inventoryLevel.count.mockResolvedValue(0);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await service.listLevels(tenantId, { page: 1, pageSize: 10 });

    expect(prisma.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          licensedInVf: true,
          isActive: true,
        }),
      }),
    );
    expect(prisma.inventoryLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          locationId: { in: ['loc-1', 'loc-2'] },
        }),
      }),
    );
  });

  it('listLevels con locationId non licenziata restituisce pagina vuota', async () => {
    const prisma = createPrismaMock();
    prisma.location.findFirst.mockResolvedValue(null);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.listLevels(tenantId, {
      page: 1,
      pageSize: 10,
      locationId: 'loc-unlicensed',
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
  });

  it('listLevels pagina risultati senza ricerca', async () => {
    const prisma = createPrismaMock();
    const items = [{ id: 'lvl-1', available: 3 }];
    prisma.inventoryLevel.findMany.mockResolvedValue(items);
    prisma.inventoryLevel.count.mockResolvedValue(1);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.listLevels(tenantId, {
      page: 1,
      pageSize: 10,
      locationId: 'loc-1',
      lowStockOnly: true,
    });

    expect(result).toEqual({ items, total: 1, page: 1, pageSize: 10 });
    expect(prisma.inventoryLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          locationId: 'loc-1',
        }),
      }),
    );
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
  });

  it('listLevels con ricerca include varianti senza riga giacenza (stock 0)', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'var-1',
        sku: 'SKU-1',
        product: { name: 'Maglietta' },
      },
    ]);
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1', name: 'Shop' }]);
    prisma.inventoryLevel.findMany.mockResolvedValue([]);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.listLevels(tenantId, {
      page: 1,
      pageSize: 10,
      search: 'SKU-1',
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'virtual:var-1:loc-1',
      variantId: 'var-1',
      locationId: 'loc-1',
      available: 0,
      onHand: 0,
      variant: { sku: 'SKU-1', product: { name: 'Maglietta' } },
      location: { name: 'Shop' },
    });
  });

  it('listLevels con ricerca usa filtro SKU, barcode e nome prodotto', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1', name: 'Shop' }]);
    prisma.inventoryLevel.findMany.mockResolvedValue([]);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await service.listLevels(tenantId, {
      page: 1,
      pageSize: 10,
      search: 'SKU',
    });

    expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { sku: { contains: 'SKU', mode: 'insensitive' } },
            { barcode: { contains: 'SKU', mode: 'insensitive' } },
            { product: { name: { contains: 'SKU', mode: 'insensitive' } } },
            {
              supplierLinks: {
                some: { supplierSku: { contains: 'SKU', mode: 'insensitive' } },
              },
            },
          ],
        }),
      }),
    );
  });

  it('listMovements applica filtri data e tipo', async () => {
    const prisma = createPrismaMock();
    const items = [{ id: 'mov-1' }];
    prisma.stockMovement.findMany.mockResolvedValue(items);
    prisma.stockMovement.count.mockResolvedValue(1);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.listMovements(tenantId, {
      page: 2,
      pageSize: 5,
      type: 'load',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    } as never);

    expect(result.page).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'mov-1',
        productTitle: null,
        documentReference: null,
      }),
    ]);
  });

  it('listMovements senza locationId filtra solo sedi licenziate attive', async () => {
    const prisma = createPrismaMock();
    prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.stockMovement.count.mockResolvedValue(0);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await service.listMovements(tenantId, { page: 1, pageSize: 10 });

    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          locationId: 'loc-1',
        }),
      }),
    );
  });

  it('registerMovement rifiuta rettifica senza motivo', async () => {
    const prisma = createPrismaMock();
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerMovement(
        tenantId,
        {
          type: StockMovementType.adjustment,
          variantId: 'var-1',
          locationId: 'loc-1',
          quantity: 1,
          direction: AdjustmentDirection.increase,
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovement persiste carico e aggiorna giacenza', async () => {
    const movement = { id: 'mov-1', type: StockMovementType.load };
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 5, onHand: 5 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(movement),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerMovement(
      tenantId,
      {
        type: StockMovementType.load,
        variantId: 'var-1',
        locationId: 'loc-1',
        quantity: 2,
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    expect(result).toEqual(movement);
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId: 'var-1', locationId: 'loc-1' },
      data: { onHand: { increment: 2 }, available: { increment: 2 } },
    });
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
  });

  it('registerMovement persiste scarico senza guardia di disponibilità (§3)', async () => {
    const movement = { id: 'mov-unload', type: StockMovementType.unload };
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 10, onHand: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(movement),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerMovement(
      tenantId,
      {
        type: StockMovementType.unload,
        variantId: 'var-1',
        locationId: 'loc-1',
        quantity: 3,
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    expect(result).toEqual(movement);
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId: 'var-1', locationId: 'loc-1' },
      data: { onHand: { increment: -3 }, available: { increment: -3 } },
    });
  });

  it('registerMovement rifiuta trasferimento senza destinazione', async () => {
    const prisma = createPrismaMock();
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerMovement(
        tenantId,
        {
          type: StockMovementType.transfer,
          variantId: 'var-1',
          locationId: 'loc-1',
          quantity: 1,
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovement rifiuta trasferimento con origine uguale a destinazione', async () => {
    const prisma = createPrismaMock();
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerMovement(
        tenantId,
        {
          type: StockMovementType.transfer,
          variantId: 'var-1',
          locationId: 'loc-1',
          targetLocationId: 'loc-1',
          quantity: 1,
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovement registra scarico oltre la disponibile (§3: saldi negativi ammessi, mai bloccare)', async () => {
    const movement = { id: 'mov-unload-neg', type: StockMovementType.unload };
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 1, onHand: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue(movement) },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerMovement(
      tenantId,
      {
        type: StockMovementType.unload,
        variantId: 'var-1',
        locationId: 'loc-1',
        quantity: 5,
      },
      'Tester',
      'user-1',
      ownerUser,
    );

    expect(result).toEqual(movement);
    // Nessuna condizione `available >= qty` nel where: lo scarico passa sempre.
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId: 'var-1', locationId: 'loc-1' },
      data: { onHand: { increment: -5 }, available: { increment: -5 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledOnce();
  });

  it('registerMovement persiste trasferimento tra location', async () => {
    const movement = { id: 'mov-transfer', type: StockMovementType.transfer };
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi
          .fn()
          .mockResolvedValueOnce({ id: 'lvl-src', available: 10, onHand: 10 })
          .mockResolvedValueOnce({ id: 'lvl-dst', available: 2, onHand: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(movement),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerMovement(
      tenantId,
      {
        type: StockMovementType.transfer,
        variantId: 'var-1',
        locationId: 'loc-1',
        targetLocationId: 'loc-2',
        quantity: 3,
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    expect(result).toEqual(movement);
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledTimes(2);
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', [
      'loc-1',
      'loc-2',
    ]);
  });

  it('registerMovement persiste rettifica con motivo', async () => {
    const movement = { id: 'mov-adj', type: StockMovementType.adjustment };
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 5, onHand: 5 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(movement),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      { pushInventoryLevels: vi.fn() } as unknown as ChannelSyncFacade,
    );

    await expect(
      service.registerMovement(
        tenantId,
        {
          type: StockMovementType.adjustment,
          variantId: 'var-1',
          locationId: 'loc-1',
          quantity: 2,
          direction: AdjustmentDirection.decrease,
          reason: 'Rottura imballo',
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).resolves.toEqual(movement);
  });
});
