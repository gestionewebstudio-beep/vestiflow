import { ForbiddenException } from '@nestjs/common';
import { ReservationStatus, type Prisma, type StockReservation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { StockReservationService } from './stock-reservation.service';

/**
 * Drill-down Impegnata: la sede arriva dalla query, non dalla rotta. Il gate
 * `section.inventory` non dice NULLA su quale magazzino si stia leggendo, e
 * questi test tengono fermo che la verifica di sede viva nel servizio — dove
 * il dato arriva davvero.
 */

const TENANT = 'tenant-1';
const VARIANT = 'var-1';
const SEDE_ASSEGNATA = 'loc-assegnata';
const SEDE_ALTRUI = 'loc-altrui';

function createService() {
  const prisma = {
    stockReservation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new StockReservationService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('StockReservationService — la sede segue l’utente, non la query', () => {
  // Il commesso della fixture non ha sedi assegnate: senza questa esplicita
  // non si distinguerebbe «sede altrui» da «nessuna sede».
  const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_ASSEGNATA] });

  it('nega gli impegni di una sede fuori dal proprio ambito, senza leggere nulla', async () => {
    const { service, prisma } = createService();

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nessun effetto: il rifiuto arriva prima della query.
    expect(prisma.stockReservation.findMany).not.toHaveBeenCalled();
  });

  it('consente la sede assegnata', async () => {
    const { service, prisma } = createService();

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ASSEGNATA, commesso()),
    ).resolves.toEqual([]);

    expect(prisma.stockReservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('consente qualunque sede a chi ha inventory.view_all_locations', async () => {
    const { service, prisma } = createService();
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_ASSEGNATA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, supervisore),
    ).resolves.toEqual([]);

    expect(prisma.stockReservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('consente qualunque sede a chi ha accesso a tutte le sedi', async () => {
    const { service } = createService();
    const multisede = testClerkUser({ hasAllLocationsAccess: true, assignedLocationIds: [] });

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, multisede),
    ).resolves.toEqual([]);
  });

  it('il titolare non è mai fermato: array permessi vuoto, accesso pieno', async () => {
    const { service } = createService();

    await expect(
      service.listActiveForLevel(
        TENANT,
        VARIANT,
        SEDE_ALTRUI,
        testOwnerUser({ permissions: [], assignedLocationIds: [] }),
      ),
    ).resolves.toEqual([]);
  });

  /**
   * ⛔ **Qui c'erano DUE test che codificavano il difetto come contratto.**
   *
   * Il primo diceva «senza utente in contesto non decide: le chiamate interne
   * passano» — di chiamanti interni non ce n’erano. Il secondo, che l’aveva
   * sostituito il 28/08, ammetteva `undefined` esplicito.
   *
   * ⭐ Ora la firma e `user: UserProfileDto`: passare `undefined` **non
   * compila**, quindi non c’e piu niente da testare. Misurato che la rotta sta
   * sotto `JwtAuthGuard` senza `@Public()`, l'identita non puo essere assente.
   */

  // ⭐ La prova che mancava: il caso REALE della rotta, con un utente vero.
  it('con un utente reale, la sede altrui è negata anche conoscendo variante e sede', async () => {
    const { service, prisma } = createService();

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.stockReservation.findMany).not.toHaveBeenCalled();
  });
});

/**
 * ⛔ Il cambio variante su una riga d'ordine — il difetto che questi test
 * inchiodano, misurato e corretto il 28/08/2026.
 *
 * L'impegno è identificato da `salesOrderLineId`, quindi cambiare l'articolo di
 * una riga NON crea un impegno nuovo: aggiorna quello che c'è. Quell'update non
 * scriveva `variantId` e applicava tutti i delta a `current.variantId` — la riga
 * passava alla variante B mentre l'impegno e l'Impegnata restavano sulla A. Con
 * la quantità invariata non accadeva nemmeno quello: il fast-path non
 * confrontava la variante e usciva dichiarando «nessuna modifica».
 *
 * ⭐ La regola che questi test difendono: l'impegno rappresenta sempre
 * ESATTAMENTE `salesOrderLineId + variantId + locationId + quantità`. Se cambia
 * la combinazione variante × sede, l'Impegnata si NEUTRALIZZA per intero sulla
 * vecchia e si applica per intero sulla nuova — mai per differenza fra due conti
 * diversi.
 */

const SEDE_1 = 'loc-1';
const SEDE_2 = 'loc-2';
const VAR_A = 'variante-A';
const VAR_B = 'variante-B';
const ORDINE = 'ordine-1';
const RIGA = 'riga-1';

/** Delta di Impegnata osservato: su quale variante, in quale sede, di quanto. */
interface DeltaOsservato {
  readonly variantId: string;
  readonly locationId: string;
  readonly delta: number;
}

function impegnoEsistente(over: Partial<StockReservation> = {}): StockReservation {
  return {
    id: 'res-1',
    tenantId: TENANT,
    locationId: SEDE_1,
    variantId: VAR_A,
    channel: 'manual',
    salesOrderId: ORDINE,
    salesOrderLineId: RIGA,
    sku: 'SKU-A',
    quantity: 3,
    remainingQuantity: 3,
    status: ReservationStatus.active,
    externalOrderRef: null,
    externalLineRef: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...over,
  } as StockReservation;
}

/**
 * Transazione finta che REGISTRA i delta di Impegnata.
 *
 * ⚠️ `applyCommittedDelta` esce prima di `updateMany` quando il delta è zero: un
 * delta nullo non compare quindi in `deltas`, ed è esattamente ciò che serve
 * osservare — «nessun movimento» dev'essere un elenco vuoto.
 */
function createTx(esistenti: StockReservation[] = []) {
  const deltas: DeltaOsservato[] = [];
  const aggiornamenti: Record<string, unknown>[] = [];
  const creazioni: Record<string, unknown>[] = [];
  const eventi: Record<string, unknown>[] = [];

  const tx = {
    stockReservation: {
      findMany: vi.fn().mockResolvedValue(esistenti),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        aggiornamenti.push(data);
        return {};
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        creazioni.push(data);
        return { id: 'res-nuova', ...data };
      }),
    },
    stockReservationEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        eventi.push(data);
        return {};
      }),
    },
    inventoryLevel: {
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { variantId: string; locationId: string };
          data: { committed: { increment: number } };
        }) => {
          deltas.push({
            variantId: where.variantId,
            locationId: where.locationId,
            delta: data.committed.increment,
          });
          return { count: 1 };
        },
      ),
    },
  };

  return { tx, deltas, aggiornamenti, creazioni, eventi };
}

function sincronizza(
  service: StockReservationService,
  tx: ReturnType<typeof createTx>['tx'],
  linea: { variantId: string; sku: string; quantity: number },
  locationId = SEDE_1,
) {
  return service.syncOrderReservationsTx(tx as unknown as Prisma.TransactionClient, {
    tenantId: TENANT,
    salesOrderId: ORDINE,
    channel: 'manual' as never,
    locationId,
    lines: [{ salesOrderLineId: RIGA, ...linea }],
  });
}

describe('StockReservationService — cambio variante su riga esistente', () => {
  it('A ×3 → B ×3 stessa sede: azzera la A e impegna la B, non «nessuna modifica»', async () => {
    const { service } = createService();
    const { tx, deltas, aggiornamenti } = createTx([impegnoEsistente()]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });

    expect(deltas).toEqual([
      { variantId: VAR_A, locationId: SEDE_1, delta: -3 },
      { variantId: VAR_B, locationId: SEDE_1, delta: 3 },
    ]);
    // ⛔ Il difetto storico: con la quantità invariata il fast-path usciva qui.
    expect(tx.stockReservation.update).toHaveBeenCalledTimes(1);
    expect(aggiornamenti[0]).toMatchObject({
      variantId: VAR_B,
      sku: 'SKU-B',
      quantity: 3,
      remainingQuantity: 3,
      locationId: SEDE_1,
    });
  });

  it('A ×3 → B ×5: la B prende 5 interi, non il differenziale 2', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente()]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 5 });

    expect(deltas).toEqual([
      { variantId: VAR_A, locationId: SEDE_1, delta: -3 },
      { variantId: VAR_B, locationId: SEDE_1, delta: 5 },
    ]);
    // Il difetto che sarebbe passato inosservato: +2 sulla variante sbagliata.
    expect(deltas).not.toContainEqual({ variantId: VAR_A, locationId: SEDE_1, delta: 2 });
  });

  it('A ×5 → B ×2: la A si azzera per intero anche quando la B chiede meno', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente({ quantity: 5, remainingQuantity: 5 })]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 2 });

    expect(deltas).toEqual([
      { variantId: VAR_A, locationId: SEDE_1, delta: -5 },
      { variantId: VAR_B, locationId: SEDE_1, delta: 2 },
    ]);
  });

  it('A ×3 @L1 → B ×3 @L2: variante e sede insieme si muovono in un colpo solo', async () => {
    const { service } = createService();
    const { tx, deltas, aggiornamenti } = createTx([impegnoEsistente()]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 }, SEDE_2);

    expect(deltas).toEqual([
      { variantId: VAR_A, locationId: SEDE_1, delta: -3 },
      { variantId: VAR_B, locationId: SEDE_2, delta: 3 },
    ]);
    expect(aggiornamenti[0]).toMatchObject({ variantId: VAR_B, locationId: SEDE_2 });
  });

  it('stessa variante e stessa sede, 3 → 5: un solo delta, +2', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente()]);

    await sincronizza(service, tx, { variantId: VAR_A, sku: 'SKU-A', quantity: 5 });

    expect(deltas).toEqual([{ variantId: VAR_A, locationId: SEDE_1, delta: 2 }]);
  });

  it('stessa variante e stessa sede, 5 → 3: un solo delta, −2', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente({ quantity: 5, remainingQuantity: 5 })]);

    await sincronizza(service, tx, { variantId: VAR_A, sku: 'SKU-A', quantity: 3 });

    expect(deltas).toEqual([{ variantId: VAR_A, locationId: SEDE_1, delta: -2 }]);
  });

  it('secondo salvataggio dello stesso stato finale: nessun delta e nessuna scrittura', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([
      impegnoEsistente({ variantId: VAR_B, sku: 'SKU-B', quantity: 3, remainingQuantity: 3 }),
    ]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });

    expect(deltas).toEqual([]);
    expect(tx.stockReservation.update).not.toHaveBeenCalled();
    expect(tx.stockReservationEvent.create).not.toHaveBeenCalled();
  });

  it('ripetere il cambio variante non raddoppia: il secondo giro è un no-op', async () => {
    const { service } = createService();

    const primo = createTx([impegnoEsistente()]);
    await sincronizza(service, primo.tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });
    expect(primo.deltas).toHaveLength(2);

    // Lo stato che il primo giro ha scritto, riletto come lo rileggerebbe il DB.
    const dopo = impegnoEsistente(primo.aggiornamenti[0] as Partial<StockReservation>);
    const secondo = createTx([dopo]);
    await sincronizza(service, secondo.tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });

    expect(secondo.deltas).toEqual([]);
  });

  it('un impegno rilasciato che torna in riga impegna la nuova variante, senza restituire nulla alla vecchia', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([
      impegnoEsistente({ status: ReservationStatus.released, remainingQuantity: 0 }),
    ]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 4 });

    // La A non aveva più niente impegnato: nessun delta negativo da emettere.
    expect(deltas).toEqual([{ variantId: VAR_B, locationId: SEDE_1, delta: 4 }]);
  });

  it('un impegno già consumato non si riapre: il cambio variante non lo tocca', async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([
      impegnoEsistente({ status: ReservationStatus.consumed, remainingQuantity: 0 }),
    ]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });

    expect(deltas).toEqual([]);
    expect(tx.stockReservation.update).not.toHaveBeenCalled();
  });

  it("la nota dell'evento dice che cosa è cambiato", async () => {
    const { service } = createService();

    const cambioVariante = createTx([impegnoEsistente()]);
    await sincronizza(service, cambioVariante.tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });
    expect(cambioVariante.eventi[0]).toMatchObject({ note: 'Cambio articolo della riga' });

    const cambioSede = createTx([impegnoEsistente()]);
    await sincronizza(
      service,
      cambioSede.tx,
      { variantId: VAR_A, sku: 'SKU-A', quantity: 3 },
      SEDE_2,
    );
    expect(cambioSede.eventi[0]).toMatchObject({ note: "Cambio location dell'ordine" });

    const entrambi = createTx([impegnoEsistente()]);
    await sincronizza(
      service,
      entrambi.tx,
      { variantId: VAR_B, sku: 'SKU-B', quantity: 3 },
      SEDE_2,
    );
    expect(entrambi.eventi[0]).toMatchObject({ note: "Cambio articolo e location dell'ordine" });
  });
});

describe('StockReservationService — dopo il cambio variante il resto del ciclo segue la nuova', () => {
  /** Esegue il cambio variante e restituisce l'impegno come lo rileggerebbe il DB. */
  async function dopoIlCambioVariante(service: StockReservationService): Promise<StockReservation> {
    const { tx, aggiornamenti } = createTx([impegnoEsistente()]);
    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 3 });
    return impegnoEsistente(aggiornamenti[0] as Partial<StockReservation>);
  }

  it('il rilascio restituisce la B, non la A', async () => {
    const { service } = createService();
    const impegno = await dopoIlCambioVariante(service);
    const { tx, deltas } = createTx([impegno]);

    await service.releaseOrderReservationsTx(tx as unknown as Prisma.TransactionClient, {
      tenantId: TENANT,
      salesOrderId: ORDINE,
    });

    expect(deltas).toEqual([{ variantId: VAR_B, locationId: SEDE_1, delta: -3 }]);
  });

  it('il consumo scarica la B, non la A', async () => {
    const { service } = createService();
    const impegno = await dopoIlCambioVariante(service);
    const { tx, deltas } = createTx([]);

    const consumata = await service.consumeReservationTx(
      tx as unknown as Prisma.TransactionClient,
      impegno,
      'Evasione',
    );

    expect(consumata).toBe(3);
    expect(deltas).toEqual([{ variantId: VAR_B, locationId: SEDE_1, delta: -3 }]);
  });

  it('il ripristino da consumo reimpegna la B, non la A', async () => {
    const { service } = createService();
    const impegno = await dopoIlCambioVariante(service);
    const { tx, deltas } = createTx([
      { ...impegno, status: ReservationStatus.consumed, remainingQuantity: 0 },
    ]);

    await service.restoreConsumedOrderReservationsTx(tx as unknown as Prisma.TransactionClient, {
      tenantId: TENANT,
      salesOrderId: ORDINE,
      note: 'Documento annullato',
    });

    expect(deltas).toEqual([{ variantId: VAR_B, locationId: SEDE_1, delta: 3 }]);
  });

  it('sku e variantId restano coerenti: mai la variante nuova con lo SKU vecchio', async () => {
    const { service } = createService();
    const impegno = await dopoIlCambioVariante(service);

    expect(impegno.variantId).toBe(VAR_B);
    expect(impegno.sku).toBe('SKU-B');
  });
});

describe('StockReservationService — righe rimosse e righe nuove, invariate', () => {
  it("una riga tolta dall'ordine rilascia il suo impegno sulla propria variante", async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente()]);

    await service.syncOrderReservationsTx(tx as unknown as Prisma.TransactionClient, {
      tenantId: TENANT,
      salesOrderId: ORDINE,
      channel: 'manual' as never,
      locationId: SEDE_1,
      lines: [],
    });

    expect(deltas).toEqual([{ variantId: VAR_A, locationId: SEDE_1, delta: -3 }]);
  });

  it("una riga nuova crea l'impegno sulla propria variante", async () => {
    const { service } = createService();
    const { tx, deltas, creazioni } = createTx([]);

    await sincronizza(service, tx, { variantId: VAR_B, sku: 'SKU-B', quantity: 2 });

    expect(deltas).toEqual([{ variantId: VAR_B, locationId: SEDE_1, delta: 2 }]);
    expect(creazioni[0]).toMatchObject({ variantId: VAR_B, sku: 'SKU-B', quantity: 2 });
  });

  it("quantità a zero: la riga non impegna e l'impegno esistente si rilascia", async () => {
    const { service } = createService();
    const { tx, deltas } = createTx([impegnoEsistente()]);

    await sincronizza(service, tx, { variantId: VAR_A, sku: 'SKU-A', quantity: 0 });

    expect(deltas).toEqual([{ variantId: VAR_A, locationId: SEDE_1, delta: -3 }]);
  });
});
