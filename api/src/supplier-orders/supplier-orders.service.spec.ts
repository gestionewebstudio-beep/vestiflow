import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { VatCodesService } from '../vat/vat-codes.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { SupplierOrdersService } from './supplier-orders.service';
import type { SuppliersService } from './suppliers.service';

describe('SupplierOrdersService', () => {
  const tenantId = 'tenant-1';

  const supplierParty = {
    companyName: 'Fornitore Alpha',
    firstName: null,
    lastName: null,
    contactName: null,
    email: null,
  };

  function createSuppliersMock(): SuppliersService {
    return {
      listAll: vi.fn(),
      create: vi.fn(),
    } as unknown as SuppliersService;
  }

  function createDocumentSettingsMock(): DocumentSettingsService {
    return {
      getResolved: vi.fn().mockResolvedValue({
        type: 'supplier_order',
        enabled: true,
        printTitle: 'Ordine fornitore',
        autoNumbering: true,
        numberPrefix: 'OF',
        defaultSeries: 'A',
        blockAfterConfirm: false,
        pricesIncludeVat: false,
        defaultNotes: null,
      }),
    } as unknown as DocumentSettingsService;
  }

  function createVatCodesMock(): VatCodesService {
    return {
      buildSnapshot: vi.fn().mockImplementation((vatCode: { code: string }) => ({
        code: vatCode.code,
        ratePercent: 22,
      })),
    } as unknown as VatCodesService;
  }

  function createService(
    prisma: ReturnType<typeof createPrismaMock>,
    suppliers = createSuppliersMock(),
  ) {
    return new SupplierOrdersService(
      prisma as unknown as PrismaService,
      suppliers,
      createDocumentSettingsMock(),
      createVatCodesMock(),
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
      vatCode: { findMany: vi.fn().mockResolvedValue([]) },
      documentSequence: {
        upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      supplierOrder: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      supplierOrderLine: {
        update: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
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
    const service = createService(prisma, suppliers);

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
    const service = createService(prisma, suppliers);

    await service.createSupplier(tenantId, { name: '  Fornitore  ' });
    expect(suppliers.create).toHaveBeenCalledWith(tenantId, { name: '  Fornitore  ' });
  });

  it('getMeta espone anteprima del numeratore supplier_order', async () => {
    const prisma = createPrismaMock();
    prisma.documentSequence.findUnique.mockResolvedValue({ lastNumber: 41 });
    const service = createService(prisma);

    const year = new Date().getFullYear();
    await expect(service.getMeta(tenantId)).resolves.toEqual({
      nextReferencePreview: `OF-${year}-0042`,
    });
  });

  it('list pagina ordini fornitore', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findMany.mockResolvedValue([{ id: 'po-1', _count: { lines: 2 } }]);
    prisma.supplierOrder.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = await service.list(tenantId, { page: 1, pageSize: 10, search: 'OF' });

    expect(result.total).toBe(1);
  });

  it('create rifiuta fornitore inesistente', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(
      service.create(tenantId, { supplierId: 'missing', lines: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create persiste ordine Confermato con riferimento dal numeratore', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', party: supplierParty });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'var-1', sku: 'SKU-1', product: { name: 'T-shirt Basic' } },
    ]);
    prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 7 });
    prisma.supplierOrder.create.mockImplementation(
      (args: { data: { reference: string; status: string } }) =>
        Promise.resolve({
          id: 'po-new',
          reference: args.data.reference,
          status: args.data.status,
          lines: [{ id: 'line-1', sku: 'SKU-1' }],
        }),
    );
    const service = createService(prisma);

    const year = new Date().getFullYear();
    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        supplierReference: 'ORD-FORN-77',
        lines: [{ variantId: 'var-1', orderedQuantity: 5, enteredUnitCostMinor: 1000 }],
      }),
    ).resolves.toMatchObject({
      id: 'po-new',
      reference: `OF-${year}-0007`,
      status: SupplierOrderStatus.confirmed,
    });

    expect(prisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SupplierOrderStatus.confirmed,
          supplierReference: 'ORD-FORN-77',
          subtotalMinor: 5000,
          taxMinor: 0,
          totalMinor: 5000,
        }),
      }),
    );
  });

  it('create calcola sconto riga e IVA (costi netti)', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', party: supplierParty });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'var-1', sku: 'SKU-1', product: { name: 'Felpa' } },
    ]);
    prisma.vatCode.findMany.mockResolvedValue([
      {
        id: 'vat-22',
        code: '22',
        ratePercent: 22,
        nonDeductiblePercent: 0,
        calculationMode: 'standard',
        vatAffectsSupplierTotal: true,
        isActive: true,
        usageScope: 'both',
        nature: { key: 'standard', label: 'Imponibile', officialCode: null },
      },
    ]);
    prisma.supplierOrder.create.mockImplementation((args: { data: unknown }) =>
      Promise.resolve({ id: 'po-new', lines: [], ...(args.data as object) }),
    );
    const service = createService(prisma);

    // 10 pz × 10,00 € netti − 10% sconto = 90,00 imponibile; IVA 22% = 19,80.
    await service.create(tenantId, {
      supplierId: 'sup-1',
      lines: [
        {
          variantId: 'var-1',
          orderedQuantity: 10,
          enteredUnitCostMinor: 1000,
          discountPercent: 10,
          vatCodeId: 'vat-22',
        },
      ],
    });

    expect(prisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotalMinor: 9000,
          taxMinor: 1980,
          totalMinor: 10980,
        }),
      }),
    );
  });

  it('create rifiuta variante inesistente', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', party: supplierParty });
    prisma.productVariant.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        lines: [{ variantId: 'var-x', orderedQuantity: 1, enteredUnitCostMinor: 100 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('create rifiuta Codice IVA riservato alle vendite', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', party: supplierParty });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'var-1', sku: 'SKU-1', product: { name: 'Felpa' } },
    ]);
    prisma.vatCode.findMany.mockResolvedValue([
      {
        id: 'vat-sales',
        code: 'V22',
        ratePercent: 22,
        nonDeductiblePercent: 0,
        calculationMode: 'standard',
        vatAffectsSupplierTotal: true,
        isActive: true,
        usageScope: 'sales',
        nature: { key: 'standard', label: 'Imponibile', officialCode: null },
      },
    ]);
    const service = createService(prisma);

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        lines: [
          {
            variantId: 'var-1',
            orderedQuantity: 1,
            enteredUnitCostMinor: 100,
            vatCodeId: 'vat-sales',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('getById restituisce ordine con collegamento agli arrivi merce', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.concluded,
      destinationLocationId: null,
      lines: [],
      documents: [
        {
          id: 'doc-1',
          type: 'goods_receipt',
          reference: 'CAR-2026-0003',
          number: 3,
          documentDate: new Date('2026-07-10'),
          status: 'confirmed',
        },
      ],
    });
    const service = createService(prisma);

    await expect(service.getById(tenantId, 'po-1')).resolves.toMatchObject({
      id: 'po-1',
      linkedDocuments: [expect.objectContaining({ reference: 'CAR-2026-0003' })],
    });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update sostituisce righe su ordine Confermato', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.confirmed,
      supplierId: 'sup-1',
      destinationLocationId: null,
      currency: 'EUR',
      costEntryMode: 'vat_excluded',
      orderDate: new Date('2026-07-01'),
      supplierReference: null,
      expectedAt: null,
      lines: [],
      documents: [],
    });
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', party: supplierParty });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'var-1', sku: 'SKU-1', product: { name: 'Felpa' } },
    ]);
    prisma.supplierOrderLine.deleteMany.mockResolvedValue({ count: 1 });
    prisma.supplierOrder.update.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.confirmed,
      lines: [{ id: 'line-1' }],
    });
    const service = createService(prisma);

    await expect(
      service.update(tenantId, 'po-1', {
        lines: [{ variantId: 'var-1', orderedQuantity: 3, enteredUnitCostMinor: 500 }],
      }),
    ).resolves.toMatchObject({ id: 'po-1' });
    expect(prisma.supplierOrderLine.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'po-1' },
    });
  });

  it('update rifiuta ordine Concluso', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.concluded,
      destinationLocationId: null,
      lines: [],
      documents: [],
    });
    const service = createService(prisma);

    await expect(
      service.update(tenantId, 'po-1', {
        lines: [{ variantId: 'var-1', orderedQuantity: 3, enteredUnitCostMinor: 500 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancel annulla solo ordini Confermati', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.confirmed,
      destinationLocationId: null,
      lines: [],
      documents: [],
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
  });

  it('cancel rifiuta ordine Concluso (collegato a un arrivo merce)', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.concluded,
      destinationLocationId: null,
      lines: [],
      documents: [],
    });
    const service = createService(prisma);

    await expect(service.cancel(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.supplierOrder.update).not.toHaveBeenCalled();
  });

  it('delete rimuove solo ordini annullati', async () => {
    const prisma = createPrismaMock();
    prisma.supplierOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: SupplierOrderStatus.cancelled,
      destinationLocationId: null,
      lines: [],
      documents: [],
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
      status: SupplierOrderStatus.confirmed,
      destinationLocationId: null,
      lines: [],
      documents: [],
    });
    const service = createService(prisma);

    await expect(service.delete(tenantId, 'po-1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('scope location (solo ordini legacy con destinazione)', () => {
    it('list limita gli ordini con sede alle sedi assegnate ma include quelli senza sede', async () => {
      const prisma = createPrismaMock();
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]);
      prisma.supplierOrder.findMany.mockResolvedValue([]);
      prisma.supplierOrder.count.mockResolvedValue(0);
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await service.list(tenantId, { page: 1, pageSize: 10 }, clerk);

      expect(prisma.supplierOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { destinationLocationId: null },
                  { destinationLocationId: { in: ['loc-1'] } },
                ],
              },
            ],
          }),
        }),
      );
    });

    it('getById rifiuta l’apertura diretta di un ordine legacy su sede non autorizzata', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.confirmed,
        destinationLocationId: 'loc-9',
        lines: [],
        documents: [],
      });
      const service = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'po-1', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('getById consente al titolare qualunque ordine e a chiunque gli ordini senza sede', async () => {
      const prisma = createPrismaMock();
      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        status: SupplierOrderStatus.confirmed,
        destinationLocationId: null,
        lines: [],
        documents: [],
      });
      const service = createService(prisma);

      await expect(
        service.getById(tenantId, 'po-1', testOwnerUser()),
      ).resolves.toMatchObject({ id: 'po-1' });
      await expect(
        service.getById(tenantId, 'po-1', testClerkUser({ assignedLocationIds: ['loc-1'] })),
      ).resolves.toMatchObject({ id: 'po-1' });
    });
  });
});
