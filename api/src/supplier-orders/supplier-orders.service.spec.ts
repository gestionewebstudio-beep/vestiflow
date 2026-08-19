import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseCostEntryMode, SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { grossFromNetMinor } from '../vat/vat-line-calculation.util';

import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { ExternalDocumentTypesService } from '../documents/external-document-types.service';
import type { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
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
        printTitle: 'Ordine fornitore',
        autoNumbering: true,
        numberPrefix: 'OF',
        defaultSeries: 'A',
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
      {
        resolvePricesIncludeVat: vi.fn().mockResolvedValue(false),
        resolveCompanyDefault: vi.fn().mockResolvedValue(false),
        salesPricesIncludeVat: vi.fn().mockResolvedValue(false),
        remember: vi.fn().mockResolvedValue(undefined),
      } as unknown as DocumentPriceModePreferenceService,
      {
        resolveForWrite: vi
          .fn()
          .mockResolvedValue({ externalDocumentTypeId: null, externalDocumentTypeSnapshot: null }),
      } as unknown as ExternalDocumentTypesService,
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
      documentCounter: {
        findFirst: vi.fn().mockResolvedValue(null),
        // Nessun contatore disponibile per la sede: la serie resta «senza serie».
        findMany: vi.fn().mockResolvedValue([]),
      },
      documentSequence: {
        upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      supplierOrder: {
        aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
        // Numerazione «massimo esistente + 1»: la fonte è il riferimento degli
        // ordini dell'anno, non più il contatore.
        findMany: vi.fn().mockResolvedValue([]),
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
      // Advisory lock sul contatore: qui non serializza niente (transazione
      // finta), ma senza la mock la chiamata romperebbe la creazione.
      $queryRaw: vi.fn().mockResolvedValue([]),
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
    prisma.supplierOrder.aggregate.mockResolvedValue({ _max: { number: 6 } });
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

    await expect(
      service.create(tenantId, {
        supplierId: 'sup-1',
        supplierReference: 'ORD-FORN-77',
        lines: [{ variantId: 'var-1', orderedQuantity: 5, enteredUnitCostMinor: 1000 }],
      }),
    ).resolves.toMatchObject({
      id: 'po-new',
      reference: 'OF-0007',
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

  // ── Il giro del costo ivato (docs/ORDINE-FORNITORE-RIGA.md) ────────────────
  //
  // «Un costo digitato in modalità ivata, salvato e riletto, torna identico.»
  //
  // Sull'ordine fornitore il costo si DIGITA: si richiama l'articolo, arriva il
  // costo d'anagrafica, e l'operatore lo cambia — perché propone un costo nuovo
  // al fornitore o perché lo paga di più. Quello è un lordo digitato, e il netto
  // che se ne ricava è il valore canonico da memorizzare. Se lo si arrotonda al
  // centesimo la coda dello scorporo muore lì e il ritorno vale un centesimo di
  // meno: misurato al 22%, su 884 costi su 4901 fra 1,00 e 50,00.
  //
  // L'elenco tiene insieme quattro costi che oggi perdono il centesimo e quattro
  // che tornano già: la regola vale per tutti, non solo per quelli rotti.
  it.each([
    { grossMinor: 103, oggi: 'perde' },
    { grossMinor: 125, oggi: 'perde' },
    { grossMinor: 502, oggi: 'perde' },
    { grossMinor: 4999, oggi: 'perde' },
    { grossMinor: 999, oggi: 'torna' },
    { grossMinor: 1290, oggi: 'torna' },
    { grossMinor: 2500, oggi: 'torna' },
    { grossMinor: 3799, oggi: 'torna' },
  ])(
    'costo ivato $grossMinor salvato e rimostrato ivato torna identico (oggi $oggi)',
    async ({ grossMinor }) => {
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

      await service.create(tenantId, {
        supplierId: 'sup-1',
        costEntryMode: PurchaseCostEntryMode.vat_included,
        lines: [
          {
            variantId: 'var-1',
            orderedQuantity: 1,
            enteredUnitCostMinor: grossMinor,
            vatCodeId: 'vat-22',
          },
        ],
      });

      const created = prisma.supplierOrder.create.mock.calls[0]![0] as {
        data: { lines: { create: readonly { unitCostMinor: unknown }[] } };
      };
      const storedNetMinor = Number(created.data.lines.create[0]!.unitCostMinor);

      // Rimostrare il costo ivato è un punto di USCITA: si arrotonda qui, e solo
      // qui. Se il netto memorizzato porta la sua coda, il giro torna.
      expect(grossFromNetMinor(storedNetMinor, 22)).toBe(grossMinor);
    },
  );

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
                OR: [{ destinationLocationId: null }, { destinationLocationId: { in: ['loc-1'] } }],
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

      await expect(service.getById(tenantId, 'po-1', testOwnerUser())).resolves.toMatchObject({
        id: 'po-1',
      });
      await expect(
        service.getById(tenantId, 'po-1', testClerkUser({ assignedLocationIds: ['loc-1'] })),
      ).resolves.toMatchObject({ id: 'po-1' });
    });
  });
});
