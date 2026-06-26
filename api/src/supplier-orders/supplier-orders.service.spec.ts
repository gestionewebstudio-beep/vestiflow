import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { SupplierOrdersService } from './supplier-orders.service';

describe('SupplierOrdersService', () => {
  const tenantId = 'tenant-1';

  function createPrismaMock() {
    return {
      supplier: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      location: { findFirst: vi.fn() },
      productVariant: { findMany: vi.fn() },
      supplierOrder: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      supplierOrderLine: {
        update: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      inventoryLevel: {
        upsert: vi.fn(),
        update: vi.fn(),
      },
      stockMovement: { create: vi.fn() },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  it('listSuppliers ordina per nome', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findMany.mockResolvedValue([{ id: 'sup-1', name: 'Alpha' }]);
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.listSuppliers(tenantId)).resolves.toEqual([
      { id: 'sup-1', name: 'Alpha' },
    ]);
  });

  it('createSupplier persiste dati normalizzati', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.create.mockResolvedValue({ id: 'sup-new', name: 'Fornitore' });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await service.createSupplier(tenantId, { name: '  Fornitore  ' });

    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Fornitore' }),
      }),
    );
  });

  it('list pagina ordini fornitore', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findMany.mockResolvedValue([{ id: 'po-1', _count: { lines: 2 } }]);
    prisma.supplierOrder.count.mockResolvedValue(1);
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    const result = await service.list(tenantId, { page: 1, pageSize: 10, search: 'PO' });

    expect(result.total).toBe(1);
  });

  it('create rifiuta fornitore inesistente', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue(null);
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.create(tenantId, {
        supplierId: 'missing',
        destinationLocationId: 'loc-1',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create persiste ordine fornitore con righe', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore Alpha' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1', sku: 'SKU-1' }]);
    prisma.supplierOrder.count.mockResolvedValue(0);
    prisma.supplierOrder.create.mockResolvedValue({
      id: 'po-new',
      reference: 'PO-2026-0001',
      lines: [{ id: 'line-1', sku: 'SKU-1' }],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        destinationLocationId: 'loc-1',
        lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
      }),
    ).resolves.toMatchObject({ id: 'po-new', reference: 'PO-2026-0001' });
  });

  it('getById restituisce ordine con righe', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      lines: [],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.getById(tenantId, 'po-1')).resolves.toMatchObject({ id: 'po-1' });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue(null);
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('send passa ordine da bozza a inviato', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      lines: [],
    });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.sent,
      lines: [],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.send(tenantId, 'po-1')).resolves.toMatchObject({
      status: SupplierOrderStatus.sent,
    });
  });

  it('send rifiuta ordine non in bozza', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.sent,
      lines: [],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.send(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('receive rifiuta quantità superiore al residuo', async () => {
    const order = {
      id: 'po-1',
      reference: 'PO-2026-0001',
      status: SupplierOrderStatus.sent,
      destinationLocationId: 'loc-1',
      lines: [
        {
          id: 'line-1',
          sku: 'SKU-1',
          variantId: 'var-1',
          orderedQuantity: 10,
          receivedQuantity: 8,
        },
      ],
    };
    const tx = {
      supplierOrder: {
        findFirst: vi.fn().mockResolvedValue(order),
        update: vi.fn(),
      },
      supplierOrderLine: { update: vi.fn(), findMany: vi.fn() },
      inventoryLevel: { upsert: vi.fn(), update: vi.fn() },
      stockMovement: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.receive(tenantId, 'po-1', { lines: [{ lineId: 'line-1', quantity: 5 }] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('receive registra carico e aggiorna stato ordine', async () => {
    const order = {
      id: 'po-1',
      reference: 'PO-2026-0001',
      status: SupplierOrderStatus.sent,
      destinationLocationId: 'loc-1',
      lines: [
        {
          id: 'line-1',
          sku: 'SKU-1',
          variantId: 'var-1',
          orderedQuantity: 10,
          receivedQuantity: 0,
        },
      ],
    };
    const updatedOrder = {
      ...order,
      status: SupplierOrderStatus.received,
      lines: [{ ...order.lines[0], receivedQuantity: 2 }],
    };
    const tx = {
      supplierOrder: {
        findFirst: vi.fn().mockResolvedValue(order),
        update: vi.fn().mockResolvedValue(updatedOrder),
      },
      supplierOrderLine: {
        update: vi.fn().mockResolvedValue({}),
        findMany: vi
          .fn()
          .mockResolvedValue([{ ...order.lines[0], receivedQuantity: 2, orderedQuantity: 10 }]),
      },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({ id: 'lvl-1', onHand: 0, available: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };
    const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );

    await expect(
      service.receive(tenantId, 'po-1', { lines: [{ lineId: 'line-1', quantity: 2 }] }),
    ).resolves.toMatchObject({ status: SupplierOrderStatus.received });
    expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
  });

  it('create rifiuta stato iniziale non valido', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1', sku: 'SKU-1' }]);
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        destinationLocationId: 'loc-1',
        status: SupplierOrderStatus.received,
        lines: [{ variantId: 'var-1', orderedQuantity: 1, unitCostMinor: 100 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('update sostituisce righe su bozza', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      supplierId: 'sup-1',
      destinationLocationId: 'loc-1',
      currency: 'EUR',
      expectedAt: null,
      lines: [],
    });
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1', sku: 'SKU-1' }]);
    prisma.supplierOrderLine.deleteMany.mockResolvedValue({ count: 1 });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      lines: [{ id: 'line-1' }],
    });
    prisma.$transaction.mockImplementation(async (fn: (client: unknown) => unknown) => {
      const tx = {
        supplierOrderLine: { deleteMany: prisma.supplierOrderLine.deleteMany },
        supplierOrder: { update: prisma.supplierOrder.update },
      };
      return fn(tx);
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(
      service.update(tenantId, 'po-1', {
        lines: [{ variantId: 'var-1', orderedQuantity: 3, unitCostMinor: 500 }],
      }),
    ).resolves.toMatchObject({ id: 'po-1' });
  });

  it('cancel annulla bozza o inviato', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.sent,
      lines: [],
    });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.cancelled,
      lines: [],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.cancel(tenantId, 'po-1')).resolves.toMatchObject({
      status: SupplierOrderStatus.cancelled,
    });
  });

  it('delete rimuove solo ordini annullati', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.cancelled,
      lines: [],
    });
    prisma.supplierOrder.delete.mockResolvedValue({ id: 'po-1' });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.delete(tenantId, 'po-1')).resolves.toBeUndefined();
    expect(prisma.supplierOrder.delete).toHaveBeenCalledWith({ where: { id: 'po-1' } });
  });

  it('delete rifiuta ordini non annullati', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.sent,
      lines: [],
    });
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );

    await expect(service.delete(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
