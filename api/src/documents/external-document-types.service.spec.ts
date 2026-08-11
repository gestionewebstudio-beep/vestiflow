import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ExternalDocumentTypesService } from './external-document-types.service';

const tenantId = 'tenant-1';

function createPrismaMock() {
  const prisma = {
    externalDocumentType: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    document: { count: vi.fn().mockResolvedValue(0) },
    salesOrder: { count: vi.fn().mockResolvedValue(0) },
    supplierOrder: { count: vi.fn().mockResolvedValue(0) },
    goodsReceiptCausal: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new ExternalDocumentTypesService(prisma as unknown as PrismaService);
}

describe('ExternalDocumentTypesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: ExternalDocumentTypesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = createService(prisma);
  });

  describe('list', () => {
    it('al primo accesso semina i tipi di sistema DDT, Fattura, Reso (§17)', async () => {
      prisma.externalDocumentType.count.mockResolvedValue(0);

      await service.list(tenantId);

      expect(prisma.externalDocumentType.createMany).toHaveBeenCalledTimes(1);
      const seeded = prisma.externalDocumentType.createMany.mock.calls[0]![0]!.data;
      expect(seeded.map((t: { name: string }) => t.name)).toEqual(['DDT', 'Fattura', 'Reso']);
      expect(seeded.every((t: { isSystem: boolean }) => t.isSystem)).toBe(true);
      expect(seeded[0].causalTemplate).toBe('DDT {numero} del {data}');
      expect(seeded[1].causalTemplate).toBe('Fatt. {numero} del {data}');
    });

    it('con tipi già presenti non risemina', async () => {
      prisma.externalDocumentType.count.mockResolvedValue(3);

      await service.list(tenantId);

      expect(prisma.externalDocumentType.createMany).not.toHaveBeenCalled();
    });
  });

  describe('create (caso 5)', () => {
    it('crea un tipo personalizzato con template e sort_order progressivo', async () => {
      await service.create(tenantId, {
        name: 'Bolla doganale',
        shortLabel: 'Bolla doganale',
        causalTemplate: 'Bolla doganale {numero} del {data}',
      });

      expect(prisma.externalDocumentType.create).toHaveBeenCalledTimes(1);
      const data = prisma.externalDocumentType.create.mock.calls[0]![0]!.data;
      expect(data).toMatchObject({
        tenantId,
        name: 'Bolla doganale',
        causalTemplate: 'Bolla doganale {numero} del {data}',
        isSystem: false,
        isActive: true,
        sortOrder: 4,
      });
    });

    it('rifiuta nomi duplicati senza distinguere maiuscole/minuscole (§6)', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', name: 'DDT' });

      await expect(service.create(tenantId, { name: 'ddt' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rifiuta nome vuoto', async () => {
      await expect(service.create(tenantId, { name: '   ' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('update (casi 6 e 9)', () => {
    it('disattiva un tipo lasciandolo nel pannello, riattivabile', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({
        id: 'type-1',
        tenantId,
        name: 'Nota di consegna',
      });

      await service.update(tenantId, 'type-1', { isActive: false });

      expect(prisma.externalDocumentType.update).toHaveBeenCalledWith({
        where: { id: 'type-1' },
        data: { isActive: false },
      });
      expect(prisma.externalDocumentType.delete).not.toHaveBeenCalled();
    });

    it('rinomina senza toccare i documenti (lo storico vive nello snapshot)', async () => {
      prisma.externalDocumentType.findFirst
        .mockResolvedValueOnce({ id: 'type-1', tenantId, name: 'Conto visione' })
        .mockResolvedValueOnce(null);

      await service.update(tenantId, 'type-1', { name: 'Documento conto visione' });

      expect(prisma.externalDocumentType.update).toHaveBeenCalledWith({
        where: { id: 'type-1' },
        data: { name: 'Documento conto visione' },
      });
    });
  });

  describe('delete', () => {
    it('elimina davvero un tipo che nessun documento porta', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });

      await service.delete(tenantId, 'type-1');

      expect(prisma.externalDocumentType.delete).toHaveBeenCalledWith({
        where: { id: 'type-1' },
      });
      expect(prisma.externalDocumentType.update).not.toHaveBeenCalled();
    });

    it('un tipo gia’ usato resta in tabella: sparisce dalle tendine, non dai documenti', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });
      prisma.document.count.mockResolvedValue(2);

      await service.delete(tenantId, 'type-1');

      expect(prisma.externalDocumentType.delete).not.toHaveBeenCalled();
      const update = prisma.externalDocumentType.update.mock.calls[0]![0]!;
      expect(update.where).toEqual({ id: 'type-1' });
      expect(update.data.isActive).toBe(false);
      // `deletedAt` valorizzato = fuori anche dal pannello di gestione, che e'
      // cio' che distingue «eliminato» da «disattivato».
      expect(update.data.deletedAt).toBeInstanceOf(Date);
    });

    it('conta anche gli ordini cliente e fornitore, non i soli documenti', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });
      prisma.document.count.mockResolvedValue(0);
      prisma.salesOrder.count.mockResolvedValue(0);
      prisma.supplierOrder.count.mockResolvedValue(1);

      await service.delete(tenantId, 'type-1');

      expect(prisma.externalDocumentType.delete).not.toHaveBeenCalled();
      expect(prisma.externalDocumentType.update).toHaveBeenCalledTimes(1);
    });

    it('scollega le causali: senza, resterebbero a proporre il modello di un tipo che non c’e’ piu’', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });
      prisma.document.count.mockResolvedValue(5);

      await service.delete(tenantId, 'type-1');

      expect(prisma.goodsReceiptCausal.updateMany).toHaveBeenCalledWith({
        where: { tenantId, externalDocumentTypeId: 'type-1' },
        data: { externalDocumentTypeId: null },
      });
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('vede anche i tipi eliminati: e’ la lettura del salvataggio', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({
        id: 'type-1',
        tenantId,
        deletedAt: new Date('2026-08-10T10:00:00.000Z'),
      });

      const found = await service.findByIdIncludingDeleted(tenantId, 'type-1');

      expect(found).not.toBeNull();
      // Nessun filtro `deletedAt: null`: e' tutta la differenza con `getById`.
      expect(prisma.externalDocumentType.findFirst).toHaveBeenCalledWith({
        where: { id: 'type-1', tenantId },
      });
    });
  });

  describe('resolveForWrite', () => {
    it('scrive sempre id e snapshot insieme, e lo snapshot e’ lo shortLabel', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({
        id: 'type-1',
        tenantId,
        name: 'Documento di trasporto',
        shortLabel: 'DDT',
      });

      const resolved = await service.resolveForWrite(tenantId, 'type-1');

      expect(resolved).toEqual({
        externalDocumentTypeId: 'type-1',
        externalDocumentTypeSnapshot: 'DDT',
      });
    });

    it('risolve un tipo ELIMINATO senza lamentarsi: riaprire un vecchio documento non e’ un errore', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({
        id: 'type-1',
        tenantId,
        name: 'Bolla doganale',
        shortLabel: 'Bolla',
        deletedAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      await expect(service.resolveForWrite(tenantId, 'type-1')).resolves.toEqual({
        externalDocumentTypeId: 'type-1',
        externalDocumentTypeSnapshot: 'Bolla',
      });
    });

    it('senza id azzera la coppia', async () => {
      await expect(service.resolveForWrite(tenantId, null)).resolves.toEqual({
        externalDocumentTypeId: null,
        externalDocumentTypeSnapshot: null,
      });
      expect(prisma.externalDocumentType.findFirst).not.toHaveBeenCalled();
    });

    it('un id sconosciuto e’ un 404, non un silenzioso null', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue(null);

      await expect(service.resolveForWrite(tenantId, 'ignoto')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reorder (§6)', () => {
    it('riassegna sort_order secondo la sequenza fornita, ignorando id estranei', async () => {
      prisma.externalDocumentType.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);

      await service.reorder(tenantId, ['c', 'a', 'sconosciuto', 'b']);

      const updates = prisma.externalDocumentType.update.mock.calls.map((call) => call[0]);
      expect(updates).toEqual([
        { where: { id: 'c' }, data: { sortOrder: 1 } },
        { where: { id: 'a' }, data: { sortOrder: 2 } },
        { where: { id: 'b' }, data: { sortOrder: 3 } },
      ]);
    });
  });
});
