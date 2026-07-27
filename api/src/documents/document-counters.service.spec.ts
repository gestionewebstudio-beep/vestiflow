import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { DocumentCountersService } from './document-counters.service';

const tenantId = 'tenant-1';
const locationId = '11111111-1111-4111-8111-111111111111';

function createPrismaMock() {
  const prisma = {
    documentCounter: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
    },
    document: {
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      count: vi.fn().mockResolvedValue(0),
    },
    location: {
      findFirst: vi.fn().mockResolvedValue({ id: locationId }),
    },
    $transaction: vi.fn(),
  };
  // La transazione esegue la callback con lo stesso mock (client = tx).
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new DocumentCountersService(prisma as unknown as PrismaService);
}

describe('DocumentCountersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: DocumentCountersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = createService(prisma);
  });

  describe('list', () => {
    it('semina un contatore predefinito senza serie per i tipi scoperti', async () => {
      // Nessun contatore esistente → seed di tutti i tipi configurabili.
      prisma.documentCounter.findMany
        .mockResolvedValueOnce([]) // distinct types (seedDefaults)
        .mockResolvedValueOnce([]); // findMany finale
      await service.list(tenantId);

      expect(prisma.documentCounter.createMany).toHaveBeenCalledTimes(1);
      const seeded = prisma.documentCounter.createMany.mock.calls[0]![0]!.data;
      expect(seeded.length).toBeGreaterThan(0);
      expect(
        seeded.every(
          (row: { series: null; isDefault: boolean }) => row.series === null && row.isDefault,
        ),
      ).toBe(true);
    });

    it('calcola il prossimo numero come max+1 su (tipo, serie), senza anno né sede', async () => {
      prisma.documentCounter.findMany
        .mockResolvedValueOnce([{ type: DocumentType.invoice_draft }]) // distinct (già coperto)
        .mockResolvedValueOnce([
          {
            id: 'c1',
            tenantId,
            type: DocumentType.invoice_draft,
            series: '2026',
            locationId: null,
            isDefault: true,
            location: null,
          },
        ]);
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 41 } });

      const view = (await service.list(tenantId))[0]!;

      expect(view.nextNumber).toBe(42);
      expect(view.series).toBe('2026');
      expect(view.isDefault).toBe(true);
      const where = prisma.document.aggregate.mock.calls[0]![0]!.where;
      expect(where).not.toHaveProperty('year');
      expect(where).not.toHaveProperty('locationId');
    });

    it('senza serie il filtro usa series null', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.quote,
          series: null,
          locationId: null,
          isDefault: true,
          location: null,
        },
      ]);
      await service.list(tenantId);
      const where = prisma.document.aggregate.mock.calls[0]![0]!.where;
      expect(where.series).toBeNull();
    });
  });

  describe('create', () => {
    it('crea con serie normalizzata (trim)', async () => {
      prisma.documentCounter.create.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'NAP',
        locationId: null,
        isDefault: false,
        location: null,
      });

      await service.create(tenantId, { type: DocumentType.quote, series: '  NAP  ' });

      const data = prisma.documentCounter.create.mock.calls[0]![0]!.data;
      expect(data.series).toBe('NAP');
    });

    it('serie vuota → senza serie (null)', async () => {
      prisma.documentCounter.create.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: null,
        locationId: null,
        isDefault: false,
        location: null,
      });

      await service.create(tenantId, { type: DocumentType.quote, series: '   ' });

      const data = prisma.documentCounter.create.mock.calls[0]![0]!.data;
      expect(data.series).toBeNull();
    });

    it('marcando predefinito azzera gli altri predefiniti del tipo', async () => {
      prisma.documentCounter.create.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'A',
        locationId: null,
        isDefault: true,
        location: null,
      });

      await service.create(tenantId, { type: DocumentType.quote, series: 'A', isDefault: true });

      expect(prisma.documentCounter.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, type: DocumentType.quote, isDefault: true }),
          data: { isDefault: false },
        }),
      );
    });

    it('rifiuta un tipo senza numerazione configurabile', async () => {
      await expect(
        service.create(tenantId, { type: DocumentType.invoice_accompanying, series: 'A' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta un duplicato di serie per lo stesso tipo', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(tenantId, { type: DocumentType.quote, series: 'A' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rifiuta una location non del tenant', async () => {
      prisma.location.findFirst.mockResolvedValue(null);
      await expect(
        service.create(tenantId, { type: DocumentType.quote, series: 'MI', locationId }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('available', () => {
    it('propone il predefinito e include i contatori senza sede + quelli della sede', async () => {
      prisma.documentCounter.findMany
        .mockResolvedValueOnce([{ type: DocumentType.sales_ddt }]) // seed distinct (già coperto)
        .mockResolvedValueOnce([
          {
            id: 'def',
            tenantId,
            type: DocumentType.sales_ddt,
            series: null,
            locationId: null,
            isDefault: true,
            location: null,
          },
          {
            id: 'mi',
            tenantId,
            type: DocumentType.sales_ddt,
            series: 'MI',
            locationId,
            isDefault: false,
            location: { name: 'Milano' },
          },
        ]);

      const result = await service.available(tenantId, DocumentType.sales_ddt, locationId);

      expect(result.counters.map((c) => c.id)).toEqual(['def', 'mi']);
      expect(result.proposedCounterId).toBe('def');
      const where = prisma.documentCounter.findMany.mock.calls[1]![0]!.where;
      expect(where.OR).toEqual([{ locationId: null }, { locationId }]);
    });

    it('senza predefinito e con un solo contatore, propone quello', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'solo',
          tenantId,
          type: DocumentType.quote,
          series: null,
          locationId: null,
          isDefault: false,
          location: null,
        },
      ]);

      const result = await service.available(tenantId, DocumentType.quote, null);

      expect(result.proposedCounterId).toBe('solo');
    });

    it('senza predefinito e con più contatori, non propone niente', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'a',
          tenantId,
          type: DocumentType.quote,
          series: 'A',
          locationId: null,
          isDefault: false,
          location: null,
        },
        {
          id: 'b',
          tenantId,
          type: DocumentType.quote,
          series: 'B',
          locationId: null,
          isDefault: false,
          location: null,
        },
      ]);

      const result = await service.available(tenantId, DocumentType.quote, null);

      expect(result.proposedCounterId).toBeNull();
    });
  });

  describe('delete', () => {
    it('elimina qualunque contatore senza guardie', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({ id: 'c1', tenantId });
      await service.delete(tenantId, 'c1');
      expect(prisma.documentCounter.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});
