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
      update: vi.fn(),
      delete: vi.fn(),
    },
    document: {
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      count: vi.fn().mockResolvedValue(0),
    },
    location: {
      findFirst: vi.fn().mockResolvedValue({ id: locationId }),
    },
  };
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
    it('calcola il prossimo numero come max+1 e conta i documenti che lo usano', async () => {
      prisma.documentCounter.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.invoice_draft,
          series: 'A',
          locationId: null,
          location: null,
        },
      ]);
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 41 } });
      prisma.document.count.mockResolvedValue(41);

      const view = (await service.list(tenantId))[0]!;

      expect(view.nextNumber).toBe(42);
      expect(view.documentCount).toBe(41);
      expect(view.locationName).toBeNull();
    });

    it('la Fattura accompagnatoria condivide il numeratore della Fattura', async () => {
      prisma.documentCounter.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.invoice_accompanying,
          series: 'A',
          locationId: null,
          location: null,
        },
      ]);

      await service.list(tenantId);

      // documentNumberingType mappa invoice_accompanying → invoice_draft.
      const where = prisma.document.aggregate.mock.calls[0]![0]!.where;
      expect(where.type).toBe(DocumentType.invoice_draft);
    });

    it('un contatore con location filtra max+1 su quella sede', async () => {
      prisma.documentCounter.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.sales_ddt,
          series: 'MI',
          locationId,
          location: { name: 'Milano' },
        },
      ]);

      const view = (await service.list(tenantId))[0]!;

      const where = prisma.document.aggregate.mock.calls[0]![0]!.where;
      expect(where.locationId).toBe(locationId);
      expect(view.locationName).toBe('Milano');
    });
  });

  describe('create', () => {
    it('crea un contatore valido normalizzando la serie', async () => {
      prisma.documentCounter.create.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'A',
        locationId: null,
        location: null,
      });

      await service.create(tenantId, {
        type: DocumentType.quote,
        series: '  A  ',
        locationId: null,
      });

      const data = prisma.documentCounter.create.mock.calls[0]![0]!.data;
      expect(data.series).toBe('A');
      expect(data.locationId).toBeNull();
    });

    it('rifiuta un tipo senza numerazione configurabile (ordine fornitore)', async () => {
      await expect(
        service.create(tenantId, {
          type: DocumentType.supplier_order,
          series: 'A',
          locationId: null,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.documentCounter.create).not.toHaveBeenCalled();
    });

    it('rifiuta una serie vuota dopo il trim', async () => {
      await expect(
        service.create(tenantId, { type: DocumentType.quote, series: '   ', locationId: null }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta una location non del tenant', async () => {
      prisma.location.findFirst.mockResolvedValue(null);
      await expect(
        service.create(tenantId, { type: DocumentType.sales_ddt, series: 'MI', locationId }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta un duplicato (stessa tripla tipo/serie/location)', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(tenantId, { type: DocumentType.quote, series: 'A', locationId: null }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('sposta l’identità e ricontrolla il duplicato escludendo se stesso', async () => {
      prisma.documentCounter.findFirst
        .mockResolvedValueOnce({
          id: 'c1',
          tenantId,
          type: DocumentType.quote,
          series: 'A',
          locationId: null,
        })
        .mockResolvedValueOnce(null);
      prisma.documentCounter.update.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'B',
        locationId: null,
        location: null,
      });

      await service.update(tenantId, 'c1', { series: 'B' });

      const dupWhere = prisma.documentCounter.findFirst.mock.calls[1]![0]!.where;
      expect(dupWhere.series).toBe('B');
      expect(dupWhere.id).toEqual({ not: 'c1' });
      const data = prisma.documentCounter.update.mock.calls[0]![0]!.data;
      expect(data.series).toBe('B');
    });
  });

  describe('delete', () => {
    it('elimina il contatore senza toccare i documenti', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({ id: 'c1', tenantId });
      await service.delete(tenantId, 'c1');
      expect(prisma.documentCounter.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});
