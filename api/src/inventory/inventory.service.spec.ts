import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { RetailScanAction } from './dto/register-retail-scan.dto';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const tenantId = 'tenant-1';
  const ownerUser = testOwnerUser();

  function createRetailScanPrismaMock(options?: {
    channelProfile?: string;
    variant?: {
      id: string;
      productId: string;
      sku: string;
      product: { id: string; name: string };
    } | null;
    availableBefore?: number;
    availableAfter?: number;
    locationFound?: boolean;
  }) {
    const movement = {
      id: 'mov-retail',
      type: StockMovementType.sale,
    };
    const tx = {
      productVariant: { findFirst: vi.fn() },
      location: {
        findFirst: vi.fn().mockResolvedValue(options?.locationFound === false ? null : { id: 'loc-1' }),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({
          id: 'lvl-1',
          available: options?.availableBefore ?? 5,
          onHand: options?.availableBefore ?? 5,
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: (options?.availableBefore ?? 5) >= 1 ? 1 : 0 }),
        findUnique: vi.fn().mockResolvedValue({ available: options?.availableBefore ?? 5 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(movement),
      },
    };
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          channelProfile: options?.channelProfile ?? 'gestionale',
        }),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(
          options?.variant === null
            ? null
            : (options?.variant ?? {
                id: 'var-1',
                productId: 'prod-1',
                sku: 'SKU-1',
                product: { id: 'prod-1', name: 'Maglietta' },
              }),
        ),
      },
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue({
          available: options?.availableAfter ?? 4,
        }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    return { prisma, tx, movement };
  }

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
    expect(result.items).toEqual(items);
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

  it('registerMovement persiste scarico con giacenza sufficiente', async () => {
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
      where: { tenantId, variantId: 'var-1', locationId: 'loc-1', available: { gte: 3 } },
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
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ available: 1 }),
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
        },
        'Tester',
        'user-1',
        ownerUser,
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

  it('registerRetailScan crea movimento vendita con origine vestiflow_pos', async () => {
    const { prisma, tx, movement } = createRetailScanPrismaMock();
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerRetailScan(
      tenantId,
      { code: '8001234567890', locationId: 'loc-1', action: RetailScanAction.Sale },
      'Commesso',
      'user-1',
      ownerUser,
    );

    expect(result.movement).toEqual(movement);
    expect(result.productName).toBe('Maglietta');
    expect(result.remainingAvailable).toBe(4);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.sale,
          origin: 'vestiflow_pos',
          quantity: 1,
          reason: 'Vendita negozio',
        }),
      }),
    );
  });

  it('registerRetailScan canale online crea movimento con origine vestiflow_online', async () => {
    const { prisma, tx } = createRetailScanPrismaMock();
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    await service.registerRetailScan(
      tenantId,
      { code: '8001234567890', locationId: 'loc-1', action: RetailScanAction.Sale },
      'Commesso',
      'user-1',
      ownerUser,
      'online',
    );

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.sale,
          origin: 'vestiflow_online',
          reason: 'Vendita online',
        }),
      }),
    );
  });

  it('registerRetailScan canale online accetta tenant Shopify', async () => {
    const { prisma, tx } = createRetailScanPrismaMock({ channelProfile: 'shopify' });
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    await service.registerRetailScan(
      tenantId,
      { code: '8001234567890', locationId: 'loc-1', action: RetailScanAction.Sale },
      'Commesso',
      'user-1',
      ownerUser,
      'online',
    );

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.sale,
          origin: 'vestiflow_online',
          reason: 'Vendita online esterna',
        }),
      }),
    );
  });

  it('registerRetailScan crea movimento reso con origine vestiflow_pos', async () => {
    const returnMovement = { id: 'mov-return', type: StockMovementType.return };
    const { prisma, tx } = createRetailScanPrismaMock({ availableAfter: 6 });
    tx.stockMovement.create.mockResolvedValue(returnMovement);
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerRetailScan(
      tenantId,
      { code: 'SKU-1', locationId: 'loc-1', action: RetailScanAction.Return },
      'Commesso',
      'user-1',
      ownerUser,
    );

    expect(result.movement).toEqual(returnMovement);
    expect(result.remainingAvailable).toBe(6);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.return,
          origin: 'vestiflow_pos',
          reason: 'Storno negozio (reso)',
        }),
      }),
    );
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { onHand: { increment: 1 }, available: { increment: 1 } },
      }),
    );
  });

  it('registerRetailScan accetta tenant Shopify e sincronizza inventario canale', async () => {
    const { prisma, movement } = createRetailScanPrismaMock({ channelProfile: 'shopify' });
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerRetailScan(
      tenantId,
      { code: 'SKU-1', locationId: 'loc-1', action: RetailScanAction.Sale },
      'Commesso',
      'user-1',
      ownerUser,
    );

    expect(result.movement).toEqual(movement);
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
  });

  it('registerRetailScan accetta tenant TikTok Shop e sincronizza inventario canale', async () => {
    const { prisma, movement } = createRetailScanPrismaMock({ channelProfile: 'tiktok_shop' });
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    const result = await service.registerRetailScan(
      tenantId,
      { code: 'SKU-1', locationId: 'loc-1', action: RetailScanAction.Sale },
      'Commesso',
      'user-1',
      ownerUser,
    );

    expect(result.movement).toEqual(movement);
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
  });

  it('registerRetailScan rifiuta codice vuoto', async () => {
    const { prisma } = createRetailScanPrismaMock();
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerRetailScan(
        tenantId,
        { code: '   ', locationId: 'loc-1', action: RetailScanAction.Sale },
        'Commesso',
      'user-1',
      ownerUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registerRetailScan rifiuta variante sconosciuta', async () => {
    const { prisma } = createRetailScanPrismaMock({ variant: null });
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerRetailScan(
        tenantId,
        { code: 'UNKNOWN', locationId: 'loc-1', action: RetailScanAction.Sale },
        'Commesso',
      'user-1',
      ownerUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registerRetailScan rifiuta vendita con giacenza insufficiente', async () => {
    const { prisma, tx } = createRetailScanPrismaMock({ availableBefore: 0 });
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerRetailScan(
        tenantId,
        { code: 'SKU-1', locationId: 'loc-1', action: RetailScanAction.Sale },
        'Commesso',
      'user-1',
      ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('registerRetailScan rifiuta location inesistente', async () => {
    const { prisma, tx } = createRetailScanPrismaMock({ locationFound: false });
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.registerRetailScan(
        tenantId,
        { code: 'SKU-1', locationId: 'loc-missing', action: RetailScanAction.Sale },
        'Commesso',
      'user-1',
      ownerUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
