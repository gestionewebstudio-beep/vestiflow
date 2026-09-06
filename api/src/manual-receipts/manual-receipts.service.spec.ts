import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CorrispettiviService } from '../corrispettivi/corrispettivi.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { ManualReceiptsService } from './manual-receipts.service';
import type { SaveManualReceiptDto } from './dto/save-manual-receipt.dto';

const tenantId = 'tenant-1';
const LOCATION = { id: 'loc-1', name: 'Negozio Centro' };

const IVA_22 = {
  id: 'vat-22',
  code: 'IVA22',
  description: 'Aliquota 22%',
  notes: null,
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  usageScope: 'both',
  isActive: true,
  nature: { key: 'standard', label: 'Imponibile', officialCode: null },
};

/**
 * Le sedi del tenant, con `findMany` che **rispetta davvero** il `where`.
 *
 * Serve perché lo scope centrale interroga due volte: prima le sedi operative
 * del tenant, poi quelle sopravvissute allo scope utente. Un mock che ignora il
 * `where` restituirebbe tutto a entrambi i giri, e il test proverebbe di aver
 * chiamato una funzione — non che il filtro filtri.
 */
function locationFindManyMock(sedi: readonly { id: string; name: string }[]) {
  return vi.fn((args?: { where?: { id?: { in?: string[] } } }) => {
    const ammessi = args?.where?.id?.in;
    return Promise.resolve(ammessi ? sedi.filter((sede) => ammessi.includes(sede.id)) : [...sedi]);
  });
}

function createPrismaMock(sedi: readonly { id: string; name: string }[] = [LOCATION]) {
  const prisma = {
    location: {
      findFirst: vi.fn().mockResolvedValue({ id: LOCATION.id }),
      findMany: locationFindManyMock(sedi),
    },
    vatCode: { findMany: vi.fn().mockResolvedValue([IVA_22]) },
    manualReceipt: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    manualReceiptLine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },

    // ── Le delegate che NON devono essere toccate mai ────────────────────────
    //
    // ⛔ Sono la prima prova del §13, e viene prima delle altre: creare,
    // modificare ed eliminare un Corrispettivo manuale deve produrre ZERO
    // `StockMovement` e non muovere Giacenza, Impegnata né Disponibile. Stanno
    // qui come spie perché il difetto da fermare non è un calcolo sbagliato: è
    // qualcuno che un giorno «collega anche il magazzino».
    stockMovement: { create: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    inventoryLevel: { update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    stockReservation: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    document: { create: vi.fn(), update: vi.fn() },
    salesOrder: { create: vi.fn(), update: vi.fn() },

    // L'advisory lock del numeratore: non serializza niente qui (la transazione
    // è finta), ma senza la mock la creazione si romperebbe.
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

/** Le delegate che una registrazione economica non deve sfiorare. */
function expectNessunEffettoDiMagazzino(prisma: PrismaMock): void {
  for (const delegate of [
    prisma.stockMovement,
    prisma.inventoryLevel,
    prisma.stockReservation,
    prisma.document,
    prisma.salesOrder,
  ]) {
    for (const [nome, fn] of Object.entries(delegate)) {
      expect(fn, `atteso nessun uso di ${nome}`).not.toHaveBeenCalled();
    }
  }
}

function savedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mr-1',
    tenantId,
    series: null,
    number: 1,
    documentDate: new Date('2026-08-17T00:00:00.000Z'),
    locationId: LOCATION.id,
    pricesIncludeVat: true,
    notes: null,
    currency: 'EUR',
    subtotalMinor: 5738,
    taxMinor: 1262,
    totalMinor: 7000,
    createdById: 'user-owner',
    createdByName: 'Owner Test',
    createdAt: new Date('2026-08-17T10:00:00.000Z'),
    updatedAt: new Date('2026-08-17T10:00:00.000Z'),
    location: { name: LOCATION.name },
    lines: [],
    ...overrides,
  };
}

function createService(prisma: PrismaMock) {
  return new ManualReceiptsService(prisma as unknown as PrismaService);
}

function dto(overrides: Partial<SaveManualReceiptDto> = {}): SaveManualReceiptDto {
  return {
    documentDate: '2026-08-17',
    locationId: LOCATION.id,
    pricesIncludeVat: true,
    lines: [{ description: 'Vendite cassa esterna', amountMinor: 7000, vatCodeId: 'vat-22' }],
    ...overrides,
  } as SaveManualReceiptDto;
}

describe('ManualReceiptsService — nessun effetto di magazzino', () => {
  /**
   * ⛔ **La prova che viene prima di tutte** (`10` §13). Il divieto sul
   * magazzino non è una conseguenza: è la definizione. Una registrazione che non
   * conosce gli articoli non può muovere quantità, e se un giorno qualcuno
   * provasse a farlo starebbe inventando merce.
   */
  it('creare non produce nessun movimento e non tocca le giacenze', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.create.mockResolvedValue(savedReceipt());
    await createService(prisma).create(tenantId, dto(), testOwnerUser());

    expect(prisma.manualReceipt.create).toHaveBeenCalledTimes(1);
    expectNessunEffettoDiMagazzino(prisma);
  });

  it('modificare non produce nessun movimento e non tocca le giacenze', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.findFirst.mockResolvedValue({ id: 'mr-1', locationId: LOCATION.id });
    prisma.manualReceipt.findUniqueOrThrow.mockResolvedValue(savedReceipt());
    await createService(prisma).update(tenantId, 'mr-1', dto(), testOwnerUser());

    expect(prisma.manualReceipt.update).toHaveBeenCalledTimes(1);
    expectNessunEffettoDiMagazzino(prisma);
  });

  it('eliminare non ripristina niente, perché niente era stato mosso', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.findFirst.mockResolvedValue({ id: 'mr-1', locationId: LOCATION.id });
    await createService(prisma).remove(tenantId, 'mr-1', testOwnerUser());

    expect(prisma.manualReceipt.delete).toHaveBeenCalledWith({ where: { id: 'mr-1' } });
    expectNessunEffettoDiMagazzino(prisma);
  });
});

describe('ManualReceiptsService — numero, testata, righe', () => {
  it('assegna il numero sotto il lucchetto, e solo alla creazione', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.create.mockResolvedValue(savedReceipt());
    await createService(prisma).create(tenantId, dto(), testOwnerUser());

    // Il lucchetto va preso PRIMA di leggere il massimo, o due salvataggi
    // simultanei prendono lo stesso numero e il secondo si becca il vincolo
    // unico a lavoro finito.
    const ordineLock = prisma.$queryRaw.mock.invocationCallOrder[0] ?? 0;
    const ordineMax = prisma.manualReceipt.aggregate.mock.invocationCallOrder[0] ?? 0;
    expect(ordineLock).toBeGreaterThan(0);
    expect(ordineMax).toBeGreaterThan(ordineLock);

    const creato = prisma.manualReceipt.create.mock.calls[0]![0] as {
      data: { number: number; series: null };
    };
    expect(creato.data.number).toBe(1);
    // La serie resta NULL: la colonna esiste per la partizione del numeratore
    // comune, non per una gestione serie che qui non c'è.
    expect(creato.data.series).toBeNull();
  });

  it('la modifica aggiorna lo STESSO record: non ne crea un secondo', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.findFirst.mockResolvedValue({ id: 'mr-1', locationId: LOCATION.id });
    prisma.manualReceipt.findUniqueOrThrow.mockResolvedValue(savedReceipt());

    await createService(prisma).update(tenantId, 'mr-1', dto({ notes: 'corretta' }), testOwnerUser());

    expect(prisma.manualReceipt.create).not.toHaveBeenCalled();
    expect(prisma.manualReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mr-1' } }),
    );
    // Numero e serie non entrano nei dati della modifica: il numero è del
    // record, non una proposta da ricalcolare a ogni salvataggio.
    const aggiornato = prisma.manualReceipt.update.mock.calls[0]![0] as { data: object };
    expect(aggiornato.data).not.toHaveProperty('number');
    expect(aggiornato.data).not.toHaveProperty('series');
    // E il numeratore non viene nemmeno interrogato.
    expect(prisma.manualReceipt.aggregate).not.toHaveBeenCalled();
  });

  it('scrive i totali sommati dalle righe', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.create.mockResolvedValue(savedReceipt());
    await createService(prisma).create(tenantId, dto(), testOwnerUser());

    expect(prisma.manualReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotalMinor: 5738, taxMinor: 1262, totalMinor: 7000 }),
      }),
    );
  });

  it('la riga vuota non diventa una riga del database', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.create.mockResolvedValue(savedReceipt());

    await createService(prisma).create(
      tenantId,
      dto({
        lines: [
          { description: 'Vendite cassa esterna', amountMinor: 7000, vatCodeId: 'vat-22' },
          // La riga pronta all'inserimento, col Codice IVA già proposto.
          { description: '', amountMinor: 0, vatCodeId: 'vat-22' },
        ],
      }),
      testOwnerUser(),
    );

    const creato = prisma.manualReceipt.create.mock.calls[0]![0] as {
      data: { lines: { create: unknown[] } };
    };
    expect(creato.data.lines.create).toHaveLength(1);
  });

  /**
   * ⚠️ La descrizione è **facoltativa**, e qui era obbligatoria per iniziativa
   * mia: la specifica non lo chiedeva. Su una chiusura di cassa importo e
   * aliquota sono il dato; la descrizione dice a cosa si riferisce, e spesso non
   * c'è niente da aggiungere.
   */
  it('una riga con importo e Codice IVA si salva anche senza descrizione', async () => {
    const prisma = createPrismaMock();
    prisma.manualReceipt.create.mockResolvedValue(savedReceipt());

    await createService(prisma).create(
      tenantId,
      dto({ lines: [{ description: '', amountMinor: 7000, vatCodeId: 'vat-22' }] }),
      testOwnerUser(),
    );

    const creato = prisma.manualReceipt.create.mock.calls[0]![0] as {
      data: { lines: { create: { description: string }[] } };
    };
    expect(creato.data.lines.create).toHaveLength(1);
    expect(creato.data.lines.create[0]!.description).toBe('');
  });

  it('senza nemmeno una riga compilata non si salva', async () => {
    const prisma = createPrismaMock();
    await expect(
      createService(prisma).create(
        tenantId,
        dto({ lines: [{ description: '', amountMinor: 0, vatCodeId: 'vat-22' }] }),
        testOwnerUser(),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.manualReceipt.create).not.toHaveBeenCalled();
  });

  it('una riga con importo ma senza Codice IVA dice quale riga', async () => {
    const prisma = createPrismaMock();
    await expect(
      createService(prisma).create(
        tenantId,
        dto({
          lines: [
            { description: 'Prima', amountMinor: 100, vatCodeId: 'vat-22' },
            { description: 'Seconda', amountMinor: 200 },
          ],
        }),
        testOwnerUser(),
      ),
    ).rejects.toThrow(/Riga 2/);
  });

  it('un Codice IVA riservato agli acquisti non entra in un corrispettivo', async () => {
    const prisma = createPrismaMock();
    prisma.vatCode.findMany.mockResolvedValue([{ ...IVA_22, usageScope: 'purchase' }]);
    await expect(
      createService(prisma).create(tenantId, dto(), testOwnerUser()),
    ).rejects.toThrow(/riservato agli acquisti/);
  });
});

describe('ManualReceiptsService — sede e multi-tenant', () => {
  it('una sede di un altro tenant non esiste, e il salvataggio si ferma', async () => {
    const prisma = createPrismaMock();
    // `findFirst({ id, tenantId })`: la sede di tenant B non torna per tenant A.
    prisma.location.findFirst.mockResolvedValue(null);

    await expect(
      createService(prisma).create(tenantId, dto(), testOwnerUser()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.manualReceipt.create).not.toHaveBeenCalled();
  });

  it('un operatore fuori dalle sue sedi non registra: 403, non 422', async () => {
    const prisma = createPrismaMock();
    const clerk = testClerkUser({ assignedLocationIds: ['loc-altra'] });

    await expect(createService(prisma).create(tenantId, dto(), clerk)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.manualReceipt.create).not.toHaveBeenCalled();
  });

  it('una registrazione di un altro tenant non si legge, non si modifica, non si elimina', async () => {
    const prisma = createPrismaMock();
    // Ogni lettura passa da `{ id, tenantId }`: per il tenant sbagliato è nulla.
    prisma.manualReceipt.findFirst.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.getById(tenantId, 'mr-altrui')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(tenantId, 'mr-altrui', dto(), testOwnerUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(tenantId, 'mr-altrui', testOwnerUser())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.manualReceipt.update).not.toHaveBeenCalled();
    expect(prisma.manualReceipt.delete).not.toHaveBeenCalled();
  });

  it('l’elenco sedi propone solo quelle su cui l’operatore può davvero registrare', async () => {
    const prisma = createPrismaMock([LOCATION, { id: 'loc-2', name: 'Magazzino Nord' }]);
    const clerk = testClerkUser({ assignedLocationIds: ['loc-2'] });

    // Proporre una sede che poi il salvataggio rifiuta è peggio che non
    // proporla: l'operatore la sceglie e scopre il divieto dopo aver compilato.
    expect(await createService(prisma).listUsableLocations(tenantId, clerk)).toEqual([
      { id: 'loc-2', name: 'Magazzino Nord' },
    ]);
    expect(await createService(prisma).listUsableLocations(tenantId, testOwnerUser())).toHaveLength(
      2,
    );
  });

  /**
   * ⚠️ **La differenza fra «sedi consultabili» e «sedi registrabili» non nasce
   * qui**, ed è la condizione per tenere due endpoint separati: sta nel modello
   * centrale, dove la lettura ammette anche `inventory.view_all_locations` e la
   * scrittura no.
   *
   * Questo test lo prova sul caso che le separa: un utente con quel permesso e
   * una sola sede assegnata **vede tutto** e **registra su una sola**. Se un
   * giorno i due insiemi divergessero per una regola scritta apposta per i
   * Corrispettivi, questo test resterebbe verde e non servirebbe a niente —
   * per questo interroga i DUE service, non uno solo.
   */
  it('consultabili e registrabili differiscono per il permesso CENTRALE, non per una regola nostra', async () => {
    const sedi = [LOCATION, { id: 'loc-2', name: 'Magazzino Nord' }];
    const prisma = createPrismaMock(sedi);
    const clerk = testClerkUser({
      assignedLocationIds: ['loc-2'],
      permissions: ['inventory.view_all_locations'],
    });

    const registrabili = await createService(prisma).listUsableLocations(tenantId, clerk);
    const consultabili = await new CorrispettiviService(
      prisma as unknown as PrismaService,
    ).listRegisterLocations(tenantId, clerk);

    expect(registrabili.map((sede) => sede.id)).toEqual(['loc-2']);
    expect(consultabili.map((sede) => sede.id)).toEqual(['loc-1', 'loc-2']);
  });
});
