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

/**
 * ⭐ **La predefinita: zero o una, e «nessuna» è uno stato valido.**
 *
 * ⛔ Il vincolo vero sta nel database — l'indice parziale
 * `unit_of_measure_options_tenant_default_key`, la stessa forma dei Codici IVA.
 * Queste prove guardano che il servizio non gli vada contro: sceglierne una
 * DEVE spegnere l'altra nello stesso atto, o la scrittura viene rifiutata.
 */
describe('UnitOfMeasureOptionsService — la predefinita', () => {
  const corrente = { id: 'um-1', tenantId, name: 'kg', isDefault: false };

  function creaServizio() {
    const tx = {
      unitOfMeasureOption: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ ...corrente, isDefault: true }),
      },
    };
    const prisma = {
      unitOfMeasureOption: {
        // ⚠️ Fedele: `getById` cerca per id, il controllo di omonimia cerca per
        //   NOME. Un mock che risponde sempre farebbe credere a un duplicato a
        //   ogni rinomina — ed e’ il modo in cui un test fallisce raccontando
        //   la cosa sbagliata.
        findFirst: vi.fn((args?: { where?: { id?: string } }) =>
          Promise.resolve(args?.where?.id ? corrente : null),
        ),
        update: vi.fn().mockResolvedValue({ ...corrente, isDefault: false }),
      },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return {
      tx,
      prisma,
      service: new UnitOfMeasureOptionsService(prisma as unknown as PrismaService),
    };
  }

  it('⛔ sceglierne una SPEGNE l’altra, e nello stesso atto', async () => {
    // ⚠️ Senza questo, l'indice parziale rifiuta la scrittura: non è una
    //   cortesia verso l'interfaccia, è la condizione perché il salvataggio
    //   riesca.
    const { service, prisma, tx } = creaServizio();

    await service.update(tenantId, 'um-1', { isDefault: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.unitOfMeasureOption.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId, isDefault: true }),
        data: { isDefault: false },
      }),
    );
    expect(tx.unitOfMeasureOption.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    );
  });

  it('⭐ togliere la predefinita NON tocca nessun’altra voce', async () => {
    // «Nessuna predefinita» è uno stato valido e voluto: chi ha articoli misti
    // non deve cambiarla ogni volta.
    const { service, prisma } = creaServizio();

    await service.update(tenantId, 'um-1', { isDefault: false });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.unitOfMeasureOption.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }),
    );
  });

  it('⭐ rinominare senza toccare la predefinita non apre nessuna transazione', async () => {
    const { service, prisma } = creaServizio();

    await service.update(tenantId, 'um-1', { name: 'chilogrammi' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.unitOfMeasureOption.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'chilogrammi' } }),
    );
  });
});
