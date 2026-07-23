import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCOUNTANT_DOCUMENT_TYPES } from './accountant-document-types.constant';
import { TenantPermission } from '../auth/tenant-permission.constants';

import type { DocumentSettingsService } from './document-settings.service';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import { DocumentsService } from './documents.service';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

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
  const rawMockResolvedValueOnce = documentFindFirst.mockResolvedValueOnce.bind(documentFindFirst);
  documentFindFirst.mockResolvedValueOnce = ((value: unknown) =>
    rawMockResolvedValueOnce(
      withLinkDefaults(value),
    )) as typeof documentFindFirst.mockResolvedValueOnce;

  const prisma = {
    document: {
      findFirst: documentFindFirst,
      // Numerazione «massimo esistente + 1»: la fonte è il massimo dei numeri
      // già assegnati nella serie/anno, non più il contatore.
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
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
      findMany: vi.fn().mockResolvedValue([]),
    },
    vatCode: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryLevel: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    inventoryLot: { upsert: vi.fn() },
    inventorySerial: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stockMovement: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      // Usato da syncTransferLineMovements/syncAdjustmentLineMovements
      // (mirror sync arrivo merce): prima query = conversione legacy
      // (sourceLineId: null, sempre vuota nei test), seconda = movimenti
      // per-riga esistenti (nessuno di default: ogni riga crea un movimento
      // nuovo, come nel flusso reale alla prima conferma).
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    supplier: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    // Ordine cliente manuale collegato a scarichi: nessuno di default.
    salesOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    location: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
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
  const stockReservations = {
    consumeReservationTx: vi.fn().mockResolvedValue(0),
    syncOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
    releaseOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
    restoreConsumedOrderReservationsTx: vi.fn().mockResolvedValue(undefined),
  };
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
    stockReservations as unknown as StockReservationService,
  );
  return { service, settings, channelSync, stockReservations };
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

    it('titolare vede tutti i documenti, nessun filtro location aggiunto', async () => {
      const { service } = createService(prisma);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);

      await service.list(tenantId, { page: 1, pageSize: 20 }, testOwnerUser());

      expect(prisma.location.findMany).not.toHaveBeenCalled();
      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where['AND']).toBeUndefined();
    });

    it('esclude i documenti di location non autorizzate per l’utente corrente', async () => {
      const { service } = createService(prisma);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.document.count.mockResolvedValue(0);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await service.list(tenantId, { page: 1, pageSize: 20 }, clerk);

      const where = prisma.document.findMany.mock.calls[0]?.[0]?.where as {
        AND?: { OR?: unknown[] }[];
      };
      expect(where.AND).toContainEqual({
        OR: [{ locationId: null }, { locationId: { in: ['loc-1'] } }],
      });
    });

    it('lista vuota (non errore) quando l’utente non ha alcuna sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-1' }]);
      const clerk = testClerkUser({ hasAllLocationsAccess: false, assignedLocationIds: [] });

      const result = await service.list(tenantId, { page: 1, pageSize: 20 }, clerk);

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(prisma.document.findMany).not.toHaveBeenCalled();
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

      const data = prisma.document.create.mock.calls[0]![0]!.data;
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

      const data = prisma.document.create.mock.calls[0]![0]!.data;
      // 1220 lordo, IVA 22% -> imponibile 1000, IVA 220, totale 1220.
      expect(data.totalMinor).toBe(1220);
      expect(data.taxMinor).toBe(220);
      expect(data.subtotalMinor).toBe(1000);
    });

    // Percorso duplicato Arrivo merce (post-audit): questi tipi hanno un
    // flusso dedicato che copre creazione E modifica con le validazioni
    // corrette (GoodsReceiptWorkflowService.saveGoodsReceipt, POST
    // documents/goods-receipt/save). Il percorso generico POST /documents
    // deve rifiutarli per evitare bozze prive di fornitore/location valide.
    it.each([
      DocumentType.goods_receipt,
      DocumentType.supplier_ddt,
      DocumentType.supplier_invoice_accompanying,
      DocumentType.manual_load,
      DocumentType.initial_load,
    ])('rifiuta la creazione generica di %s: usa il flusso dedicato arrivo merce', async (type) => {
      const { service } = createService(prisma, resolvedSetting({ type }));

      await expect(
        service.create(tenantId, { type, documentDate: '2026-01-10' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('il messaggio di rifiuto indica il flusso dedicato, senza dettagli tecnici', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );

      try {
        await service.create(tenantId, {
          type: DocumentType.goods_receipt,
          documentDate: '2026-01-10',
        });
        expect.fail('doveva rifiutare la creazione generica di goods_receipt');
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        const message = (error as UnprocessableEntityException).message;
        expect(message).toContain('Salva documento');
        expect(message).not.toContain('property');
        expect(message).not.toContain('should not exist');
      }
    });

    // Trasferimento e rettifica NON hanno un flusso dedicato che copra la
    // creazione: TransferAdjustmentWorkflowService.saveTransfer/saveAdjustment
    // gestiscono SOLO la modifica di un documento già confermato (vedi
    // commenti in transfer-adjustment-workflow.service.ts e nel frontend
    // document.service.ts). La creazione/prima conferma resta sul percorso
    // generico: qui verifichiamo che NON vengano bloccati per errore.
    it.each([DocumentType.transfer, DocumentType.adjustment])(
      'NON blocca la creazione generica di %s (nessun flusso dedicato di creazione)',
      async (type) => {
        const { service } = createService(prisma, resolvedSetting({ type }));
        prisma.document.create.mockResolvedValue({ id: 'doc-x', lines: [] });

        await expect(
          service.create(tenantId, { type, documentDate: '2026-01-10' }),
        ).resolves.toMatchObject({ id: 'doc-x' });
        expect(prisma.document.create).toHaveBeenCalled();
      },
    );
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 6 } });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.confirm(tenantId, 'doc-1');

      const data = prisma.document.update.mock.calls[0]![0]!.data;
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

      expect(prisma.document.update).toHaveBeenCalled();
      const data = prisma.document.update.mock.calls[0]![0]!.data;
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

    it('goods_receipt: la conferma dal flusso generico viene rifiutata (percorso unico)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
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
        ],
      });

      await expect(service.confirm(tenantId, 'doc-gr')).rejects.toThrowError(/Salva documento/);
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 11 } });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ddt', lines: [] });

      await service.confirm(
        tenantId,
        'doc-ddt',
        testOwnerUser({ id: 'user-1', displayName: 'Anna' }),
      );

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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 1 } });
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

    it('manual_unload: alla conferma sottrae la giacenza SENZA creare movimenti', async () => {
      // Deroga prompt Scarico manuale: giacenza modificata direttamente,
      // niente StockMovement; push canali comunque eseguito post-commit.
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
        internalComment: null,
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-sca', lines: [] });

      await service.confirm(tenantId, 'doc-sca');

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1', locationId: 'loc-1' }),
          data: { onHand: { increment: -3 }, available: { increment: -3 } },
        }),
      );
      expect(channelSync.pushInventoryLevels).toHaveBeenCalledWith(tenantId, 'var-1', ['loc-1']);
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
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

    it('transfer: due righe con la stessa variante producono due movimenti distinti con sourceLineId', async () => {
      const { service } = createService(
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
            quantity: 2,
            loadsStock: true,
          },
          {
            id: 'l2',
            lineNumber: 2,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 3,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 1 } });
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1', sku: 'SKU-1' });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-tr', lines: [] });

      await service.confirm(tenantId, 'doc-tr');

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      const created = prisma.stockMovement.create.mock.calls.map((call) => call[0]!.data);
      expect(created.map((data) => data.sourceLineId)).toEqual(['l1', 'l2']);
      expect(created.every((data) => data.type === 'transfer')).toBe(true);
    });

    it('adjustment: due righe con la stessa variante producono due movimenti distinti con sourceLineId', async () => {
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
          {
            id: 'l2',
            lineNumber: 2,
            variantId: 'var-1',
            sku: 'SKU-1',
            quantity: 6,
            loadsStock: true,
          },
        ],
      });
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 0 } });
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ id: 'doc-ret', lines: [] });

      await service.confirm(tenantId, 'doc-ret');

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      const created = prisma.stockMovement.create.mock.calls.map((call) => call[0]!.data);
      expect(created.map((data) => data.sourceLineId)).toEqual(['l1', 'l2']);
      expect(created.every((data) => data.type === 'adjustment')).toBe(true);
    });
  });

  describe('transizioni di stato', () => {
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

      const data = prisma.document.update.mock.calls[0]![0]!.data;
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

    // «Inviata al commercialista» è l'unica azione fiscale: sulla Fattura non
    // richiede più un passaggio preliminare di emissione esterna.
    it('registerExternal accetta una fattura confermata senza emissione esterna', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        type: DocumentType.invoice_draft,
        status: DocumentStatus.confirmed,
        externallyIssuedAt: null,
        externalDocNumber: null,
        externalDocDate: null,
        externalRef: null,
        lines: [],
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-1', lines: [] });

      await service.registerExternal(tenantId, 'doc-1', {});

      expect(prisma.document.update.mock.calls[0]![0]!.data.status).toBe(
        DocumentStatus.externally_registered,
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

      await service.cancel(
        tenantId,
        'doc-gr',
        testOwnerUser({ id: 'user-1', displayName: 'Luigi' }),
      );

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

      await service.cancel(
        tenantId,
        'doc-ddt',
        testOwnerUser({ id: 'user-1', displayName: 'Luigi' }),
      );

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

    it('cancel transfer legacy (senza movimenti per riga): usa il reverse aggregato', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        reference: 'TR-2026-0004',
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
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
            documentId: 'doc-tr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      // Nessun movimento con sourceLineId: documento pre-migrazione, ancora
      // sul modello aggregato legacy.
      prisma.stockMovement.count.mockResolvedValue(0);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryLevel.findUnique.mockResolvedValue({ onHand: 10, available: 10 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-tr');

      // reverseDocumentStockTransfer: storna verso l'origine invertendo le location.
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'transfer',
            locationId: 'loc-b',
            targetLocationId: 'loc-a',
            quantity: 4,
          }),
        }),
      );
      expect(prisma.stockMovement.delete).not.toHaveBeenCalled();
    });

    it('cancel transfer con movimenti per riga: rimuove i movimenti collegati invece di crearne di nuovi', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr-pl',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        reference: 'TR-2026-0005',
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
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
            documentId: 'doc-tr-pl',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.sourceLineId === null) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'mov-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              locationId: 'loc-a',
              targetLocationId: 'loc-b',
              quantity: 4,
              sourceLineId: 'l1',
              createdAt: new Date(),
            },
          ]);
        },
      );
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-tr-pl');

      expect(prisma.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      // Storno: +4 all'origine, -4 alla destinazione.
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-a' }),
          data: expect.objectContaining({ onHand: { increment: 4 } }),
        }),
      );
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-b' }),
          data: expect.objectContaining({ onHand: { increment: -4 } }),
        }),
      );
    });

    it('cancel adjustment con movimenti per riga: rimuove i movimenti collegati invece di crearne di nuovi', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      const doc = {
        id: 'doc-ret-pl',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        reference: 'RET-2026-0002',
        locationId: 'loc-1',
        adjustmentDirection: 'increase',
        internalComment: 'Conteggio',
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
            quantity: 6,
            loadsStock: true,
            description: 'x',
            unitPriceMinor: 0,
            discountPercent: 0,
            lineTotalMinor: 0,
            documentId: 'doc-ret-pl',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.sourceLineId === null) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'mov-1',
              variantId: 'var-1',
              sku: 'SKU-1',
              locationId: 'loc-1',
              quantity: 6,
              direction: 'increase',
              sourceLineId: 'l1',
              createdAt: new Date(),
            },
          ]);
        },
      );
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.inventoryLevel.upsert.mockResolvedValue({});
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.update.mockResolvedValue({ ...doc, status: DocumentStatus.cancelled });

      await service.cancel(tenantId, 'doc-ret-pl');

      expect(prisma.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationId: 'loc-1' }),
          data: expect.objectContaining({ onHand: { increment: -6 } }),
        }),
      );
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

    it('goods_receipt: il PATCH generico viene rifiutato anche in bozza (percorso unico)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt }),
      );
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-draft',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });

      await expect(
        service.update(tenantId, 'doc-gr-draft', { internalComment: 'nota' }),
      ).rejects.toThrowError(/Salva documento/);
      expect(prisma.document.update).not.toHaveBeenCalled();
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
        testOwnerUser({ id: 'user-1', displayName: 'Mario' }),
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

      // Deroga prompt Scarico manuale: riconciliazione a delta diretto
      // (2 → 4 scarica solo -2) SENZA creare movimenti.
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1', locationId: 'loc-1' }),
          data: { onHand: { increment: -2 }, available: { increment: -2 } },
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

    it('rifiuta PATCH con righe se un trasferimento ha già movimenti per riga (bypass generico, mirror arrivo merce)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-tr-lines',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        notes: null,
        internalComment: null,
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Almeno un movimento con sourceLineId: mirror del gate arrivo merce,
      // type-agnostico su documents.service.ts (§ verifica esplicita).
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-tr-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 0,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('rifiuta PATCH con righe se una rettifica ha già movimenti per riga (bypass generico, mirror arrivo merce)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.adjustment }));
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-ret-lines',
        tenantId,
        type: DocumentType.adjustment,
        status: DocumentStatus.confirmed,
        lines: [],
        series: 'A',
        documentDate: new Date('2026-01-01'),
        currency: 'EUR',
        supplierId: null,
        customerId: null,
        locationId: 'loc-1',
        targetLocationId: null,
        adjustmentDirection: 'increase',
        notes: null,
        internalComment: 'Conteggio',
        externalDocNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.update(tenantId, 'doc-ret-lines', {
          lines: [
            {
              description: 'Riga',
              sku: 'SKU-1',
              quantity: 2,
              unitPriceMinor: 0,
              loadsStock: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('trasferimento con movimenti per riga esistenti: PATCH senza righe non riconcilia in modo aggregato', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      const doc = {
        id: 'doc-tr-hdr',
        tenantId,
        type: DocumentType.transfer,
        status: DocumentStatus.confirmed,
        series: 'A',
        year: 2026,
        reference: 'TR-2026-0003',
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
            lineTotalMinor: 0,
            loadsStock: true,
            documentId: 'doc-tr-hdr',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(doc)
        .mockResolvedValueOnce({ ...doc, blockAfterConfirm: false });
      // Il documento ha già movimenti per riga (creati da confirm() o dal
      // salvataggio dedicato): il PATCH generico, pur senza righe, NON deve
      // ri-generare movimenti aggregati.
      prisma.stockMovement.count.mockResolvedValue(1);
      prisma.documentRevision.findFirst.mockResolvedValue(null);
      prisma.document.update.mockResolvedValue({ ...doc, internalComment: 'nuova nota interna' });

      await service.update(tenantId, 'doc-tr-hdr', { internalComment: 'nuova nota interna' });

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('percorso unico arrivo merce (guard su update/confirm)', () => {
    it('update rifiuta i tipi a workflow dedicato anche in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });

      await expect(
        service.update(tenantId, 'doc-gr-1', { internalComment: 'x' }),
      ).rejects.toThrowError(/Salva documento/);
    });

    it('confirm rifiuta i tipi a workflow dedicato anche in bozza', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-1',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.draft,
        lines: [{ id: 'l1', lineNumber: 1, quantity: 1, loadsStock: true, variantId: 'var-1' }],
      });

      await expect(service.confirm(tenantId, 'doc-gr-1')).rejects.toThrowError(/Salva documento/);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
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

    it('rifiuta con ForbiddenException l’apertura diretta di un documento su una sede non autorizzata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-2',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        locationId: 'loc-9',
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-gr-2', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('consente l’apertura diretta sulla sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-gr-3',
        tenantId,
        type: DocumentType.goods_receipt,
        status: DocumentStatus.confirmed,
        locationId: 'loc-1',
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-gr-3', clerk)).resolves.toMatchObject({
        id: 'doc-gr-3',
      });
    });

    it('non applica alcun controllo location per documenti senza locationId (es. fattura)', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-inv-1',
        tenantId,
        type: DocumentType.invoice_draft,
        status: DocumentStatus.confirmed,
        locationId: null,
        lines: [],
        salesOrder: null,
        supplierOrder: null,
      });
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(service.getById(tenantId, 'doc-inv-1', clerk)).resolves.toMatchObject({
        id: 'doc-inv-1',
      });
    });
  });

  describe('enforcement location sulle mutazioni (utente multi-sede)', () => {
    // Clerk con view_all_locations: può LEGGERE ogni sede (getById passa) ma
    // non scrivere fuori dalle sedi assegnate → isola il gate di scrittura.
    const clerkViewAll = () =>
      testClerkUser({
        assignedLocationIds: ['loc-A'],
        permissions: [TenantPermission.InventoryManage, TenantPermission.InventoryViewAllLocations],
      });

    const docInLocB = (overrides: Record<string, unknown> = {}) => ({
      id: 'doc-b',
      tenantId,
      type: DocumentType.sales_ddt,
      status: DocumentStatus.draft,
      locationId: 'loc-B',
      targetLocationId: null,
      lines: [],
      salesOrder: null,
      supplierOrder: null,
      ...overrides,
    });

    it('update rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(
        service.update(tenantId, 'doc-b', { internalComment: 'x' }, clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('confirm rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          lines: [{ id: 'l1', lineNumber: 1, variantId: 'var-1', quantity: 1, loadsStock: true }],
        }),
      );

      await expect(service.confirm(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('cancel rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB({ status: DocumentStatus.confirmed }));

      await expect(service.cancel(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('delete rifiuta con 403 un documento di una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(service.delete(tenantId, 'doc-b', clerkViewAll())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });

    it('convert rifiuta con 403 una proforma di una sede non assegnata', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.proforma }));
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          type: DocumentType.proforma,
          lines: [{ id: 'l1', lineNumber: 1, quantity: 1, unitPriceMinor: 100 }],
        }),
      );

      await expect(
        service.convert(tenantId, 'doc-b', { targetType: DocumentType.sales_ddt }, clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('registerExternal (transizione di stato) rifiuta con 403 una sede non assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB({ status: DocumentStatus.confirmed }));

      await expect(
        service.registerExternal(tenantId, 'doc-b', {}, clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('listRevisions rifiuta con 403 un documento di una sede non autorizzata in lettura', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());
      const clerk = testClerkUser({ assignedLocationIds: ['loc-A'] });

      await expect(service.listRevisions(tenantId, 'doc-b', clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.documentRevision.findMany).not.toHaveBeenCalled();
    });

    it('assertWritableById rifiuta con 403 la sede fuori scope e passa sulla sede assegnata', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValue(docInLocB());

      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      prisma.document.findFirst.mockResolvedValue(docInLocB({ locationId: 'loc-A' }));
      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).resolves.toMatchObject({ id: 'doc-b' });
    });

    it('trasferimento: la destinazione fuori dalle sedi assegnate resta consentita (transferDestination)', async () => {
      const { service } = createService(prisma, resolvedSetting({ type: DocumentType.transfer }));
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({
          type: DocumentType.transfer,
          locationId: 'loc-A',
          targetLocationId: 'loc-B',
        }),
      );

      await expect(
        service.assertWritableById(tenantId, 'doc-b', clerkViewAll()),
      ).resolves.toMatchObject({ id: 'doc-b' });
    });

    it('non blocca le mutazioni dei documenti senza sede (es. bozza fattura)', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.invoice_draft }),
      );
      prisma.document.findFirst.mockResolvedValue(
        docInLocB({ type: DocumentType.invoice_draft, locationId: null }),
      );
      prisma.document.delete.mockResolvedValue({ id: 'doc-b' });

      await service.delete(tenantId, 'doc-b', clerkViewAll());

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-b' } });
    });
  });

  describe('previewNextReference', () => {
    it('calcola anteprima come massimo esistente + 1, senza scrivere nulla', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({
          type: DocumentType.goods_receipt,
          numberPrefix: 'CAR',
          defaultSeries: 'A',
        }),
      );
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 44 } });

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
      // L'anteprima non consuma il numero: nessuna scrittura.
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('usa 1 come primo numero se la serie è ancora vuota', async () => {
      const { service } = createService(
        prisma,
        resolvedSetting({ type: DocumentType.goods_receipt, numberPrefix: 'CAR' }),
      );
      prisma.document.aggregate.mockResolvedValue({ _max: { number: null } });

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

  describe('duplicateDocument', () => {
    it('lancia NotFoundException se il documento originale non esiste', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValueOnce(null);

      await expect(service.duplicateDocument(tenantId, 'doc-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rifiuta la duplicazione di vendite/resi negozio (flusso cassa)', async () => {
      const { service } = createService(prisma);
      prisma.document.findFirst.mockResolvedValueOnce({
        id: 'doc-store',
        type: DocumentType.store_sale,
        lines: [],
      });

      await expect(service.duplicateDocument(tenantId, 'doc-store')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it(
      'crea una bozza indipendente: nuova data, nessun numero/riferimento copiato, ' +
        'nessun collegamento a ordine fornitore, nessun movimento di magazzino',
      async () => {
        const { service } = createService(
          prisma,
          resolvedSetting({ type: DocumentType.goods_receipt, printTitle: 'Arrivo merce' }),
        );
        prisma.document.findFirst.mockResolvedValueOnce({
          id: 'doc-orig',
          type: DocumentType.goods_receipt,
          status: DocumentStatus.confirmed,
          series: 'A',
          number: 12,
          reference: 'CAR-2025-0012',
          year: 2025,
          documentDate: new Date('2025-01-05'),
          printTitle: 'Arrivo merce',
          notes: null,
          internalComment: null,
          supplierId: 'sup-1',
          supplierName: 'Fornitore SRL',
          customerId: null,
          customerName: null,
          locationId: 'loc-1',
          targetLocationId: null,
          adjustmentDirection: null,
          externalDocNumber: '145',
          externalDocDate: new Date('2025-01-04'),
          externalDocumentTypeId: 'edt-1',
          externalDocumentTypeSnapshot: 'DDT',
          billingCause: null,
          causalText: 'DDT 145 del 04/01/2025',
          causalGenerationMode: 'auto',
          causalTemplateSnapshot: 'DDT {numero} del {data}',
          currency: 'EUR',
          subtotalMinor: 10000,
          taxMinor: 2200,
          totalMinor: 12200,
          documentDiscountPercent: 0,
          pricesIncludeVat: false,
          purchaseCostEntryMode: 'vat_excluded',
          supplierOrderId: 'so-1',
          sourceDocumentId: null,
          onlineSaleId: null,
          externalRef: 'ext-ref-1',
          lines: [
            {
              id: 'line-1',
              lineNumber: 1,
              variantId: 'var-1',
              sku: 'SKU-1',
              description: 'Maglia',
              quantity: 5,
              unitPriceMinor: 2000,
              discountPercent: 0,
              lineTotalMinor: 10000,
              vatCodeId: 'vat-1',
              vatSnapshot: { code: '22' },
              enteredUnitCost: null,
              costEntryModeSnapshot: null,
              unitCostNet: null,
              unitCostGross: null,
              unitVatAmount: null,
              lineVatTotalMinor: 2200,
              lineGrossTotalMinor: 12200,
              supplierPayableLineMinor: 12200,
              reverseChargeVatMinor: 0,
              nonDeductibleVatMinor: 0,
              loadsStock: true,
              supplierOrderLineId: 'sol-1',
              lotCode: null,
              lotExpiryDate: null,
              serialNumbers: [],
              linkedGoodsReceiptId: null,
            },
          ],
        });
        prisma.document.create.mockResolvedValue({ id: 'doc-copy', lines: [] });

        const user = { id: 'user-1', displayName: 'Mario Rossi' } as unknown as Parameters<
          typeof service.duplicateDocument
        >[2];

        await service.duplicateDocument(tenantId, 'doc-orig', user);

        const data = prisma.document.create.mock.calls[0]![0]!.data;
        expect(data.status).toBe(DocumentStatus.draft);
        // Nessun numero/riferimento copiato: verranno assegnati al salvataggio/conferma.
        expect(data.number).toBeUndefined();
        expect(data.reference).toBeUndefined();
        // Nessun collegamento all'originale.
        expect(data.supplierOrderId).toBeUndefined();
        expect(data.sourceDocumentId).toBeUndefined();
        expect(data.onlineSaleId).toBeUndefined();
        expect(data.externalRef).toBeUndefined();
        // Testata copiata.
        expect(data.supplierId).toBe('sup-1');
        expect(data.locationId).toBe('loc-1');
        expect(data.subtotalMinor).toBe(10000);
        expect(data.totalMinor).toBe(12200);
        expect(data.createdByName).toBe('Mario Rossi');
        // Data documento = oggi, non quella dell'originale (2025-01-05).
        const today = new Date().toISOString().slice(0, 10);
        expect((data.documentDate as Date).toISOString().slice(0, 10)).toBe(today);
        // Righe clonate senza collegamento a ordine fornitore / arrivo riepilogato.
        expect(data.lines.create).toHaveLength(1);
        expect(data.lines.create[0]).toMatchObject({
          variantId: 'var-1',
          quantity: 5,
          lineTotalMinor: 10000,
        });
        expect(data.lines.create[0].supplierOrderLineId).toBeUndefined();
        expect(data.lines.create[0].linkedGoodsReceiptId).toBeUndefined();
        // Nessun movimento di magazzino generato dalla duplicazione stessa.
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      },
    );
  });
});
