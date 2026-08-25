import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import {
  DocumentCountersService,
  MISSING_NUMBERS_PREVIEW,
  findMissingNumbers,
} from './document-counters.service';

const tenantId = 'tenant-1';
const locationId = '11111111-1111-4111-8111-111111111111';

function createPrismaMock() {
  const prisma = {
    /**
     * Secondo passo della regola del §2 («primo libero > m»): l'unico pezzo in
     * SQL grezzo, e qui risponde **`m + 1`** — il caso senza buchi. La ricerca
     * del buco ha i suoi test in `document-numbering.util.spec.ts`.
     *
     * `m` non si configura: si legge dall'ultimo aggregato risolto, che è quello
     * che il primo passo ha appena chiamato. Così i test restano scritti su una
     * cosa sola — il massimo — invece di doverne configurare due per ogni caso,
     * e il filtro per data resta osservabile sul `where` dell'aggregato.
     */
    $queryRaw: vi.fn(async (): Promise<{ libero: number }[]> => {
      const aggregati = [prisma.document, prisma.salesOrder, prisma.supplierOrder];
      const risultati = aggregati.flatMap((tabella) => tabella.aggregate.mock.results);
      const ultimo = risultati.at(-1);
      const massimo =
        ultimo && ultimo.type === 'return'
          ? (((await ultimo.value) as { _max?: { number: number | null } })._max?.number ?? 0)
          : 0;
      return [{ libero: massimo + 1 }];
    }),
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
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesOrder: {
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    supplierOrder: {
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
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

describe('findMissingNumbers (buchi nella serie)', () => {
  it('serie vuota: nessun buco', () => {
    expect(findMissingNumbers([])).toEqual({ missingCount: 0, missingNumbers: [] });
  });

  it('serie contigua dal primo numero: nessun buco', () => {
    expect(findMissingNumbers([1, 2, 3, 4])).toEqual({ missingCount: 0, missingNumbers: [] });
  });

  it('un solo numero assegnato: nessun buco', () => {
    expect(findMissingNumbers([1])).toEqual({ missingCount: 0, missingNumbers: [] });
  });

  it('buco in mezzo: lo conta e lo elenca', () => {
    expect(findMissingNumbers([1, 2, 4, 5])).toEqual({ missingCount: 1, missingNumbers: [3] });
  });

  it('più buchi, contati dal primo numero usato', () => {
    // I buchi sono il 5, il 7 e l'8. L'1, il 2 e il 3 NON sono buchi: la serie
    // non li ha mai avuti — comincia dal 4.
    expect(findMissingNumbers([4, 6, 9])).toEqual({
      missingCount: 3,
      missingNumbers: [5, 7, 8],
    });
  });

  // Chi migra da un altro gestionale riprende la numerazione in corso: una serie
  // che parte da 143 non ha 142 buchi, ne ha zero. Contarli sarebbe un invito a
  // riusare numeri mai emessi, che su una serie di fatture è un errore.
  it('una serie che non parte da 1 non ha buchi per questo', () => {
    expect(findMissingNumbers([143, 144, 145])).toEqual({
      missingCount: 0,
      missingNumbers: [],
    });
  });

  it('numeri non contigui in coda: il massimo chiude la finestra', () => {
    // Il buco arriva fino a 39 perché il 40 esiste; oltre il 40 non si conta
    // nulla — il progressivo riparte da lì, non ci sono numeri «liberi» dopo.
    expect(findMissingNumbers([1, 2, 40])).toEqual({
      missingCount: 37,
      missingNumbers: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
  });

  it('elenca al più i primi `limit`, ma li conta tutti', () => {
    const { missingCount, missingNumbers } = findMissingNumbers([1, 500]);
    expect(missingCount).toBe(498);
    expect(missingNumbers).toHaveLength(MISSING_NUMBERS_PREVIEW);
    expect(missingNumbers[0]).toBe(2);
  });

  it('rispetta un limite esplicito', () => {
    // Buchi fra 1 e 9: 2..8, cioè sette. L'elenco si ferma a due.
    expect(findMissingNumbers([1, 9], 2)).toEqual({ missingCount: 7, missingNumbers: [2, 3] });
  });

  it('ordine di arrivo, duplicati e valori non validi non contano', () => {
    expect(findMissingNumbers([5, 1, null, 5, 0, -3, 2])).toEqual({
      missingCount: 2,
      missingNumbers: [3, 4],
    });
  });
});

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
        .mockResolvedValueOnce([{ type: DocumentType.invoice }]) // distinct (già coperto)
        .mockResolvedValueOnce([
          {
            id: 'c1',
            tenantId,
            type: DocumentType.invoice,
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

    it('espone i buchi della serie, letti dalla stessa partizione del numero', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.invoice_accompanying,
          series: null,
          locationId: null,
          isDefault: true,
          location: null,
        },
      ]);
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 5 } });
      prisma.document.findMany.mockResolvedValue([
        { number: 1 },
        { number: 2 },
        { number: 4 },
        { number: 5 },
      ]);

      const view = (await service.list(tenantId))[0]!;

      expect(view.missingCount).toBe(1);
      expect(view.missingNumbers).toEqual([3]);
      // Accompagnatoria e Nota di credito numerano sotto la Fattura, e la
      // colonna `type` porta il tipo GREZZO: la lettura deve prendere TUTTI E
      // TRE i tipi. Con la sola uguaglianza sul tipo-numeratore vedrebbe un
      // terzo della partizione, e i numeri già presi risulterebbero liberi.
      const where = prisma.document.findMany.mock.calls[0]![0]!.where;
      expect(where.type).toEqual({
        in: [
          DocumentType.invoice,
          DocumentType.invoice_accompanying,
          DocumentType.credit_note,
        ],
      });
      expect(where.series).toBeNull();
    });

    it('serie senza numeri: nessuna lettura dei numeri, nessun buco', async () => {
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: null } });

      const view = (await service.list(tenantId))[0]!;

      expect(view.missingCount).toBe(0);
      expect(view.missingNumbers).toEqual([]);
      expect(prisma.document.findMany).not.toHaveBeenCalled();
    });

    it('gli ordini fornitore leggono i numeri dalla propria tabella', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.supplier_order,
          series: 'A',
          locationId: null,
          isDefault: true,
          location: null,
        },
      ]);
      prisma.supplierOrder.aggregate.mockResolvedValue({ _max: { number: 3 } });
      prisma.supplierOrder.findMany.mockResolvedValue([{ number: 1 }, { number: 3 }]);

      const view = (await service.list(tenantId))[0]!;

      expect(view.missingNumbers).toEqual([2]);
      expect(prisma.document.findMany).not.toHaveBeenCalled();
      expect(prisma.supplierOrder.findMany.mock.calls[0]![0]!.where).toMatchObject({
        tenantId,
        series: 'A',
      });
    });

    it('gli ordini cliente contano solo i numeri dei manuali', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'c1',
          tenantId,
          type: DocumentType.customer_order,
          series: null,
          locationId: null,
          isDefault: true,
          location: null,
        },
      ]);
      prisma.salesOrder.aggregate.mockResolvedValue({ _max: { number: 4 } });
      prisma.salesOrder.findMany.mockResolvedValue([{ number: 2 }, { number: 4 }]);

      const view = (await service.list(tenantId))[0]!;

      // Numeri usati: 2 e 4. Il buco è il 3; l'1 non è un buco, la serie
      // comincia dal 2.
      expect(view.missingNumbers).toEqual([3]);
      expect(prisma.salesOrder.findMany.mock.calls[0]![0]!.where).toMatchObject({
        source: 'manual',
      });
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

    /**
     * I contatori appartengono al numeratore, non al tipo grezzo. Con
     * l'uguaglianza sul tipo grezzo la Fattura accompagnatoria riceveva ZERO
     * contatori — non ne ha né può averne, è esclusa dai configurabili — e la
     * testata apriva senza numero proposto e senza serie scegliibile.
     */
    it('la Fattura accompagnatoria riceve i contatori della Fattura', async () => {
      prisma.documentCounter.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'ft',
          tenantId,
          type: DocumentType.invoice,
          series: null,
          locationId: null,
          isDefault: true,
          location: null,
        },
      ]);

      const result = await service.available(
        tenantId,
        DocumentType.invoice_accompanying,
        null,
        new Date('2026-08-14'),
      );

      const where = prisma.documentCounter.findMany.mock.calls[1]![0]!.where;
      expect(where.type).toBe(DocumentType.invoice);
      expect(result.counters).toHaveLength(1);
      expect(result.proposedCounterId).toBe('ft');
    });

    it('non calcola i buchi: qui si propone un numero, non si fa il punto sulla serie', async () => {
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
      prisma.document.aggregate.mockResolvedValue({ _max: { number: 9 } });

      const result = await service.available(tenantId, DocumentType.quote, null);

      // Assenti, non a zero: uno zero si leggerebbe come «serie integra».
      expect(result.counters[0]!.missingCount).toBeUndefined();
      expect(result.counters[0]!.missingNumbers).toBeUndefined();
      expect(prisma.document.findMany).not.toHaveBeenCalled();
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
    it('elimina una serie aggiunta dall’operatore', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'NAP',
        isDefault: false,
      });
      await service.delete(tenantId, 'c1');
      expect(prisma.documentCounter.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('rifiuta l’eliminazione di «Senza serie» (serie null)', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: null,
        isDefault: true,
      });
      await expect(service.delete(tenantId, 'c1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.documentCounter.delete).not.toHaveBeenCalled();
    });

    it('eliminando la serie predefinita, il default torna a «Senza serie»', async () => {
      prisma.documentCounter.findFirst.mockResolvedValue({
        id: 'c1',
        tenantId,
        type: DocumentType.quote,
        series: 'NAP',
        isDefault: true,
      });
      await service.delete(tenantId, 'c1');
      expect(prisma.documentCounter.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: DocumentType.quote, series: null }),
          data: { isDefault: true },
        }),
      );
    });
  });
});
