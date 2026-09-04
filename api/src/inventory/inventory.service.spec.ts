import { UnprocessableEntityException } from '@nestjs/common';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
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
      document: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      onlineSale: {
        findMany: vi.fn().mockResolvedValue([]),
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
    const items = [
      { id: 'lvl-1', available: 3, variant: { sku: 'SKU-1', product: { name: 'Maglietta' } } },
    ];
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

  it('listLevels con ricerca usa filtro SKU, barcode, nome prodotto e codice articolo', async () => {
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
            { product: { articleCode: { contains: 'SKU', mode: 'insensitive' } } },
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

    // ⛔ Il registro non pagina: `page`/`pageSize` in ingresso non decidono più
    // nulla, e la risposta descrive ciò che ha restituito — l'INTERO filtrato.
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ skip: expect.anything() }),
    );
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
    // Lo spareggio su `id`: senza, l'ordine fra movimenti dello stesso istante
    // è quello che capita, e due letture possono differire.
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'mov-1',
        productTitle: null,
        documentReference: null,
      }),
    ]);
  });

  it('listMovements ignora externalRef non UUID (es. GID Shopify) nel lookup documenti', async () => {
    const prisma = createPrismaMock();
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 'mov-shopify',
        externalRef: 'gid://shopify/Order/12345',
        sourceDocumentId: '22222222-2222-4222-8222-222222222222',
        sourceDocumentType: 'online_sale',
        variant: { product: { name: 'Maglietta' } },
      },
    ]);
    prisma.stockMovement.count.mockResolvedValue(1);
    prisma.onlineSale.findMany.mockResolvedValue([
      { id: '22222222-2222-4222-8222-222222222222', reference: 'VO-2026/00007' },
    ]);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.listMovements(tenantId, { page: 1, pageSize: 20 });

    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.onlineSale.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        id: { in: ['22222222-2222-4222-8222-222222222222'] },
      },
      select: { id: true, reference: true },
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        documentReference: 'VO-2026/00007',
        productTitle: 'Maglietta',
      }),
    );
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
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
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
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
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
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
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
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
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
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
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

  // ── registerMovementBatch (form Registra movimento multi-articolo) ────────

  function createBatchTx(currentOnHand = 6) {
    return {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-1' }),
        // Le varianti delle righe si leggono in blocco: una entry per id chiesto.
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({ id, sku: 'SKU-1' })),
          ),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ onHand: currentOnHand }),
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: 'mov-1' }),
      },
    };
  }

  function createBatchService(tx: ReturnType<typeof createBatchTx>) {
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );
    return { service, channelSync };
  }

  it('registerMovementBatch rettifica: delta dalla nuova giacenza, righe invariate saltate', async () => {
    const tx = createBatchTx(6);
    const { service } = createBatchService(tx);

    const result = await service.registerMovementBatch(
      tenantId,
      {
        type: StockMovementType.adjustment,
        locationId: 'loc-1',
        reason: 'Rettifica giacenza',
        lines: [
          { variantId: 'var-1', newOnHand: 4 },
          { variantId: 'var-1', newOnHand: 6 },
        ],
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    // 6 → 4: rettifica in diminuzione di 2; 6 → 6: nessun movimento.
    expect(result).toEqual({ created: 1 });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.adjustment,
          quantity: 2,
          direction: AdjustmentDirection.decrease,
          reason: 'Rettifica giacenza',
        }),
      }),
    );
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId: 'var-1', locationId: 'loc-1' },
      data: { onHand: { increment: -2 }, available: { increment: -2 } },
    });
  });

  /**
   * Invariante da NON ottimizzare: la giacenza va riletta a ogni riga, perché
   * ogni riga la muta. Con due rettifiche sulla stessa variante la seconda
   * deve partire dal valore lasciato dalla prima; leggendo tutte le giacenze
   * in blocco prima del ciclo la seconda riga userebbe un valore stale e il
   * risultato finale cambierebbe. Le VARIANTI invece si leggono in blocco:
   * quelle non cambiano durante il ciclo.
   */
  it('registerMovementBatch rettifica: rilegge la giacenza a ogni riga', async () => {
    const tx = createBatchTx(6);
    const { service } = createBatchService(tx);

    await service.registerMovementBatch(
      tenantId,
      {
        type: StockMovementType.adjustment,
        locationId: 'loc-1',
        reason: 'Rettifica giacenza',
        lines: [
          { variantId: 'var-1', newOnHand: 4 },
          { variantId: 'var-2', newOnHand: 9 },
        ],
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    expect(tx.inventoryLevel.findFirst).toHaveBeenCalledTimes(2);
    // Le varianti, al contrario, si leggono una volta sola per tutte le righe.
    expect(tx.productVariant.findMany).toHaveBeenCalledTimes(1);
  });

  it('registerMovementBatch trasferimento: destinazione uguale all’origine rifiutata', async () => {
    const tx = createBatchTx();
    const { service } = createBatchService(tx);

    await expect(
      service.registerMovementBatch(
        tenantId,
        {
          type: StockMovementType.transfer,
          locationId: 'loc-1',
          targetLocationId: 'loc-1',
          lines: [{ variantId: 'var-1', quantity: 1 }],
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovementBatch rettifica senza causale rifiutata', async () => {
    const tx = createBatchTx();
    const { service } = createBatchService(tx);

    await expect(
      service.registerMovementBatch(
        tenantId,
        {
          type: StockMovementType.adjustment,
          locationId: 'loc-1',
          lines: [{ variantId: 'var-1', newOnHand: 3 }],
        },
        'Tester',
        'user-1',
        ownerUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('registerMovementBatch carico: righe multiple con controparte e costo, push canali', async () => {
    const tx = createBatchTx();
    const { service, channelSync } = createBatchService(tx);

    const result = await service.registerMovementBatch(
      tenantId,
      {
        type: StockMovementType.load,
        operationDate: '2026-07-01',
        locationId: 'loc-1',
        reason: 'Acquisto merce',
        partyId: 'sup-1',
        partyName: 'Manifattura Rossi',
        lines: [
          { variantId: 'var-1', quantity: 2, unitAmountMinor: 900 },
          { variantId: 'var-1', quantity: 3 },
        ],
      },
      'Mario Rossi',
      'user-1',
      ownerUser,
    );

    expect(result).toEqual({ created: 2 });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.load,
          quantity: 2,
          partyId: 'sup-1',
          partyName: 'Manifattura Rossi',
          unitCostMinor: 900,
          createdAt: expect.any(Date),
        }),
      }),
    );
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
  });

  // ── Costi d'acquisto nei movimenti (catalog.view_purchase_costs) ──────────

  /**
   * Perché questo blocco esiste: `catalog.view_purchase_costs` non è una tenda
   * davanti al numero, è un filtro sulla RISPOSTA — il costo congelato sul
   * movimento non deve proprio uscire dall'API, altrimenti resta leggibile nel
   * traffico di rete a chiunque apra gli strumenti del browser, e il titolare
   * crede di averlo nascosto.
   *
   * Il ramo negato è quello che nessuno guarda: basta uno `spread` spostato di
   * posto, un campo di costo aggiunto alla riga o un `select` allargato perché
   * i costi ricompaiano, e senza questi test niente diventerebbe rosso — il
   * permesso smetterebbe di funzionare in silenzio.
   */
  describe('listMovements e i costi d’acquisto', () => {
    const COSTO_UNITARIO = 1250;
    const COSTO_TOTALE = 3750;

    function prismaConMovimentoCostoso() {
      const prisma = createPrismaMock();
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          id: 'mov-costoso',
          type: StockMovementType.load,
          quantity: 3,
          locationId: 'loc-1',
          unitCostMinor: COSTO_UNITARIO,
          totalCostMinor: COSTO_TOTALE,
          variant: { product: { name: 'Maglietta' } },
        },
      ]);
      prisma.stockMovement.count.mockResolvedValue(1);
      return prisma;
    }

    function serviceCon(prisma: ReturnType<typeof createPrismaMock>) {
      return new InventoryService(prisma as unknown as PrismaService, {} as ChannelSyncFacade);
    }

    // Sede assegnata esplicita: senza, lo scope del commesso si svuota e la
    // lista tornerebbe vuota per un motivo che col permesso non c'entra —
    // il test passerebbe senza aver provato nulla.
    const commessoSenzaCosti = testClerkUser({ assignedLocationIds: ['loc-1'] });
    const commessoConCosti = testClerkUser({
      assignedLocationIds: ['loc-1'],
      permissions: [...testClerkUser().permissions, TenantPermission.CatalogViewPurchaseCosts],
    });

    it('con il permesso i costi del movimento arrivano col valore vero', async () => {
      const prisma = prismaConMovimentoCostoso();

      const result = await serviceCon(prisma).listMovements(
        tenantId,
        { page: 1, pageSize: 20 },
        commessoConCosti,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: 'mov-costoso',
          unitCostMinor: COSTO_UNITARIO,
          totalCostMinor: COSTO_TOTALE,
        }),
      );
    });

    it('senza il permesso i costi non entrano nella risposta', async () => {
      const prisma = prismaConMovimentoCostoso();

      const result = await serviceCon(prisma).listMovements(
        tenantId,
        { page: 1, pageSize: 20 },
        commessoSenzaCosti,
      );

      // Il commesso vede la riga: quello che sparisce è il costo, non il movimento.
      expect(result.items).toHaveLength(1);
      const riga = result.items[0]!;
      // Le chiavi restano presenti e valgono ESATTAMENTE null (non 0, non
      // assenti): il client si aspetta la forma della riga, non il valore.
      expect(riga).toHaveProperty('unitCostMinor', null);
      expect(riga).toHaveProperty('totalCostMinor', null);
      // Il resto della riga sopravvive: la maschera è mirata, non una potatura.
      expect(riga).toEqual(
        expect.objectContaining({ id: 'mov-costoso', quantity: 3, productTitle: 'Maglietta' }),
      );
      // Rete di sicurezza contro un costo che riesce sotto un altro nome: i
      // due importi non devono comparire da nessuna parte nella risposta.
      const serializzata = JSON.stringify(result.items);
      expect(serializzata).not.toContain(String(COSTO_UNITARIO));
      expect(serializzata).not.toContain(String(COSTO_TOTALE));
    });

    it('il titolare vede i costi anche con l’elenco permessi vuoto', async () => {
      const prisma = prismaConMovimentoCostoso();
      // Il titolare non ha chiavi salvate: l'accesso pieno viene dal ruolo
      // (hasFullTenantAccess), non dall'array — è la regola che regge tutto.
      expect(ownerUser.permissions).toEqual([]);

      const result = await serviceCon(prisma).listMovements(
        tenantId,
        { page: 1, pageSize: 20 },
        ownerUser,
      );

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          unitCostMinor: COSTO_UNITARIO,
          totalCostMinor: COSTO_TOTALE,
        }),
      );
    });

    it('senza utente in contesto i costi restano fuori (default prudente)', async () => {
      const prisma = prismaConMovimentoCostoso();

      const result = await serviceCon(prisma).listMovements(tenantId, { page: 1, pageSize: 20 });

      expect(result.items[0]).toHaveProperty('unitCostMinor', null);
      expect(result.items[0]).toHaveProperty('totalCostMinor', null);
    });
  });

  /**
   * ⚠️ `articleCode` vive sul PRODOTTO. La destrutturazione `{ variant, ...movement }`
   * lo lasciava fuori dalla risposta pur selezionandolo nella query: la colonna
   * «Codice» del registro mostrava «—» su OGNI riga, e l'export una colonna vuota.
   *
   * ⛔ Nessun test lo copriva, ed è il genere di difetto che nessuno segnala: un
   * trattino si legge come «questo movimento non ha codice», non come «il campo si
   * è perso per strada».
   */
  it('⚠️ listMovements riporta articleCode dal prodotto, non lo perde nella destrutturazione', async () => {
    const prisma = createPrismaMock();
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 'mov-1',
        tenantId,
        type: StockMovementType.load,
        quantity: 3,
        sku: 'SKU-1',
        createdAt: new Date('2026-08-17T10:00:00.000Z'),
        variant: { product: { name: 'Maglia cotone', articleCode: 'ART-0042' } },
      },
    ]);
    prisma.stockMovement.count.mockResolvedValue(1);
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const page = await service.listMovements(
      tenantId,
      { page: 1, pageSize: 20 } as never,
      ownerUser,
    );

    expect(page.items[0]).toMatchObject({
      articleCode: 'ART-0042',
      productTitle: 'Maglia cotone',
    });
  });
});
