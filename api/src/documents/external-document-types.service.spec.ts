import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
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
    goodsReceiptCausal: { count: vi.fn().mockResolvedValue(0) },
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
      const seeded = prisma.externalDocumentType.createMany.mock.calls[0][0].data;
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
      const data = prisma.externalDocumentType.create.mock.calls[0][0].data;
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
    it('disattiva un tipo mantenendolo in tabella (mai eliminato)', async () => {
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

  describe('delete (§6)', () => {
    it('elimina un tipo mai utilizzato', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });
      prisma.document.count.mockResolvedValue(0);
      prisma.goodsReceiptCausal.count.mockResolvedValue(0);

      await service.delete(tenantId, 'type-1');

      expect(prisma.externalDocumentType.delete).toHaveBeenCalledWith({
        where: { id: 'type-1' },
      });
    });

    it('rifiuta la cancellazione di un tipo usato in un documento (caso 6)', async () => {
      prisma.externalDocumentType.findFirst.mockResolvedValue({ id: 'type-1', tenantId });
      prisma.document.count.mockResolvedValue(2);

      await expect(service.delete(tenantId, 'type-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.externalDocumentType.delete).not.toHaveBeenCalled();
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
