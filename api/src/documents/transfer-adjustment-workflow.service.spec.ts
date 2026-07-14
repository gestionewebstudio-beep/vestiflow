import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { AdjustmentDirection, DocumentStatus, DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransferAdjustmentWorkflowService } from './transfer-adjustment-workflow.service';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import type { DocumentSettingsService } from './document-settings.service';
import type { SaveAdjustmentDto } from './dto/save-adjustment.dto';
import type { SaveTransferDto } from './dto/save-transfer.dto';

const tenantId = 'tenant-1';

function createPrismaMock() {
  const prisma = {
    document: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    documentLine: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
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
      deleteMany: vi.fn(),
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
    location: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([{ id: variantId }]),
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

function createService(prisma: ReturnType<typeof createPrismaMock>, settingOverrides = {}) {
  const settings = {
    getResolved: vi.fn().mockResolvedValue({
      enabled: true,
      blockAfterConfirm: false,
      ...settingOverrides,
    }),
  };
  const channelSync = { pushInventoryLevels: vi.fn().mockResolvedValue(undefined) };
  const service = new TransferAdjustmentWorkflowService(
    prisma as unknown as PrismaService,
    settings as unknown as DocumentSettingsService,
    channelSync as unknown as ChannelSyncFacade,
  );
  return { service, settings, channelSync };
}

function existingTransferDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-tr',
    tenantId,
    type: DocumentType.transfer,
    status: DocumentStatus.confirmed,
    number: 2,
    reference: 'TR-2026-0002',
    locationId: 'loc-a',
    targetLocationId: 'loc-b',
    notes: null,
    internalComment: null,
    lines: [],
    ...overrides,
  };
}

function existingAdjustmentDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-ret',
    tenantId,
    type: DocumentType.adjustment,
    status: DocumentStatus.confirmed,
    number: 1,
    reference: 'RET-2026-0001',
    locationId: 'loc-1',
    adjustmentDirection: AdjustmentDirection.increase,
    notes: null,
    internalComment: 'Conteggio',
    lines: [],
    ...overrides,
  };
}

const lineId = '22222222-2222-4222-8222-222222222222';
const variantId = '11111111-1111-4111-8111-111111111111';

function transferDto(overrides: Partial<SaveTransferDto> = {}): SaveTransferDto {
  return {
    id: 'doc-tr',
    documentDate: '2026-07-13',
    locationId: 'loc-a',
    targetLocationId: 'loc-b',
    lines: [
      {
        variantId,
        sku: 'SKU-1',
        description: 'Maglia',
        quantity: 8,
        loadsStock: true,
      },
    ],
    ...overrides,
  } as SaveTransferDto;
}

function adjustmentDto(overrides: Partial<SaveAdjustmentDto> = {}): SaveAdjustmentDto {
  return {
    id: 'doc-ret',
    documentDate: '2026-07-13',
    locationId: 'loc-1',
    adjustmentDirection: AdjustmentDirection.increase,
    internalComment: 'Conteggio',
    lines: [
      {
        variantId,
        sku: 'SKU-1',
        description: 'Maglia',
        quantity: 8,
        loadsStock: true,
      },
    ],
    ...overrides,
  } as SaveAdjustmentDto;
}

describe('TransferAdjustmentWorkflowService.saveTransfer', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('rifiuta se origine e destinazione coincidono', async () => {
    const { service } = createService(prisma);

    await expect(
      service.saveTransfer(tenantId, transferDto({ targetLocationId: 'loc-a' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rifiuta se il documento non esiste', async () => {
    const { service } = createService(prisma);
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(service.saveTransfer(tenantId, transferDto())).rejects.toThrow();
  });

  it('rifiuta se il documento è ancora in bozza (nessun movimento da preservare)', async () => {
    const { service } = createService(prisma);
    prisma.document.findFirst.mockResolvedValue(
      existingTransferDocument({ status: DocumentStatus.draft }),
    );

    await expect(service.saveTransfer(tenantId, transferDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rifiuta se il documento è annullato', async () => {
    const { service } = createService(prisma);
    prisma.document.findFirst.mockResolvedValue(
      existingTransferDocument({ status: DocumentStatus.cancelled }),
    );

    await expect(service.saveTransfer(tenantId, transferDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('upsert riga per id: la riga esistente viene aggiornata, mai duplicata', async () => {
    const { service } = createService(prisma);
    const existing = existingTransferDocument({
      lines: [
        {
          id: lineId,
          lineNumber: 1,
          variantId,
          sku: 'SKU-1',
          quantity: 5,
          loadsStock: true,
        },
      ],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);
    prisma.documentLine.findMany.mockResolvedValue([
      { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 8, loadsStock: true },
    ]);

    await service.saveTransfer(
      tenantId,
      transferDto({ lines: [{ id: lineId, variantId, sku: 'SKU-1', description: 'Maglia', quantity: 8, loadsStock: true }] }),
    );

    expect(prisma.documentLine.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentLine.update.mock.calls[0]?.[0].where).toEqual({ id: lineId });
    expect(prisma.documentLine.create).not.toHaveBeenCalled();
    const deleteWhere = prisma.documentLine.deleteMany.mock.calls[0]?.[0].where;
    expect(deleteWhere.id.notIn).toContain(lineId);

    // Movimento per riga creato con sourceLineId (nessuno esistente ancora).
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = prisma.stockMovement.create.mock.calls[0]?.[0].data;
    expect(created.sourceLineId).toBe(lineId);
    expect(created.type).toBe('transfer');
    expect(created.locationId).toBe('loc-a');
    expect(created.targetLocationId).toBe('loc-b');
    expect(created.quantity).toBe(8);
  });

  it('riga esistente collegata a un movimento: lo aggiorna invece di duplicarlo', async () => {
    const { service } = createService(prisma);
    const existing = existingTransferDocument({
      lines: [
        { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 5, loadsStock: true },
      ],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);
    prisma.documentLine.findMany.mockResolvedValue([
      { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 8, loadsStock: true },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 'mov-1',
        variantId,
        sku: 'SKU-1',
        locationId: 'loc-a',
        targetLocationId: 'loc-b',
        quantity: 5,
        sourceLineId: lineId,
        createdAt: new Date('2026-07-01'),
      },
    ]);

    await service.saveTransfer(
      tenantId,
      transferDto({
        lines: [
          { id: lineId, variantId, sku: 'SKU-1', description: 'Maglia', quantity: 8, loadsStock: true },
        ],
      }),
    );

    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    expect(prisma.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(prisma.stockMovement.update.mock.calls[0]?.[0].where).toEqual({ id: 'mov-1' });
    expect(prisma.stockMovement.update.mock.calls[0]?.[0].data.quantity).toBe(8);
  });

  describe('enforcement location (N sedi per utente)', () => {
    function setupExisting(prisma: ReturnType<typeof createPrismaMock>) {
      const existing = existingTransferDocument({
        lines: [
          { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 5, loadsStock: true },
        ],
      });
      prisma.document.findFirst.mockResolvedValue(existing);
      prisma.document.findFirstOrThrow.mockResolvedValue(existing);
      prisma.documentLine.findMany.mockResolvedValue([
        { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 8, loadsStock: true },
      ]);
      return existing;
    }

    it('titolare può trasferire tra qualunque coppia di sedi del tenant', async () => {
      const { service } = createService(prisma);
      setupExisting(prisma);

      await expect(
        service.saveTransfer(tenantId, transferDto(), testOwnerUser()),
      ).resolves.toMatchObject({ id: 'doc-tr' });
    });

    it('utente con la sola sede origine assegnata può trasferire verso una destinazione licenziata qualunque', async () => {
      const { service } = createService(prisma);
      setupExisting(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-a'] });

      await expect(
        service.saveTransfer(tenantId, transferDto(), clerk),
      ).resolves.toMatchObject({ id: 'doc-tr' });
    });

    it('riceve 403 se la sede origine non è tra quelle assegnate', async () => {
      const { service } = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-b'] });

      await expect(service.saveTransfer(tenantId, transferDto(), clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('utente senza alcuna sede assegnata non può salvare trasferimenti', async () => {
      const { service } = createService(prisma);
      const clerk = testClerkUser({ hasAllLocationsAccess: false, assignedLocationIds: [] });

      await expect(service.saveTransfer(tenantId, transferDto(), clerk)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocca la modifica se la sede origine ATTUALE del documento è fuori scope', async () => {
      const { service } = createService(prisma);
      setupExisting(prisma);
      // Assegnato solo alla nuova destinazione desiderata, non alla loc-a
      // (origine attuale del documento esistente).
      const clerk = testClerkUser({ assignedLocationIds: ['loc-c'] });

      await expect(
        service.saveTransfer(tenantId, transferDto({ locationId: 'loc-c', targetLocationId: 'loc-d' }), clerk),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('TransferAdjustmentWorkflowService.saveAdjustment', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('rifiuta senza motivo (commento interno obbligatorio)', async () => {
    const { service } = createService(prisma);

    await expect(
      service.saveAdjustment(tenantId, adjustmentDto({ internalComment: '  ' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rifiuta se il documento è ancora in bozza', async () => {
    const { service } = createService(prisma);
    prisma.document.findFirst.mockResolvedValue(
      existingAdjustmentDocument({ status: DocumentStatus.draft }),
    );

    await expect(service.saveAdjustment(tenantId, adjustmentDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('crea un movimento per riga con sourceLineId e direzione di testata', async () => {
    const { service } = createService(prisma);
    const existing = existingAdjustmentDocument({
      lines: [
        { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 5, loadsStock: true },
      ],
    });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);
    prisma.documentLine.findMany.mockResolvedValue([
      { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 8, loadsStock: true },
    ]);

    await service.saveAdjustment(
      tenantId,
      adjustmentDto({
        lines: [
          { id: lineId, variantId, sku: 'SKU-1', description: 'Maglia', quantity: 8, loadsStock: true },
        ],
      }),
    );

    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = prisma.stockMovement.create.mock.calls[0]?.[0].data;
    expect(created.sourceLineId).toBe(lineId);
    expect(created.type).toBe('adjustment');
    expect(created.direction).toBe('increase');
    expect(created.locationId).toBe('loc-1');
    expect(created.quantity).toBe(8);
  });

  it('due righe con la stessa variante producono due movimenti distinti', async () => {
    const { service } = createService(prisma);
    const existing = existingAdjustmentDocument({ lines: [] });
    prisma.document.findFirst.mockResolvedValue(existing);
    prisma.document.findFirstOrThrow.mockResolvedValue(existing);
    prisma.documentLine.findMany.mockResolvedValue([
      { id: 'l1', lineNumber: 1, variantId, sku: 'SKU-1', quantity: 3, loadsStock: true },
      { id: 'l2', lineNumber: 2, variantId, sku: 'SKU-1', quantity: 4, loadsStock: true },
    ]);

    await service.saveAdjustment(
      tenantId,
      adjustmentDto({
        lines: [
          { variantId, sku: 'SKU-1', description: 'Maglia', quantity: 3, loadsStock: true },
          { variantId, sku: 'SKU-1', description: 'Maglia', quantity: 4, loadsStock: true },
        ],
      }),
    );

    expect(prisma.documentLine.create).toHaveBeenCalledTimes(2);
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  describe('enforcement location (N sedi per utente)', () => {
    function setupExisting(prisma: ReturnType<typeof createPrismaMock>) {
      const existing = existingAdjustmentDocument({
        lines: [
          { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 5, loadsStock: true },
        ],
      });
      prisma.document.findFirst.mockResolvedValue(existing);
      prisma.document.findFirstOrThrow.mockResolvedValue(existing);
      prisma.documentLine.findMany.mockResolvedValue([
        { id: lineId, lineNumber: 1, variantId, sku: 'SKU-1', quantity: 8, loadsStock: true },
      ]);
      return existing;
    }

    it('titolare può rettificare qualunque sede del tenant', async () => {
      const { service } = createService(prisma);
      setupExisting(prisma);

      await expect(
        service.saveAdjustment(tenantId, adjustmentDto(), testOwnerUser()),
      ).resolves.toMatchObject({ id: 'doc-ret' });
    });

    it('utente con la sede assegnata può rettificare quella sede', async () => {
      const { service } = createService(prisma);
      setupExisting(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });

      await expect(
        service.saveAdjustment(tenantId, adjustmentDto(), clerk),
      ).resolves.toMatchObject({ id: 'doc-ret' });
    });

    it('riceve 403 su una sede diversa da quella assegnata', async () => {
      const { service } = createService(prisma);
      const clerk = testClerkUser({ assignedLocationIds: ['loc-2'] });

      await expect(
        service.saveAdjustment(tenantId, adjustmentDto({ locationId: 'loc-1' }), clerk),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('utente senza alcuna sede assegnata non può salvare rettifiche', async () => {
      const { service } = createService(prisma);
      const clerk = testClerkUser({ hasAllLocationsAccess: false, assignedLocationIds: [] });

      await expect(
        service.saveAdjustment(tenantId, adjustmentDto(), clerk),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
