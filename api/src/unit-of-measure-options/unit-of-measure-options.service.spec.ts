import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { UNIT_OF_MEASURE_SEED } from './unit-of-measure-seed.data';
import { UnitOfMeasureOptionsService } from './unit-of-measure-options.service';

const tenantId = 'tenant-1';

function createPrismaMock() {
  return {
    unitOfMeasureOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'um-1', name: 'mazzo' }),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({ id: 'um-1' }),
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('UnitOfMeasureOptionsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: UnitOfMeasureOptionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UnitOfMeasureOptionsService(prisma as unknown as PrismaService);
  });

  it('al primo accesso semina le unità comuni', async () => {
    prisma.unitOfMeasureOption.count.mockResolvedValue(0);

    await service.list(tenantId);

    expect(prisma.unitOfMeasureOption.createMany).toHaveBeenCalledWith({
      data: UNIT_OF_MEASURE_SEED.map((name, index) => ({
        tenantId,
        name,
        sortOrder: index + 1,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  });

  it('a elenco già popolato non semina niente', async () => {
    prisma.unitOfMeasureOption.count.mockResolvedValue(6);

    await service.list(tenantId);

    expect(prisma.unitOfMeasureOption.createMany).not.toHaveBeenCalled();
  });

  it('il nome si pulisce e prende il posto in coda', async () => {
    await service.create(tenantId, '  mazzo  ');

    expect(prisma.unitOfMeasureOption.create).toHaveBeenCalledWith({
      data: { tenantId, name: 'mazzo', sortOrder: 4 },
    });
  });

  it('un nome vuoto non passa', async () => {
    await expect(service.create(tenantId, '   ')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('due unità con lo stesso nome non convivono, nemmeno con maiuscole diverse', async () => {
    prisma.unitOfMeasureOption.findFirst.mockResolvedValue({ id: 'um-9' });

    await expect(service.create(tenantId, 'PZ')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.unitOfMeasureOption.findFirst).toHaveBeenCalledWith({
      where: { tenantId, name: { equals: 'PZ', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  // È la differenza con i codici IVA, e vale la pena che un test la fermi: qui
  // non c'è nessuna chiave esterna da proteggere, quindi nessuna guardia da
  // superare. Chi copierà questo servizio da un altro non deve aggiungerne una
  // «per simmetria»: il valore sulla riga è una stringa, e resta scritto.
  it('si elimina senza guardie: le righe portano la stringa, non un riferimento', async () => {
    prisma.unitOfMeasureOption.findFirst.mockResolvedValue({ id: 'um-1', tenantId, name: 'pz' });

    await service.delete(tenantId, 'um-1');

    expect(prisma.unitOfMeasureOption.delete).toHaveBeenCalledWith({ where: { id: 'um-1' } });
  });
});
