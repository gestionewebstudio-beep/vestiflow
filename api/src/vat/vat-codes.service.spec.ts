import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { VAT_CODE_SEED, VAT_NATURE_SEED } from './vat-code-seed.data';
import { VatCodesService } from './vat-codes.service';

const tenantId = 'tenant-1';

/** Righe Natura coerenti col seed reale, con id stabili per key. */
const NATURE_ROWS = VAT_NATURE_SEED.map((nature, index) => ({
  id: `nature-${index}`,
  key: nature.key,
  officialCode: nature.officialCode,
  label: nature.label,
  description: nature.description,
  defaultUsageScope: nature.defaultUsageScope,
  defaultCalculationMode: nature.defaultCalculationMode,
  sortOrder: nature.sortOrder,
  isSystem: true,
  isActive: true,
}));

function createPrismaMock() {
  const prisma = {
    vatCode: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    vatNature: {
      count: vi.fn().mockResolvedValue(NATURE_ROWS.length),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue(NATURE_ROWS),
    },
    tenantFeatureSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    documentLine: { count: vi.fn().mockResolvedValue(0) },
    product: { count: vi.fn().mockResolvedValue(0) },
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

function createService(prisma: ReturnType<typeof createPrismaMock>): VatCodesService {
  return new VatCodesService(prisma as unknown as PrismaService);
}

function vatCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vc-1',
    tenantId,
    code: '22',
    natureId: 'nature-0',
    ratePercent: 22,
    nonDeductiblePercent: 0,
    description: 'Imponibile 22%',
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isDefault: false,
    isActive: true,
    isSystem: false,
    sortOrder: 1,
    deletedAt: null,
    nature: NATURE_ROWS[0],
    ...overrides,
  };
}

describe('VatCodesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: VatCodesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = createService(prisma);
  });

  describe('create', () => {
    it('crea un codice valido con sortOrder incrementale', async () => {
      prisma.vatCode.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
      const created = vatCodeRow({ id: 'vc-new', sortOrder: 4 });
      prisma.vatCode.create.mockResolvedValue(created);

      const result = await service.create(tenantId, {
        code: '22',
        natureId: 'nature-0',
        ratePercent: 22,
        description: 'Imponibile 22%',
      });

      expect(result).toBe(created);
      expect(prisma.vatCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, code: '22', sortOrder: 4, isSystem: false }),
        }),
      );
    });

    it('rifiuta un codice con caratteri non ammessi', async () => {
      await expect(
        service.create(tenantId, {
          code: 'ha spazi!',
          natureId: 'nature-0',
          ratePercent: 22,
          description: 'x',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it("rifiuta un'aliquota fuori range (0-100)", async () => {
      await expect(
        service.create(tenantId, {
          code: 'X1',
          natureId: 'nature-0',
          ratePercent: 120,
          description: 'x',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta una percentuale indetraibile fuori range', async () => {
      await expect(
        service.create(tenantId, {
          code: 'X1',
          natureId: 'nature-0',
          ratePercent: 22,
          nonDeductiblePercent: -1,
          description: 'x',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta una descrizione vuota', async () => {
      await expect(
        service.create(tenantId, {
          code: 'X1',
          natureId: 'nature-0',
          ratePercent: 22,
          description: '   ',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta un codice duplicato per lo stesso tenant (case-insensitive)', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow({ code: '22' }));
      await expect(
        service.create(tenantId, {
          code: '22',
          natureId: 'nature-0',
          ratePercent: 22,
          description: 'x',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('azzera il predefinito precedente quando isDefault è true (§5.3, unicità)', async () => {
      const created = vatCodeRow({ id: 'vc-2', code: 'X2', isDefault: true });
      prisma.vatCode.create.mockResolvedValue(created);

      await service.create(tenantId, {
        code: 'X2',
        natureId: 'nature-0',
        ratePercent: 10,
        description: 'x',
        isDefault: true,
      });

      expect(prisma.vatCode.updateMany).toHaveBeenCalledWith({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('update', () => {
    it('impedisce di togliere isDefault senza un altro predefinito', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow({ isDefault: true }));
      await expect(
        service.update(tenantId, 'vc-1', { isDefault: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('impedisce di disattivare il Codice IVA predefinito', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow({ isDefault: true }));
      await expect(
        service.update(tenantId, 'vc-1', { isActive: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('aggiorna i campi forniti e restituisce il codice aggiornato', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow());
      prisma.vatCode.update.mockResolvedValue(vatCodeRow({ description: 'Nuova descrizione' }));

      const result = await service.update(tenantId, 'vc-1', { description: 'Nuova descrizione' });

      expect(result.description).toBe('Nuova descrizione');
      expect(prisma.vatCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vc-1' },
          data: expect.objectContaining({ description: 'Nuova descrizione' }),
        }),
      );
    });

    it('lancia NotFoundException se il codice non esiste per il tenant', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(null);
      await expect(service.update(tenantId, 'missing', { description: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('verifica la disponibilità del nuovo codice solo se cambia', async () => {
      prisma.vatCode.findFirst
        .mockResolvedValueOnce(vatCodeRow({ code: '22' })) // getById
        .mockResolvedValueOnce(null); // assertCodeAvailable per il nuovo codice
      prisma.vatCode.update.mockResolvedValue(vatCodeRow({ code: '22R' }));

      await service.update(tenantId, 'vc-1', { code: '22R' });

      expect(prisma.vatCode.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('duplicate', () => {
    it('duplica una voce esistente con un nuovo codice, mai come predefinito', async () => {
      prisma.vatCode.findFirst.mockResolvedValueOnce(vatCodeRow({ isDefault: true })); // getById (source)
      prisma.vatCode.findFirst.mockResolvedValueOnce(null); // assertCodeAvailable per il duplicato
      const duplicated = vatCodeRow({ id: 'vc-dup', code: '22-BIS', isDefault: false });
      prisma.vatCode.create.mockResolvedValue(duplicated);

      const result = await service.duplicate(tenantId, 'vc-1', '22-BIS');

      expect(result).toBe(duplicated);
      expect(prisma.vatCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: '22-BIS', isDefault: false }),
        }),
      );
    });
  });

  describe('reorder', () => {
    it('riordina solo gli id noti al tenant, ignorando gli altri', async () => {
      prisma.vatCode.findMany.mockResolvedValue([
        vatCodeRow({ id: 'vc-1' }),
        vatCodeRow({ id: 'vc-2' }),
      ]);

      await service.reorder(tenantId, ['vc-2', 'unknown-id', 'vc-1']);

      expect(prisma.vatCode.update).toHaveBeenCalledTimes(2);
      expect(prisma.vatCode.update).toHaveBeenCalledWith({
        where: { id: 'vc-2' },
        data: { sortOrder: 1 },
      });
      expect(prisma.vatCode.update).toHaveBeenCalledWith({
        where: { id: 'vc-1' },
        data: { sortOrder: 2 },
      });
    });
  });

  describe('delete', () => {
    it('blocca l\'eliminazione del Codice IVA predefinito', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow({ isDefault: true }));
      await expect(service.delete(tenantId, 'vc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocca l\'eliminazione se usato in una riga documento', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow());
      prisma.documentLine.count.mockResolvedValue(1);
      await expect(service.delete(tenantId, 'vc-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.vatCode.delete).not.toHaveBeenCalled();
    });

    it('blocca l\'eliminazione se assegnato come predefinito su articoli', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow());
      prisma.documentLine.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(2);
      await expect(service.delete(tenantId, 'vc-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.vatCode.delete).not.toHaveBeenCalled();
    });

    it('elimina un Codice IVA mai utilizzato', async () => {
      prisma.vatCode.findFirst.mockResolvedValue(vatCodeRow());
      prisma.documentLine.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(0);

      await service.delete(tenantId, 'vc-1');

      expect(prisma.vatCode.delete).toHaveBeenCalledWith({ where: { id: 'vc-1' } });
    });
  });

  describe('getDefault', () => {
    it('restituisce il Codice IVA esplicitamente predefinito e attivo', async () => {
      prisma.vatCode.count.mockResolvedValue(1); // seedIfEmpty: già popolato, skip seed
      prisma.vatCode.findFirst.mockResolvedValueOnce(vatCodeRow({ id: 'vc-default', isDefault: true }));

      const result = await service.getDefault(tenantId);

      expect(result?.id).toBe('vc-default');
    });

    it('ricade sul primo Codice IVA attivo se nessun predefinito esplicito', async () => {
      prisma.vatCode.count.mockResolvedValue(1);
      prisma.vatCode.findFirst
        .mockResolvedValueOnce(null) // nessun predefinito esplicito attivo
        .mockResolvedValueOnce(vatCodeRow({ id: 'vc-fallback' })); // primo attivo per sortOrder

      const result = await service.getDefault(tenantId);

      expect(result?.id).toBe('vc-fallback');
    });

    it('restituisce null se il tenant non ha alcun Codice IVA attivo', async () => {
      prisma.vatCode.count.mockResolvedValue(1);
      prisma.vatCode.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await service.getDefault(tenantId);

      expect(result).toBeNull();
    });
  });

  describe('list + seedIfEmpty (§4)', () => {
    it('non seeda se il tenant ha già Codici IVA', async () => {
      prisma.vatCode.count.mockResolvedValue(3);

      await service.list(tenantId);

      expect(prisma.vatCode.createMany).not.toHaveBeenCalled();
    });

    it('seeda le voci IVA standard per un tenant senza Codici IVA', async () => {
      prisma.vatCode.count.mockResolvedValue(0);
      // Dopo il seed, la ricerca del preferito "22" standard.
      prisma.vatCode.findFirst.mockResolvedValueOnce(vatCodeRow({ id: 'vc-22', code: '22' }));

      await service.list(tenantId);

      expect(prisma.vatCode.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining(
            VAT_CODE_SEED.map((entry) =>
              expect.objectContaining({ tenantId, code: entry.code, ratePercent: entry.ratePercent }),
            ),
          ),
        }),
      );
      // Marca "22" come predefinito e allinea le impostazioni tenant.
      expect(prisma.vatCode.update).toHaveBeenCalledWith({
        where: { id: 'vc-22' },
        data: { isDefault: true },
      });
      expect(prisma.tenantFeatureSettings.updateMany).toHaveBeenCalledWith({
        where: { tenantId, defaultVatCodeId: null },
        data: { defaultVatCodeId: 'vc-22' },
      });
    });

    it('seeda anche il catalogo Nature se ancora vuoto', async () => {
      prisma.vatCode.count.mockResolvedValue(0);
      prisma.vatNature.count.mockResolvedValue(0);
      prisma.vatNature.findMany.mockResolvedValue(NATURE_ROWS);
      prisma.vatCode.findFirst.mockResolvedValue(null);

      await service.list(tenantId);

      expect(prisma.vatNature.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining(
            VAT_NATURE_SEED.map((entry) => expect.objectContaining({ key: entry.key })),
          ),
          skipDuplicates: true,
        }),
      );
    });
  });

  describe('buildSnapshot', () => {
    it('congela codice, natura e aliquota nello snapshot (§9)', () => {
      const vatCode = vatCodeRow({ ratePercent: 22, nonDeductiblePercent: 0 });
      const snapshot = service.buildSnapshot(vatCode as never);

      expect(snapshot).toEqual({
        code: '22',
        natureKey: NATURE_ROWS[0]!.key,
        natureLabel: NATURE_ROWS[0]!.label,
        officialCode: NATURE_ROWS[0]!.officialCode,
        ratePercent: 22,
        description: 'Imponibile 22%',
        notes: null,
        nonDeductiblePercent: 0,
        calculationMode: 'standard',
        vatAffectsSupplierTotal: true,
      });
    });
  });
});
