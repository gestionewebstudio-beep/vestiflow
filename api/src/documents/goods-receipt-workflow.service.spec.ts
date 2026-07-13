import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoodsReceiptWorkflowService } from './goods-receipt-workflow.service';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import type { DocumentSettingsService } from './document-settings.service';
import type { ExternalDocumentTypesService } from './external-document-types.service';
import type { VatCodesService } from '../vat/vat-codes.service';
import type { SaveGoodsReceiptDto } from './dto/save-goods-receipt.dto';

const tenantId = 'tenant-1';

function createPrismaMock() {
  const prisma = {
    document: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    documentLine: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    documentSequence: {
      upsert: vi.fn().mockResolvedValue({ lastNumber: 7 }),
    },
    documentRevision: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    stockMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryLevel: {
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    inventorySerial: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    inventoryLot: { upsert: vi.fn() },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([{ id: 'var-1' }]),
      updateMany: vi.fn(),
    },
    supplier: { findFirst: vi.fn().mockResolvedValue({ id: 'sup-1', name: 'Fornitore A' }) },
    location: { findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }) },
    vatCode: { findMany: vi.fn().mockResolvedValue([]) },
    tenantFeatureSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    supplierVariantLink: { findUnique: vi.fn(), upsert: vi.fn() },
    purchaseInvoiceGoodsReceiptLink: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
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

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const settings = {
    getResolved: vi.fn().mockResolvedValue({
      type: DocumentType.goods_receipt,
      enabled: true,
      printTitle: 'Arrivo merce',
      autoNumbering: true,
      numberPrefix: 'AM',
      defaultSeries: 'A',
      blockAfterConfirm: false,
      pricesIncludeVat: false,
      defaultNotes: null,
    }),
  };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const externalTypes = { getById: vi.fn() };
  const vatCodes = { buildSnapshot: vi.fn().mockReturnValue({}) };
  const service = new GoodsReceiptWorkflowService(
    prisma as unknown as PrismaService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
    externalTypes as unknown as ExternalDocumentTypesService,
    vatCodes as unknown as VatCodesService,
  );
  return { service, settings, channelSync };
}

function baseDto(overrides: Partial<SaveGoodsReceiptDto> = {}): SaveGoodsReceiptDto {
  return {
    type: DocumentType.goods_receipt,
    documentDate: '2026-07-13',
    supplierId: 'sup-1',
    locationId: 'loc-1',
    ...overrides,
  } as SaveGoodsReceiptDto;
}

function savedDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    tenantId,
    type: DocumentType.goods_receipt,
    status: DocumentStatus.confirmed,
    number: 7,
    reference: 'AM-2026-0007',
    subtotalMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
    lines: [],
    ...overrides,
  };
}

describe('GoodsReceiptWorkflowService.saveGoodsReceipt', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('salva la sola testata (AM-001): documento creato senza righe né movimenti', async () => {
    const { service } = createService(prisma);
    prisma.document.create.mockResolvedValue(savedDocument());
    prisma.document.findFirstOrThrow.mockResolvedValue(savedDocument());

    const result = await service.saveGoodsReceipt(tenantId, baseDto());

    expect(prisma.document.create).toHaveBeenCalledTimes(1);
    const created = prisma.document.create.mock.calls[0]?.[0].data;
    expect(created.status).toBe(DocumentStatus.confirmed);
    expect(created.number).toBe(7);
    expect(created.subtotalMinor).toBe(0);
    expect(prisma.documentLine.create).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    expect(result.id).toBe('doc-1');
  });

  it('richiede il fornitore per i tipi arrivo merce', async () => {
    const { service } = createService(prisma);

    await expect(
      service.saveGoodsReceipt(tenantId, baseDto({ supplierId: undefined })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('richiede la location quando ci sono righe che caricano magazzino', async () => {
    const { service } = createService(prisma);

    await expect(
      service.saveGoodsReceipt(
        tenantId,
        baseDto({
          locationId: undefined,
          lines: [
            {
              variantId: '11111111-1111-4111-8111-111111111111',
              description: 'Maglia',
              quantity: 2,
              unitPriceMinor: 1000,
              loadsStock: true,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rifiuta righe con carico magazzino senza articolo collegato', async () => {
    const { service } = createService(prisma);

    await expect(
      service.saveGoodsReceipt(
        tenantId,
        baseDto({
          lines: [
            {
              description: 'Riga senza articolo',
              quantity: 2,
              unitPriceMinor: 1000,
              loadsStock: true,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('accetta righe economiche senza articolo se loadsStock è false (AM-013)', async () => {
    const { service } = createService(prisma);
    const doc = savedDocument();
    prisma.document.create.mockResolvedValue(doc);
    prisma.document.findFirstOrThrow.mockResolvedValue(doc);
    prisma.documentLine.findMany.mockResolvedValue([]);

    await service.saveGoodsReceipt(
      tenantId,
      baseDto({
        lines: [
          {
            description: 'Trasporto',
            quantity: 1,
            unitPriceMinor: 1500,
            loadsStock: false,
          },
        ],
      }),
    );

    expect(prisma.documentLine.create).toHaveBeenCalledTimes(1);
    const lineData = prisma.documentLine.create.mock.calls[0]?.[0].data;
    expect(lineData.loadsStock).toBe(false);
    expect(lineData.variantId).toBeNull();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('upsert righe per id: la riga esistente viene aggiornata, mai duplicata (AM-016)', async () => {
    const { service } = createService(prisma);
    const lineId = '22222222-2222-4222-8222-222222222222';
    const existing = savedDocument({
      lines: [
        {
          id: lineId,
          lineNumber: 1,
          variantId: '11111111-1111-4111-8111-111111111111',
          sku: 'SKU-1',
          description: 'Maglia',
          quantity: 5,
          unitPriceMinor: 1000,
          discountPercent: 0,
          lineTotalMinor: 5000,
          loadsStock: true,
        },
      ],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.update.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);

    await service.saveGoodsReceipt(
      tenantId,
      baseDto({
        id: 'doc-1',
        lines: [
          {
            id: lineId,
            variantId: '11111111-1111-4111-8111-111111111111',
            sku: 'SKU-1',
            description: 'Maglia',
            quantity: 8,
            unitPriceMinor: 1000,
            loadsStock: true,
          },
        ],
      }),
    );

    expect(prisma.documentLine.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentLine.update.mock.calls[0]?.[0].where).toEqual({ id: lineId });
    expect(prisma.documentLine.create).not.toHaveBeenCalled();
    // deleteMany preserva la riga inviata (id nel notIn).
    const deleteWhere = prisma.documentLine.deleteMany.mock.calls[0]?.[0].where;
    expect(deleteWhere.id.notIn).toContain(lineId);
  });

  it('rifiuta Codici IVA inattivi o riservati alle vendite (§9)', async () => {
    const { service } = createService(prisma);
    const inactiveVatId = '33333333-3333-4333-8333-333333333333';
    prisma.vatCode.findMany.mockResolvedValue([
      {
        id: inactiveVatId,
        code: '22',
        isActive: false,
        usageScope: 'both',
        nature: null,
      },
    ]);

    await expect(
      service.saveGoodsReceipt(
        tenantId,
        baseDto({
          lines: [
            {
              description: 'Riga',
              quantity: 1,
              unitPriceMinor: 1000,
              loadsStock: false,
              vatCodeId: inactiveVatId,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    prisma.vatCode.findMany.mockResolvedValue([
      {
        id: inactiveVatId,
        code: 'V22',
        isActive: true,
        usageScope: 'sales',
        nature: null,
      },
    ]);
    await expect(
      service.saveGoodsReceipt(
        tenantId,
        baseDto({
          lines: [
            {
              description: 'Riga',
              quantity: 1,
              unitPriceMinor: 1000,
              loadsStock: false,
              vatCodeId: inactiveVatId,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('marca "Totali da verificare" sul collegamento fattura quando i totali cambiano (§15)', async () => {
    const { service } = createService(prisma);
    const existing = savedDocument({
      subtotalMinor: 10000,
      taxMinor: 2200,
      totalMinor: 12200,
      lines: [],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.update.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);

    await service.saveGoodsReceipt(
      tenantId,
      baseDto({
        id: 'doc-1',
        lines: [
          {
            description: 'Trasporto',
            quantity: 1,
            unitPriceMinor: 1500,
            loadsStock: false,
          },
        ],
      }),
    );

    expect(prisma.purchaseInvoiceGoodsReceiptLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ goodsReceiptId: 'doc-1' }),
        data: { totalsCheckPending: true },
      }),
    );
  });

  it('NON marca il collegamento se i totali non cambiano', async () => {
    const { service } = createService(prisma);
    const existing = savedDocument({
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      lines: [],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.update.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);

    await service.saveGoodsReceipt(tenantId, baseDto({ id: 'doc-1' }));

    expect(prisma.purchaseInvoiceGoodsReceiptLink.updateMany).not.toHaveBeenCalled();
  });
});
