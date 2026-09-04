import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { withFiscalAdapters } from '../../fiscal/fiscal-adapter-registry';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo della tranche C3: validatore, apertura, cassetto, dispositivo.
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il controllo applicativo basta      due aperture SIMULTANEE: una sola deve riuscire
 *   il cross-tenant passa               sessione e dispositivo altrui DEVONO essere rifiutati
 *   il cambio dispositivo è una gara    due cambi concorrenti NON producono due righe
 *   l'adapter non serve                 un dispositivo senza adapter NON si seleziona
 *   il saldo blocca il prelievo         un prelievo maggiore del teorico DEVE passare
 * ```
 *
 * ⚠️ Il registro degli adapter è **vuoto in produzione**: qui si sostituisce, e
 * si ripristina dopo ogni prova. Un registro lasciato finto farebbe passare
 * cose che in produzione fallirebbero.
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C3';
const ADAPTER = 'fornitore.protocollo.v1';

describe('sessione di cassa — C3 su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let service: CashSessionsService;
  let ripristinaAdapter: (() => void) | null = null;

  let tenantA = '';
  let tenantB = '';
  let sedeA1 = '';
  let sedeA2 = '';
  let sedeB = '';
  let deviceA1 = '';
  let deviceA1bis = '';
  let deviceA2 = '';
  let deviceSpento = '';
  let deviceSenzaAdapter = '';
  let deviceB = '';

  // ⚠️ Gli id degli operatori sono UUID VERI: `openedById` e `createdById`
  //    sono `@db.Uuid`, e una stringa qualunque non entra.
  /** Titolare del tenant A: passa ovunque nel proprio tenant. */
  const titolare = (tenantId: string): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-000000000001',
      tenantId,
      displayName: 'Titolare',
      role: 'owner',
      supportSession: false,
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      permissions: [],
    }) as unknown as UserProfileDto;

  /** Operatore vincolato alle sole sedi assegnate. */
  const operatore = (tenantId: string, sedi: string[]): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-000000000002',
      tenantId,
      displayName: 'Commesso',
      role: 'clerk',
      supportSession: false,
      hasAllLocationsAccess: false,
      assignedLocationIds: sedi,
      permissions: ['retail.register', 'retail.cash_session', 'retail.cash_drawer'],
    }) as unknown as UserProfileDto;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    // ⛔ `as never` e NON `as unknown as PrismaService`: importare quel tipo qui
    //    e' vietato da `check:integration-db`, perche' PrismaService legge
    //    DATABASE_URL dall'ambiente — cioe' DEV. Il client giusto arriva da
    //    `creaClientIntegrazione`, che ha il datasource nel costruttore.
    service = new CashSessionsService(prisma as never);
    await pulisci(prisma);

    tenantA = await creaTenant(prisma, 'A');
    tenantB = await creaTenant(prisma, 'B');
    sedeA1 = await creaSede(prisma, tenantA, 'A1');
    sedeA2 = await creaSede(prisma, tenantA, 'A2');
    sedeB = await creaSede(prisma, tenantB, 'B1');

    deviceA1 = await creaDispositivo(prisma, tenantA, sedeA1, ADAPTER, true);
    deviceA1bis = await creaDispositivo(prisma, tenantA, sedeA1, ADAPTER, true);
    deviceA2 = await creaDispositivo(prisma, tenantA, sedeA2, ADAPTER, true);
    deviceSpento = await creaDispositivo(prisma, tenantA, sedeA1, ADAPTER, false);
    deviceSenzaAdapter = await creaDispositivo(prisma, tenantA, sedeA1, 'ignoto.v9', true);
    deviceB = await creaDispositivo(prisma, tenantB, sedeB, ADAPTER, true);
  }, 120_000);

  beforeEach(() => {
    ripristinaAdapter = withFiscalAdapters([ADAPTER]);
  });

  afterEach(async () => {
    ripristinaAdapter?.();
    ripristinaAdapter = null;
    // Ogni prova riparte senza sessioni aperte: l'indice parziale ne ammette
    // una sola per sede, e una residua falserebbe la prova dopo.
    await svuotaSessioni(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  // ── Apertura ──────────────────────────────────────────────────────────────

  it('apre la sessione, e registra il PRIMO assegnamento nello storico', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 10_000,
      fiscalDeviceId: deviceA1,
      notes: `${PREFISSO} apertura`,
    });

    expect(s.status).toBe('open');
    expect(s.openingFloatMinor).toBe(10_000);
    expect(s.fiscalDeviceId).toBe(deviceA1);
    // ⛔ L'operatore viene dal contesto, non dal payload.
    expect(s.openedByName).toBe('Titolare');

    const storico = await prisma.cashSessionDeviceChange.findMany({ where: { sessionId: s.id } });
    expect(storico).toHaveLength(1);
    expect(storico[0]?.previousDeviceId).toBeNull();
    expect(storico[0]?.newDeviceId).toBe(deviceA1);
  });

  it('apre SENZA dispositivo: quella sede non fiscalizza', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });

    expect(s.fiscalDeviceId).toBeNull();
    // Nessun cambio da registrare: non c'è stato nessun assegnamento.
    expect(await prisma.cashSessionDeviceChange.count({ where: { sessionId: s.id } })).toBe(0);
  });

  /**
   * ⭐ La prova che il controllo applicativo NON basta: due richieste davvero
   * simultanee lo superano entrambe, e a fermarne una è l'indice parziale.
   */
  it('due aperture SIMULTANEE: una sola riesce, l_altra riceve conflitto', async () => {
    const esiti = await Promise.allSettled([
      service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: 100 }),
      service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: 200 }),
    ]);

    const riuscite = esiti.filter((e) => e.status === 'fulfilled');
    const fallite = esiti.filter((e) => e.status === 'rejected');
    expect(riuscite).toHaveLength(1);
    expect(fallite).toHaveLength(1);
    expect((fallite[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    expect(await prisma.cashSession.count({ where: { locationId: sedeA1, status: 'open' } })).toBe(
      1,
    );
  });

  /**
   * ⛔ **La prova precedente NON dimostra che a fermare la seconda sia
   * l'indice**, e va detto: misurato il 04/09/2026 togliendo l'indice dal
   * database, quella prova resta VERDE. Con `Promise.all` le due transazioni
   * si serializzano abbastanza da far vedere alla seconda la sessione della
   * prima, e a fermarla è il controllo applicativo.
   *
   * ⭐ Qui si interroga il DATABASE direttamente, scavalcando il servizio: è
   * l'unico modo di provare che la garanzia finale esiste davvero.
   */
  it('il DATABASE rifiuta una seconda sessione aperta, anche scavalcando il servizio', async () => {
    await service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: 0 });

    await expect(
      prisma.cashSession.create({
        data: {
          tenantId: tenantA,
          locationId: sedeA1,
          openedByName: 'scavalcamento',
          status: 'open',
        },
      }),
    ).rejects.toThrow();
  });

  it('riaprire con una sessione già aperta dà conflitto', async () => {
    await service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: 0 });

    await expect(
      service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('il fondo NEGATIVO è rifiutato', async () => {
    await expect(
      service.open(tenantA, titolare(tenantA), { locationId: sedeA1, openingFloatMinor: -1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // ── Il validatore ─────────────────────────────────────────────────────────

  it('una sede NON assegnata è rifiutata', async () => {
    await expect(
      service.open(tenantA, operatore(tenantA, [sedeA2]), {
        locationId: sedeA1,
        openingFloatMinor: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * ⛔ Il cross-tenant che il database NON impedisce (`docs/25` §13): qui si
   * prova che lo impedisce il validatore.
   *
   * ⚠️ **Le due chiamate NON si creano in anticipo per awaitarle dopo.** Cosi`
   * scritta, questa prova produceva un `Unhandled Rejection` INTERMITTENTE:
   * la seconda promessa poteva essere rifiutata mentre il primo `await` era
   * ancora in viaggio verso il database, cioe` prima che qualcuno le
   * attaccasse un gestore. Node lo segnalava, Vitest lo riportava, e la
   * suite restava VERDE — il difetto era della prova, non del prodotto.
   * Misurato il 04/09/2026: 2 esecuzioni complete su 10.
   */
  it('una sede di un ALTRO tenant è rifiutata, e l_errore non la distingue da una inesistente', async () => {
    const altrui = await catturaErrore(() =>
      service.open(tenantA, titolare(tenantA), { locationId: sedeB, openingFloatMinor: 0 }),
    );
    const inesistente = await catturaErrore(() =>
      service.open(tenantA, titolare(tenantA), {
        locationId: '11111111-1111-1111-1111-111111111111',
        openingFloatMinor: 0,
      }),
    );

    expect(altrui).toBeInstanceOf(ForbiddenException);
    expect(inesistente).toBeInstanceOf(ForbiddenException);
    // ⭐ E i due messaggi sono IDENTICI: e` cio` che il nome della prova dice,
    //    e prima non era verificato.
    expect((altrui as Error).message).toBe((inesistente as Error).message);
  });

  it('un dispositivo di un ALTRO tenant è rifiutato', async () => {
    await expect(
      service.open(tenantA, titolare(tenantA), {
        locationId: sedeA1,
        openingFloatMinor: 0,
        fiscalDeviceId: deviceB,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('un dispositivo di un_ALTRA SEDE dello stesso tenant è rifiutato', async () => {
    await expect(
      service.open(tenantA, titolare(tenantA), {
        locationId: sedeA1,
        openingFloatMinor: 0,
        fiscalDeviceId: deviceA2,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('un dispositivo DISABILITATO è rifiutato', async () => {
    await expect(
      service.open(tenantA, titolare(tenantA), {
        locationId: sedeA1,
        openingFloatMinor: 0,
        fiscalDeviceId: deviceSpento,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⛔ La whitelist sta nel CODICE: una `adapterKey` scritta dal tenant non
   * diventa il nome di qualcosa da caricare (`docs/25` §10, garanzia 3).
   */
  it('un dispositivo con adapter SCONOSCIUTO non si seleziona', async () => {
    await expect(
      service.open(tenantA, titolare(tenantA), {
        locationId: sedeA1,
        openingFloatMinor: 0,
        fiscalDeviceId: deviceSenzaAdapter,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('col registro VUOTO nessun dispositivo si seleziona: è lo stato di C3', async () => {
    ripristinaAdapter?.();
    ripristinaAdapter = withFiscalAdapters([]);

    await expect(
      service.open(tenantA, titolare(tenantA), {
        locationId: sedeA1,
        openingFloatMinor: 0,
        fiscalDeviceId: deviceA1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // …ma senza dispositivo si apre lo stesso.
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });
    expect(s.fiscalDeviceId).toBeNull();
  });

  // ── Cassetto ──────────────────────────────────────────────────────────────

  it('registra versamento e prelievo, e sono append-only', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 5_000,
    });

    const versamento = await service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
      type: 'deposit',
      amountMinor: 2_000,
      reason: '  fondo   aggiuntivo  ',
    });
    const prelievo = await service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
      type: 'withdrawal',
      amountMinor: 1_000,
      reason: 'versamento in banca',
    });

    // ⭐ La causale è normalizzata: spazi collassati e tolti agli estremi.
    expect(versamento.reason).toBe('fondo aggiuntivo');
    expect(prelievo.amountMinor).toBe(1_000);

    const corrente = await service.current(tenantA, titolare(tenantA), sedeA1);
    expect(corrente.depositsMinor).toBe(2_000);
    expect(corrente.withdrawalsMinor).toBe(1_000);
    // ⚠️ Nessun valore di chiusura: non esistono ancora.
    expect(corrente.session?.countedCashMinor).toBeNull();
    expect(corrente.session?.expectedCashMinor).toBeNull();
  });

  it('importo zero o negativo rifiutato', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });

    for (const amountMinor of [0, -100]) {
      await expect(
        service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
          type: 'deposit',
          amountMinor,
          reason: 'prova',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });

  it('causale vuota o di soli spazi rifiutata', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });

    await expect(
      service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
        type: 'deposit',
        amountMinor: 100,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⭐ Comportamento DICHIARATO, non dedotto: un prelievo maggiore del contante
   * teorico passa. Il cassetto reale può divergere dal calcolo — è ciò che la
   * quadratura serve a far emergere — e rifiutarlo impedirebbe di registrare
   * quello che è successo davvero.
   */
  it('un prelievo MAGGIORE del teorico passa: il saldo non blocca', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 1_000,
    });

    const prelievo = await service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
      type: 'withdrawal',
      amountMinor: 999_999,
      reason: 'prelievo oltre il teorico',
    });

    expect(prelievo.amountMinor).toBe(999_999);
  });

  it('un operatore senza accesso alla SEDE non movimenta, anche col permesso', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });

    await expect(
      service.addMovement(tenantA, operatore(tenantA, [sedeA2]), sedeA1, s.id, {
        type: 'deposit',
        amountMinor: 100,
        reason: 'non dovrebbe passare',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non si movimenta su una sessione CHIUSA', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });
    await prisma.cashSession.update({
      where: { id: s.id },
      data: { status: 'closed', closedAt: new Date() },
    });

    await expect(
      service.addMovement(tenantA, titolare(tenantA), sedeA1, s.id, {
        type: 'deposit',
        amountMinor: 100,
        reason: 'sessione chiusa',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // ── Cambio dispositivo ────────────────────────────────────────────────────

  it('il cambio crea ESATTAMENTE una riga storica, col precedente giusto', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
      fiscalDeviceId: deviceA1,
    });

    const { session, change } = await service.changeDevice(
      tenantA,
      titolare(tenantA),
      sedeA1,
      s.id,
      {
        fiscalDeviceId: deviceA1bis,
        reason: 'guasto del principale',
      },
    );

    expect(session.fiscalDeviceId).toBe(deviceA1bis);
    expect(change.previousDeviceId).toBe(deviceA1);
    expect(change.newDeviceId).toBe(deviceA1bis);

    // Apertura + cambio = due righe, in sequenza lineare.
    const storico = await prisma.cashSessionDeviceChange.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(storico).toHaveLength(2);
    expect(storico[1]?.previousDeviceId).toBe(storico[0]?.newDeviceId);
  });

  it('si può TOGLIERE il dispositivo con null', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
      fiscalDeviceId: deviceA1,
    });

    const { session, change } = await service.changeDevice(
      tenantA,
      titolare(tenantA),
      sedeA1,
      s.id,
      {
        fiscalDeviceId: null,
        reason: 'si smette di fiscalizzare',
      },
    );

    expect(session.fiscalDeviceId).toBeNull();
    expect(change.newDeviceId).toBeNull();
  });

  it('cambiare verso lo STESSO dispositivo è rifiutato', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
      fiscalDeviceId: deviceA1,
    });

    await expect(
      service.changeDevice(tenantA, titolare(tenantA), sedeA1, s.id, {
        fiscalDeviceId: deviceA1,
        reason: 'cambio che non cambia',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⭐ Due cambi concorrenti NON devono produrre due righe fondate sullo stesso
   * «precedente»: l'aggiornamento condizionale fa fallire il secondo.
   */
  it('due cambi CONCORRENTI: uno solo riesce, e lo storico resta lineare', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
      fiscalDeviceId: deviceA1,
    });

    const esiti = await Promise.allSettled([
      service.changeDevice(tenantA, titolare(tenantA), sedeA1, s.id, {
        fiscalDeviceId: deviceA1bis,
        reason: 'primo',
      }),
      service.changeDevice(tenantA, titolare(tenantA), sedeA1, s.id, {
        fiscalDeviceId: null,
        reason: 'secondo',
      }),
    ]);

    const riuscite = esiti.filter((e) => e.status === 'fulfilled');
    expect(riuscite).toHaveLength(1);

    // ⭐ Lo storico è una catena: ogni riga parte da dove finisce la precedente.
    const storico = await prisma.cashSessionDeviceChange.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(storico).toHaveLength(2);
    for (let i = 1; i < storico.length; i += 1) {
      expect(storico[i]?.previousDeviceId).toBe(storico[i - 1]?.newDeviceId);
    }
  });

  it('non si cambia dispositivo su una sessione di un ALTRO tenant', async () => {
    const s = await service.open(tenantA, titolare(tenantA), {
      locationId: sedeA1,
      openingFloatMinor: 0,
    });

    await expect(
      service.changeDevice(tenantB, titolare(tenantB), sedeB, s.id, {
        fiscalDeviceId: deviceB,
        reason: 'sessione altrui',
      }),
    ).rejects.toThrow();
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

/**
 * Esegue e restituisce l'errore, invece di lasciare in giro una promessa
 * rifiutata senza gestore.
 */
async function catturaErrore(azione: () => Promise<unknown>): Promise<unknown> {
  try {
    await azione();
  } catch (errore) {
    return errore;
  }
  throw new Error('L’azione doveva fallire, ed è riuscita.');
}

async function creaTenant(prisma: PrismaClient, sigla: string): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} ${sigla}`,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaSede(prisma: PrismaClient, tenantId: string, nome: string): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "locations" ("id","tenant_id","name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} ${nome}`,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaDispositivo(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  adapterKey: string,
  enabled: boolean,
): Promise<string> {
  const device = await prisma.fiscalDevice.create({
    data: { tenantId, locationId, brand: 'other', adapterKey, enabled, notes: PREFISSO },
  });
  return device.id;
}

async function svuotaSessioni(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_device_changes" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await svuotaSessioni(prisma);
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_devices" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
