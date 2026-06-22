import { UnprocessableEntityException } from '@nestjs/common';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const tenantId = 'tenant-1';

  function createPrismaMock() {
    return {
      location: { findMany: vi.fn() },
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

  it('listLevels pagina risultati con filtri opzionali', async () => {
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
      search: 'SKU',
      lowStockOnly: true,
    } as never);

    expect(result).toEqual({ items, total: 1, page: 1, pageSize: 10 });
    expect(prisma.inventoryLevel.findMany).toHaveBeenCalled();
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
    expect(result.items).toEqual(items);
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
        } as never,
        'Tester',
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
        update: vi.fn().mockResolvedValue({}),
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
      } as never,
      'Mario Rossi',
    );

    expect(result).toEqual(movement);
    expect(tx.inventoryLevel.update).toHaveBeenCalledWith({
      where: { id: 'lvl-1' },
      data: { onHand: 7, available: 7 },
    });
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
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
        } as never,
        'Tester',
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
        } as never,
        'Tester',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovement rifiuta scarico con giacenza insufficiente', async () => {
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', available: 1, onHand: 1 }),
        update: vi.fn(),
      },
      stockMovement: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerMovement(
        tenantId,
        {
          type: StockMovementType.unload,
          variantId: 'var-1',
          locationId: 'loc-1',
          quantity: 5,
        } as never,
        'Tester',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
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
        update: vi.fn().mockResolvedValue({}),
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
      } as never,
      'Mario Rossi',
    );

    expect(result).toEqual(movement);
    expect(tx.inventoryLevel.update).toHaveBeenCalledTimes(2);
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
        update: vi.fn().mockResolvedValue({}),
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
        } as never,
        'Tester',
      ),
    ).resolves.toEqual(movement);
  });
});
