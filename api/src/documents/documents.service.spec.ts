import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentStatus, DocumentType, SupplierOrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCOUNTANT_DOCUMENT_TYPES } from './accountant-document-types.constant';

import type { DocumentSettingsService } from './document-settings.service';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import { DocumentsService } from './documents.service';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';

const tenantId = 'tenant-1';

function resolvedSetting(
  overrides: Partial<ResolvedDocumentTypeSetting> = {},
): ResolvedDocumentTypeSetting {
  return {
    type: DocumentType.sales_ddt,
    enabled: true,
    printTitle: 'Documento di trasporto',
    autoNumbering: true,
    numberPrefix: 'DDT',
    defaultSeries: 'A',
    blockAfterConfirm: false,
    pricesIncludeVat: false,
    defaultNotes: null,
    ...overrides,
  };
}

function createPrismaMock() {
  // getById include sempre purchaseInvoiceLinks/goodsReceiptLinks: Prisma
  // restituisce array (anche vuoti), le fixture parziali dei test no.
  // Il default qui evita di ripetere le due relazioni in ogni mock.
  const documentFindFirst = vi.fn();
  const withLinkDefaults = (value: unknown) =>
    value && typeof value === 'object'
      ? { purchaseInvoiceLinks: [], goodsReceiptLinks: [], ...value }
      : value;
  const rawMockResolvedValue = documentFindFirst.mockResolvedValue.bind(documentFindFirst);
  documentFindFirst.mockResolvedValue = ((value: unknown) =>
    rawMockResolvedValue(withLinkDefaults(value))) as typeof documentFindFirst.mockResolvedValue;
  const rawMockResolvedValueOnce =
    documentFindFirst.mockResolvedValueOnce.bind(documentFindFirst);
  documentFindFirst.mockResolvedValueOnce = ((value: unknown) =>
    rawMockResolvedValueOnce(
      withLinkDefaults(value),
    )) as typeof documentFindFirst.mockResolvedValueOnce;

  const prisma = {
    document: {
      findFirst: documentFindFirst,
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    documentLine: { deleteMany: vi.fn() },
    documentRevision: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    documentSequence: { upsert: vi.fn(), findUnique: vi.fn() },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'var-1',
        sku: 'SKU-1',
        product: { inventoryTracking: 'standard' },
      }),
    },
    inventoryLevel: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    inventoryLot: { upsert: vi.fn() },
    inventorySerial: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stockMovement: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    supplier: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    location: { findFirst: vi.fn() },
    supplierOrder: { findFirst: vi.fn() },
    supplierOrderLine: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tenantFeatureSettings: {
      findUnique: vi.fn().mockResolvedValue({ updateSupplierPriceOnLoad: 'never' }),
    },
    supplierVariantLink: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>, setting = resolvedSetting()) {
  const settings = { getResolved: vi.fn().mockResolvedValue(setting) };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
  );
  return { service, settings, channelSync };
}

describe('DocumentsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  describe('list', () => {
    it('applica filtro customerId', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, customerId: 'cust-1' });

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, customerId: 'cust-1' }),
        }),
      );
    });

    it('applica filtro accountant con tipi registro commercialista', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, accountant: true });

      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as {
        type?: { in?: DocumentType[] };
      };
      expect(where.type?.in).toEqual([...ACCOUNTANT_DOCUMENT_TYPES]);
    });

    it('applica filtro pendingInvoice su DDT senza bozza fattura', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20, pendingInvoice: true });

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: DocumentType.sales_ddt,
            derivedDocuments: {
              none: {
                type: DocumentType.invoice_draft,
                status: { not: DocumentStatus.cancelled },
              },
            },
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('rifiuta i tipi documento non abilitati', async () => {
      const { service } = createService(prisma, resolvedSetting({ enabled: false }));

      await expect(
        service.create(tenantId, { type: DocumentType.sales_ddt, documentDate: '2026-01-10' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('calcola totali riga e IVA con prezzi IVA esclusa', async () => {
      const { service } = createService(prisma);
      prisma.document.create.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.sales_ddt,
        documentDate: '2026-03-01',
        lines: [
          { description: 'Maglia', quantity: 2, unitPriceMinor: 1000, vatRatePercent: 22 },
          { description: 'Sconto extra', quantity: 1, unitPriceMinor: 5000, discountPercent: 10 },
        ],
      });

      const data = prisma.document.create.mock.calls[0][0].data;
      // Riga 1: 2 * 1000 = 2000 (IVA 22% -> 440). Riga 2: 5000 * 90% = 4500 (no IVA).
      expect(data.subtotalMinor).toBe(6500);
      expect(data.taxMinor).toBe(440);
      expect(data.totalMinor).toBe(6940);
      expect(data.status).toBe(DocumentStatus.draft);
      expect(data.year).toBe(2026);
      expect(data.lines.create).toHaveLength(2);
      expect(data.lines.create[0]).toMatchObject({ lineNumber: 1, tenantId, lineTotalMinor: 2000 });
      expect(data.lines.create[1]).toMatchObject({ lineNumber: 2, lineTotalMinor: 4500 });
    });

    it('scorpora l’IVA quando i prezzi sono IVA inclusa', async () => {
      const { service } = createService(prisma, resolvedSetting({ pricesIncludeVat: true }));
      prisma.document.create.mockResolvedValue({ id: 'doc-2', lines: [] });

      await service.create(tenantId, {
        type: DocumentType.sales_ddt,
        documentDate: '2026-03-01',
        lines: [{ description: 'Capo', quantity: 1, unitPriceMinor: 1220, vatRatePercent: 22 }],
      });

      const data = prisma.document.create.mock.calls[0][0].data;
      // 1220 lordo, IVA 22% -> imponibile 1000, IVA 220, totale 1220.
      expect(data.totalMinor).toBe(1220);
      expect(data.taxMinor).toBe(220);
      expect(data.subtotalMinor).toBe(1000);
    });
  });

  describe('confirm', () => {
    it('assegna numero progressivo e riferimento formattato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        lines: [{ id: 'l1' }],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 7 });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.status).toBe(DocumentStatus.confirmed);
      expect(data.number).toBe(7);
      expect(data.reference).toBe('DDT-2026-0007');
      expect(data.confirmedAt).toBeInstanceOf(Date);
    });

    it('non ri-numera un documento già confermato in precedenza', async () => {
      const { service } = createService(prisma, resolvedSetting({ autoNumbering: false }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: 3,
        reference: 'DDT-2026-0003',
        lines: [{ id: 'l1' }],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      expect(prisma.documentSequence.upsert).not.toHaveBeenCalled();
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.number).toBe(3);
    });

    it('rifiuta la conferma di un documento non in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        lines: [{ id: 'l1' }],
      });

      await expect(service.confirm(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rifiuta la conferma senza righe', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [],
      });

      await expect(service.confirm(tenantId, 'doc-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('propaga NotFound se il documento non esiste', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.confirm(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('goods_receipt: genera movimenti di carico alla conferma', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        supplierId: 'sup-1',
        locationId: 'loc-1',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 5,
            loadsStock: true,
          },
          {
            id: 'l2',
            lineNumber: 2,
            variantId: null,
            sku: null,
            quantity: 1,
            loadsStock: false,
          },
        ],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 3 });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-gr', lines: [] });

      await service.confirm(tenantId, 'doc-gr', {
        id: 'user-1',
        displayName: 'Mario',
      } as never);

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'load',
            variantId: 'var-1',
            locationId: 'loc-1',
            quantity: 5,
            externalRef: 'doc-gr',
            createdByName: 'Mario',
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('goods_receipt: rifiuta conferma senza fornitore', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr',
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        supplierId: null,
        locationId: 'loc-1',
        lines: [{ lineNumber: 1, variantId: 'v1', quantity: 1, loadsStock: true }],
      });

      await expect(service.confirm(tenantId, 'doc-gr')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('sales_ddt: genera movimenti di vendita alla conferma', async () => {
      const { service, channelSync } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 12 });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ddt', lines: [] });

      await service.confirm(tenantId, 'doc-ddt', {
        id: 'user-1',
        displayName: 'Anna',
      } as never);

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'sale',
            origin: 'manual',
            variantId: 'var-1',
            locationId: 'loc-1',
            quantity: 3,
            externalRef: 'doc-ddt',
            createdByName: 'Anna',
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('sales_ddt: rifiuta conferma con righe stock senza cliente', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ddt',
        type: DocumentType.sales_ddt,
        status: DocumentStatus.draft,
        customerId: null,
        locationId: 'loc-1',
        lines: [{ lineNumber: 1, variantId: 'v1', quantity: 2, loadsStock: true }],
      });

      await expect(service.confirm(tenantId, 'doc-ddt')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('transfer: genera movimenti transfer alla conferma', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.transfer, numberPrefix: 'TR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
          },
        ],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 2 });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-tr', lines: [] });

      await service.confirm(tenantId, 'doc-tr');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            locationId: 'loc-a',
            targetLocationId: 'loc-b',
            quantity: 4,
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-a']);
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-b']);
    });

    it('manual_unload: genera movimenti unload alla conferma', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.manual_unload, numberPrefix: 'SCA' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-sca',
        tenantId,
        type: DocumentType.manual_unload,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-1',
        internalComment: 'Campione difettoso',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 1 });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-sca', lines: [] });

      await service.confirm(tenantId, 'doc-sca');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'unload',
            locationId: 'loc-1',
            quantity: 3,
            reason: expect.stringContaining('Campione difettoso'),
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('manual_unload: rifiuta conferma senza motivo', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.manual_unload }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-sca',
        tenantId,
        type: DocumentType.manual_unload,
        status: DocumentStatus.draft,
        locationId: 'loc-1',
        internalComment: null,
        lines: [{ lineNumber: 1, variantId: 'v1', quantity: 1, loadsStock: true }],
      });

      await expect(service.confirm(tenantId, 'doc-sca')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('adjustment: genera movimenti adjustment alla conferma', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.adjustment, numberPrefix: 'RET' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ret',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        locationId: 'loc-1',
        adjustmentDirection: 'increase',
        internalComment: 'Inventario fisico',
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
          },
        ],
      });
      prisma.documentSequence.upsert.mockResolvedValue({ lastNumber: 1 });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ret', lines: [] });

      await service.confirm(tenantId, 'doc-ret');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'adjustment',
            direction: 'increase',
            locationId: 'loc-1',
            quantity: 2,
          }),
        }),
      );
    });
  });

  describe('transizioni di stato', () => {
    it('markPrinted consente il passaggio da confermato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        lines: [],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.markPrinted(tenantId, 'doc-1');

      expect(prisma.document.update.mock.calls[0][0].data.status).toBe(DocumentStatus.printed);
    });

    it('markPrinted rifiuta il passaggio da bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [],
      });

      await expect(service.markPrinted(tenantId, 'doc-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('markSent consente il passaggio da stampato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.printed,
        lines: [],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.markSent(tenantId, 'doc-1');

      expect(prisma.document.update.mock.calls[0][0].data.status).toBe(DocumentStatus.sent);
    });

    it('registerExternal registra data e riferimenti esterni', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        externalDocNumber: null,
        externalDocDate: null,
        externalRef: null,
        lines: [],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.registerExternal(tenantId, 'doc-1', {
        externalDocNumber: 'FT-99',
        externalDocDate: '2026-04-01',
        note: 'commercialista',
      });

      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.status).toBe(DocumentStatus.externally_registered);
      expect(data.externalDocNumber).toBe('FT-99');
      expect(data.externalRef).toBe('commercialista');
      expect(data.registrationDate).toBeInstanceOf(Date);
    });

    it('registerExternal rifiuta le bozze', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [],
      });

      await expect(service.registerExternal(tenantId, 'doc-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('cancel rifiuta un documento già annullato', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.cancelled,
        lines: [],
      });

      await expect(service.cancel(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancel goods_receipt confermato storna giacenza e registra revisione', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      const doc = {
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        reference: 'CAR-2026-0002',
        locationId: 'loc-1',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 4,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-gr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-gr', { id: 'user-1', displayName: 'Luigi' } as never);

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'unload',
            variantId: 'var-1',
            quantity: 4,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('cancel sales_ddt confermato ripristina giacenza', async () => {
      const { service, channelSync } = createService(prisma);
      const doc = {
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        reference: 'DDT-2026-0012',
        locationId: 'loc-1',
        series: 'A',
        documentDate: new Date(),
        currency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 2,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-ddt',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-ddt', { id: 'user-1', displayName: 'Luigi' } as never);

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'load',
            variantId: 'var-1',
            quantity: 2,
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });
  });

  describe('update', () => {
    it('rifiuta la modifica di documenti non editabili', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.externally_registered,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: null,
        targetLocationId: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.update(tenantId, 'doc-1', { notes: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rifiuta la modifica confermata se blockAfterConfirm è attivo', async () => {
      const { service } = createService(prisma, resolvedSetting({ blockAfterConfirm: true }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: 'sup-1',
        locationId: 'loc-1',
        reference: 'CAR-2026-0001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.update(tenantId, 'doc-1', { notes: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rifiuta PATCH con righe se il documento ha movimenti per riga (nuovo flusso AM)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-lines',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: 'sup-1',
        locationId: 'loc-1',
        reference: 'CAR-2026-0001',
        customerId: null,
        targetLocationId: null,
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Almeno un movimento con sourceLineId: il documento va aggiornato solo
      // tramite «Salva documento» (saveGoodsReceipt), mai con PATCH righe.
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-gr-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 1000,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('goods_receipt bozza: consente righe con Mag. attivo senza variantId', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      const doc = {
        id: 'doc-gr-draft',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        series: 'A',
        year: 2026,
        number: null,
        reference: null,
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: 'sup-1',
        supplierName: 'Fornitore A',
        locationId: 'loc-1',
        notes: null,
        internalComment: null,
        customerId: null,
        customerName: null,
        targetLocationId: null,
        externalDocNumber: null,
        supplierOrderId: null,
        blockAfterConfirm: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      };
      const updatedDoc = {
        ...doc,
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: null,
            sku: 'NEW-SKU',
            description: 'Nuovo prodotto',
            quantity: 3,
            unitPriceMinor: 1000,
            discountPercent: 0,
            vatRatePercent: 22,
            lineTotalMinor: 3000,
            loadsStock: true,
            documentId: 'doc-gr-draft',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce(updatedDoc);
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 0 });
      prisma.document.update.mockResolvedValue(updatedDoc);

      const result = await service.update(tenantId, 'doc-gr-draft', {
        lines: [
          {
            description: 'Nuovo prodotto',
            sku: 'NEW-SKU',
            quantity: 3,
            unitPriceMinor: 1000,
            loadsStock: true,
          },
        ],
      });

      expect(result.lines[0]?.variantId).toBeNull();
      expect(prisma.document.update).toHaveBeenCalled();
    });

    it('goods_receipt confermato: riconcilia giacenza e registra revisione', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      const doc = {
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'CAR-2026-0003',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: 'sup-1',
        locationId: 'loc-1',
        notes: 'prima',
        internalComment: null,
        customerId: null,
        targetLocationId: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 5,
            unitPriceMinor: 1000,
            discountPercent: 0,
            vatRatePercent: 22,
            lineTotalMinor: 5000,
            loadsStock: true,
            documentId: 'doc-gr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, notes: 'dopo', blockAfterConfirm: false });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, notes: 'dopo' });

      await service.update(
        tenantId,
        'doc-gr',
        {
          notes: 'dopo',
          lines: [
            {
              description: 'Maglia',
              variantId: 'var-1',
              quantity: 8,
              unitPriceMinor: 1000,
              loadsStock: true,
            },
          ],
        },
        { id: 'user-1', displayName: 'Mario' } as never,
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'load',
            variantId: 'var-1',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revisionNumber: 1,
            changedByName: 'Mario',
          }),
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('sales_ddt confermato: riconcilia scarico vendita e registra revisione', async () => {
      const { service, channelSync } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.sales_ddt }),
      );
      const doc = {
        id: 'doc-ddt',
        tenantId,
        type: DocumentType.sales_ddt,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'DDT-2026-0005',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: 'cust-1',
        locationId: 'loc-1',
        notes: null,
        internalComment: null,
        targetLocationId: null,
        adjustmentDirection: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 5,
            unitPriceMinor: 2000,
            discountPercent: 0,
            vatRatePercent: 22,
            lineTotalMinor: 10000,
            loadsStock: true,
            documentId: 'doc-ddt',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, blockAfterConfirm: false });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 20, available: 20 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(
        tenantId,
        'doc-ddt',
        {
          lines: [
            {
              description: 'Maglia',
              variantId: 'var-1',
              quantity: 8,
              unitPriceMinor: 2000,
              loadsStock: true,
            },
          ],
        },
        { id: 'user-1', displayName: 'Mario' } as never,
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'sale',
            variantId: 'var-1',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
    });

    it('transfer confermato: riconcilia movimenti transfer', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'TR-2026-0002',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        adjustmentDirection: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            vatRatePercent: null,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-tr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, blockAfterConfirm: false });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(tenantId, 'doc-tr', {
        lines: [
          {
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 5,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });

    it('manual_unload confermato: riconcilia scarico manuale', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.manual_unload }),
      );
      const doc = {
        id: 'doc-sca',
        tenantId,
        type: DocumentType.manual_unload,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'SCA-2026-0001',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: null,
        internalComment: 'Campione',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            vatRatePercent: null,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-sca',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, blockAfterConfirm: false });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(tenantId, 'doc-sca', {
        lines: [
          {
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 4,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'unload',
            quantity: 2,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });

    it('adjustment confermato: riconcilia rettifica inventario', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      const doc = {
        id: 'doc-ret',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'RET-2026-0001',
        documentDate: new Date('2026-03-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: 'increase',
        internalComment: 'Conteggio',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            lineNumber: 1,
            variantId: 'var-1',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 2,
            unitPriceMinor: 0,
            discountPercent: 0,
            vatRatePercent: null,
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-ret',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, blockAfterConfirm: false });
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.documentLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, lines: doc.lines });

      await service.update(tenantId, 'doc-ret', {
        lines: [
          {
            description: 'Maglia',
            variantId: 'var-1',
            quantity: 5,
            loadsStock: true,
          },
        ],
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'adjustment',
            direction: 'increase',
            quantity: 3,
          }),
        }),
      );
      expect(prisma.documentRevision.create).toHaveBeenCalled();
    });
  });

  describe('createGoodsReceiptFromSupplierOrder', () => {
    it('crea bozza collegata con righe residue ordine fornitore', async () => {
      const { service, settings } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, printTitle: 'Arrivo merce' }),
      );
      settings.getResolved.mockResolvedValue(
        resolvedSetting({ type: DocumentType.goods_receipt, printTitle: 'Arrivo merce' }),
      );

      prisma.supplierOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        tenantId,
        supplierId: 'sup-1',
        destinationLocationId: 'loc-1',
        reference: 'PO-2026-0001',
        currency: 'EUR',
        status: SupplierOrderStatus.sent,
        lines: [
          {
            id: 'pol-1',
            variantId: 'var-1',
            sku: 'SKU-1',
            orderedQuantity: 10,
            receivedQuantity: 4,
            unitCostMinor: 1200,
          },
        ],
      });
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Fornitore A' });
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
      prisma.document.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'doc-gr-1',
          ...data,
          lines: data.lines.create.map((line: { lineNumber: number }, index: number) => ({
            id: `line-${index}`,
            ...line,
          })),
        }),
      );

      const doc = await service.createGoodsReceiptFromSupplierOrder(tenantId, 'po-1', {});

      expect(doc.id).toBe('doc-gr-1');
      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierOrderId: 'po-1',
            supplierId: 'sup-1',
            locationId: 'loc-1',
            lines: {
              create: [
                expect.objectContaining({
                  supplierOrderLineId: 'pol-1',
                  quantity: 6,
                  loadsStock: true,
                }),
              ],
            },
          }),
        }),
      );
    });
  });

  describe('getById', () => {
    it('include linkedSupplierOrderLines quando il documento ha ordine fornitore', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: {
          id: 'po-1',
          reference: 'OF-2026-001',
          lines: [
            {
              id: 'pol-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              orderedQuantity: 10,
              receivedQuantity: 3,
            },
          ],
        },
      });

      const detail = await service.getById(tenantId, 'doc-gr-1');

      expect(detail.linkedSupplierOrder).toEqual({ id: 'po-1', reference: 'OF-2026-001' });
      expect(detail.linkedSupplierOrderLines).toEqual([
        {
          id: 'pol-1',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 10,
          receivedQuantity: 3,
        },
      ]);
    });
  });

  describe('previewNextReference', () => {
    it('calcola anteprima senza incrementare il numeratore', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({
          type: DocumentType.goods_receipt,
          numberPrefix: 'CAR',
          defaultSeries: 'A',
        }),
      );
      prisma.documentSequence.findUnique.mockResolvedValue({ lastNumber: 44 });

      const preview = await service.previewNextReference(
        tenantId,
        DocumentType.goods_receipt,
        'A',
        2026,
      );

      expect(preview).toEqual({
        reference: 'CAR-2026-0045',
        previewNumber: 45,
        series: 'A',
        year: 2026,
      });
      expect(prisma.documentSequence.upsert).not.toHaveBeenCalled();
    });

    it('usa 1 come primo numero se la sequenza non esiste', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.documentSequence.findUnique.mockResolvedValue(null);

      const preview = await service.previewNextReference(tenantId, DocumentType.goods_receipt);

      expect(preview.previewNumber).toBe(1);
      expect(preview.reference).toBe(`CAR-${preview.year}-0001`);
    });
  });

  describe('delete', () => {
    it('consente l’eliminazione di una bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.draft,
        lines: [],
      });
      prisma.document.delete.mockResolvedValue({ id: 'doc-1' });

      await service.delete(tenantId, 'doc-1');

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('rifiuta l’eliminazione di documenti confermati', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.confirmed,
        lines: [],
      });

      await expect(service.delete(tenantId, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });
  });
});
