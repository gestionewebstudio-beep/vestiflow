import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { SupplierOrdersService } from './supplier-orders.service';
import type { SuppliersService } from './suppliers.service';

describe('SupplierOrdersService', () => {
  const tenantId = 'tenant-1';

  function createSuppliersMock(): SuppliersService {
    return {
      listAll: vi.fn(),
      create: vi.fn(),
    } as unknown as SuppliersService;
  }

  function createService(prisma: ReturnType<typeof createPrismaMock>, suppliers = createSuppliersMock()) {
    return new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
      suppliers,
    );
  }

  function createPrismaMock() {
    const prisma = {
      supplier: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      location: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
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
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
      stockMovement: { create: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    return prisma;
  }

  it('listSuppliers delega SuppliersService', async () => {
    const prisma = createPrismaMock();
    const suppliers = {
      listAll: vi.fn().mockResolvedValue([{ id: 'sup-1', name: 'Alpha' }]),
      create: vi.fn(),
    } as unknown as SuppliersService;
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
      suppliers,
    );

    await expect(service.listSuppliers(tenantId)).resolves.toEqual([
      { id: 'sup-1', name: 'Alpha' },
    ]);
    expect(suppliers.listAll).toHaveBeenCalledWith(tenantId);
  });

  it('createSupplier delega SuppliersService', async () => {
    const prisma = createPrismaMock();
    const suppliers = {
      listAll: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'sup-new', name: 'Fornitore' }),
    } as unknown as SuppliersService;
    const service = new SupplierOrdersService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
      suppliers,
    );

    await service.createSupplier(tenantId, { name: '  Fornitore  ' });
    expect(suppliers.create).toHaveBeenCalledWith(tenantId, { name: '  Fornitore  ' });
  });

  it('list pagina ordini fornitore', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findMany.mockResolvedValue([{ id: 'po-1', _count: { lines: 2 } }]);
    prisma.supplierOrder.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = await service.list(tenantId, { page: 1, pageSize: 10, search: 'PO' });

    expect(result.total).toBe(1);
  });

  it('create rifiuta fornitore inesistente', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue(null);
    const service = createService(prisma);

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
    prisma.supplierOrder.findMany.mockResolvedValue([]);
    prisma.supplierOrder.create.mockResolvedValue({
      id: 'po-new',
      reference: 'PO-2026-0001',
      lines: [{ id: 'line-1', sku: 'SKU-1' }],
    });
    const service = createService(prisma);

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        destinationLocationId: 'loc-1',
        lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
      }),
    ).resolves.toMatchObject({ id: 'po-new', reference: 'PO-2026-0001' });
  });

  it('create genera un riferimento oltre il massimo esistente (nessuna collisione dopo eliminazione)', async () => {
    // Arrange: gli ordini 0001 e 0003 esistono (0002 eliminato). Un
    // numeratore basato sul conteggio (2 → 0003) collicerebbe con 0003 e
    // violerebbe @@unique([tenantId, reference]); il massimo + 1 → 0004.
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore Alpha' });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1', sku: 'SKU-1' }]);
    prisma.supplierOrder.findMany.mockResolvedValue([
      { reference: 'PO-2026-0001' },
      { reference: 'PO-2026-0003' },
    ]);
    prisma.supplierOrder.create.mockImplementation((args: { data: { reference: string } }) =>
      Promise.resolve({ id: 'po-new', reference: args.data.reference, lines: [] }),
    );
    const service = createService(prisma);

    // Act
    await service.create(tenantId, {
      supplierId: 'sup-1',
      destinationLocationId: 'loc-1',
      lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
    });

    // Assert
    expect(prisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reference: 'PO-2026-0004' }),
      }),
    );
  });

  it('getById restituisce ordine con righe', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      lines: [],
    });
    const service = createService(prisma);

    await expect(service.getById(tenantId, 'po-1')).resolves.toMatchObject({ id: 'po-1' });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('send incrementa incoming sulle righe ordine', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.draft,
      destinationLocationId: 'loc-1',
      lines: [{ variantId: 'var-1', orderedQuantity: 10, receivedQuantity: 0 }],
    });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.sent,
      destinationLocationId: 'loc-1',
      lines: [{ variantId: 'var-1', orderedQuantity: 10, receivedQuantity: 0 }],
    });
    const service = createService(prisma);

    await service.send(tenantId, 'po-1');

    expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { incoming: { increment: 10 } },
      }),
    );
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
    const service = createService(prisma);

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
    const service = createService(prisma);

    await expect(service.send(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('receive è deprecato: indirizza al flusso documentale', async () => {
    const service = createService(createPrismaMock());

    await expect(
      service.receive(tenantId, 'po-1', { lines: [{ lineId: 'line-1', quantity: 5 }] }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it.skip('receive registra carico e aggiorna stato ordine (deprecato — usare goods receipt)', async () => {
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
      {} as never,
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
    const service = createService(prisma);

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
    const service = createService(prisma);

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
      destinationLocationId: 'loc-1',
      lines: [{ variantId: 'var-1', orderedQuantity: 8, receivedQuantity: 2 }],
    });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.cancelled,
      lines: [],
    });
    const service = createService(prisma);

    await expect(service.cancel(tenantId, 'po-1')).resolves.toMatchObject({
      status: SupplierOrderStatus.cancelled,
    });

    expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { incoming: { increment: -6 } },
      }),
    );
  });

  it('delete rimuove solo ordini annullati', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.cancelled,
      lines: [],
    });
    prisma.supplierOrder.delete.mockResolvedValue({ id: 'po-1' });
    const service = createService(prisma);

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
    const service = createService(prisma);

    await expect(service.delete(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('enforcement location (N sedi per utente)', () => {
    it('titolare può creare un ordine fornitore in qualunque sede del tenant', async () => {
      const prisma = createPrismaMock();
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore Alpha' });
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-qualunque' });
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1', sku: 'SKU-1' }]);
      prisma.supplierOrder.findMany.mockResolvedValue([]);
      prisma.supplierOrder.create.mockResolvedValue({ id: 'po-new', lines: [] });
      const service = createService(prisma);

      await expect(
        service.create(
          tenantId,
          {
            supplierId: 'sup-1',
            destinationLocationId: 'loc-qualunque',
            lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
          },
          testOwnerUser(),
        ),
      ).resolves.toMatchObject({ id: 'po-new' });
    });

    it('utente con una sola sede assegnata riceve 403 su una sede diversa dello stesso tenant', async () => {
      const prisma = createPrismaMock();
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore Alpha' });
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-2' });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(
        service.create(
          tenantId,
          {
            supplierId: 'sup-1',
            destinationLocationId: 'loc-2',
            lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
          },
          clerk,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.supplierOrder.create).not.toHaveBeenCalled();
    });

    it('utente senza alcuna sede assegnata non può creare ordini fornitore', async () => {
      const prisma = createPrismaMock();
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore Alpha' });
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
      const service = createService(prisma);
      const clerk = testClerkUser({ hasAllLocationsAccess: false, assignedLocationIds: [] });

      await expect(
        service.create(
          tenantId,
          {
            supplierId: 'sup-1',
            destinationLocationId: 'loc-1',
            lines: [{ variantId: 'var-1', orderedQuantity: 5, unitCostMinor: 1000 }],
          },
          clerk,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('list esclude gli ordini di sedi non autorizzate per l’utente corrente', async () => {
      const prisma = createPrismaMock();
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]);
      prisma.supplierOrder.findMany.mockResolvedValue([]);
      prisma.supplierOrder.count.mockResolvedValue(0);
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await service.list(tenantId, { page: 1, pageSize: 10 }, clerk);

      expect(prisma.supplierOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ destinationLocationId: { in: ['loc-1'] } }),
        }),
      );
    });

    it('getById rifiuta l’apertura diretta su una sede non autorizzata', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.draft,
        destinationLocationId: 'loc-9',
        lines: [],
      });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'po-1', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('send rifiuta con 403 un ordine con destinazione fuori dalle sedi assegnate', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.draft,
        destinationLocationId: 'loc-9',
        lines: [],
      });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.send(tenantId, 'po-1', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.supplierOrder.update).not.toHaveBeenCalled();
    });

    it('cancel rifiuta con 403 un ordine con destinazione fuori dalle sedi assegnate', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.sent,
        destinationLocationId: 'loc-9',
        lines: [],
      });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.cancel(tenantId, 'po-1', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.supplierOrder.update).not.toHaveBeenCalled();
    });

    it('delete rifiuta con 403 un ordine con destinazione fuori dalle sedi assegnate', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.cancelled,
        destinationLocationId: 'loc-9',
        lines: [],
      });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.delete(tenantId, 'po-1', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.supplierOrder.delete).not.toHaveBeenCalled();
    });

    it('send consente al titolare qualunque destinazione, al commesso la sede assegnata', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.draft,
        destinationLocationId: 'loc-1',
        lines: [],
      });
      prisma.supplierOrder.update.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.sent,
        destinationLocationId: 'loc-1',
        lines: [],
      });
      const service = createService(prisma);

      await expect(service.send(tenantId, 'po-1', testOwnerUser())).resolves.toMatchObject({
        status: SupplierOrderStatus.sent,
      });
      await expect(
        service.send(tenantId, 'po-1', testClerkUser({ assignedLocationIds: ['loc-1'] })),
      ).resolves.toMatchObject({ status: SupplierOrderStatus.sent });
    });
  });
});
