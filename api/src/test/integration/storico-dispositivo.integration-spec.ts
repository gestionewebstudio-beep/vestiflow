import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904180000_vocabolario_chiusura_e_storico_dispositivo`
 * (tranche C2C).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il vocabolario è ancora card/other   le vecchie colonne NON devono esistere
 *   lo storico si può correggere         non c'è `updated_at`, e non deve esserci
 *   una riga può dire «da X a X»         il database DEVE rifiutarla
 *   una riga può non dire nulla          due NULL DEVONO essere rifiutati
 *   cancellare un dispositivo è lecito   con storico DEVE essere impedito
 *   disabilitare rompe lo storico        NON deve toccarlo
 * ```
 *
 * ⚠️ Nessuna API scrive ancora questa tabella: C2C consolida lo schema, e i
 * servizi sono di C3. Qui si prova che il DATABASE regge il contratto — che è
 * la parte che non si può aggirare passando da un'altra strada.
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C2C';

describe('vocabolario della chiusura e storico dispositivo — C2C su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let tenant = '';
  let sede = '';
  let sessione = '';
  let principale = '';
  let riserva = '';

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await pulisci(prisma);

    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant);
    principale = await creaDispositivo(prisma, tenant, sede, 'principale');
    riserva = await creaDispositivo(prisma, tenant, sede, 'riserva');
    sessione = await creaSessione(prisma, tenant, sede, principale);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  // ── Il vocabolario della chiusura ─────────────────────────────────────────

  it('le colonne parlano il vocabolario di C2B, non più card/other', async () => {
    const colonne = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT "column_name" FROM information_schema.columns
        WHERE "table_name" = 'cash_sessions'
          AND ("column_name" LIKE 'counted_%' OR "column_name" LIKE 'expected_%'
               OR "column_name" LIKE 'declared_%')`,
    );
    const nomi = colonne.map((c) => c.column_name).sort();

    expect(nomi).toEqual([
      'counted_cash_minor',
      'declared_electronic_minor',
      'expected_cash_minor',
      'expected_electronic_minor',
    ]);
  });

  /**
   * ⛔ `other` era la DISCARICA dei metodi sconosciuti, non i buoni: rinominarla
   * in `voucher` avrebbe scritto una cosa per un'altra. E una colonna voucher
   * non si aggiunge finché i buoni non sono abilitati.
   */
  it('non esiste nessuna colonna voucher, e non è una dimenticanza', async () => {
    const colonne = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT "column_name" FROM information_schema.columns
        WHERE "table_name" = 'cash_sessions' AND "column_name" LIKE '%voucher%'`,
    );

    expect(colonne).toHaveLength(0);
  });

  it('gli attesi restano NULL: li calcola e li congela C4B', async () => {
    const riga = await prisma.cashSession.findUnique({ where: { id: sessione } });

    expect(riga?.expectedCashMinor).toBeNull();
    expect(riga?.expectedElectronicMinor).toBeNull();
    expect(riga?.countedCashMinor).toBeNull();
    expect(riga?.declaredElectronicMinor).toBeNull();
  });

  it('il conteggio contante e la dichiarazione elettronica si scrivono e convivono', async () => {
    const chiusa = await prisma.cashSession.update({
      where: { id: sessione },
      data: {
        // Il contante si CONTA…
        countedCashMinor: 12_345,
        // …l'elettronico si DICHIARA leggendolo sul POS, ed è facoltativo.
        declaredElectronicMinor: 6_700,
      },
    });

    expect(chiusa.countedCashMinor).toBe(12_345);
    expect(chiusa.declaredElectronicMinor).toBe(6_700);

    // ⭐ La differenza NON è una colonna: si calcola dai due congelati.
    await prisma.cashSession.update({
      where: { id: sessione },
      data: { expectedCashMinor: 12_000, countedCashMinor: 12_345 },
    });
    const riletta = await prisma.cashSession.findUnique({ where: { id: sessione } });
    expect((riletta?.countedCashMinor ?? 0) - (riletta?.expectedCashMinor ?? 0)).toBe(345);
  });

  it('la dichiarazione elettronica può restare NULL: «non riconciliato» è legittimo', async () => {
    const altra = await creaSessione(prisma, tenant, sede, null, 'senza riconciliazione');
    await prisma.cashSession.update({
      where: { id: altra },
      data: { countedCashMinor: 5_000, status: 'closed', closedAt: new Date() },
    });

    const riga = await prisma.cashSession.findUnique({ where: { id: altra } });
    expect(riga?.countedCashMinor).toBe(5_000);
    expect(riga?.declaredElectronicMinor).toBeNull();
  });

  // ── Lo storico append-only ────────────────────────────────────────────────

  it('registra il PRIMO assegnamento con precedente NULL', async () => {
    const riga = await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: tenant,
        locationId: sede,
        sessionId: sessione,
        previousDeviceId: null,
        newDeviceId: principale,
        reason: `${PREFISSO} apertura sessione`,
        changedByName: `${PREFISSO} operatore`,
      },
    });

    expect(riga.previousDeviceId).toBeNull();
    expect(riga.newDeviceId).toBe(principale);
  });

  it('registra il passaggio al muletto, e la RIMOZIONE con nuovo NULL', async () => {
    const passaggio = await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: tenant,
        locationId: sede,
        sessionId: sessione,
        previousDeviceId: principale,
        newDeviceId: riserva,
        reason: `${PREFISSO} guasto del principale`,
        changedByName: `${PREFISSO} operatore`,
      },
    });
    const rimozione = await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: tenant,
        locationId: sede,
        sessionId: sessione,
        previousDeviceId: riserva,
        newDeviceId: null,
        reason: `${PREFISSO} si smette di fiscalizzare`,
        changedByName: `${PREFISSO} operatore`,
      },
    });

    expect(passaggio.previousDeviceId).toBe(principale);
    expect(passaggio.newDeviceId).toBe(riserva);
    expect(rimozione.newDeviceId).toBeNull();
  });

  /**
   * ⭐ Il vincolo che questa prova falsifica: `IS DISTINCT FROM`, non `<>`.
   * Con `<>` due NULL avrebbero prodotto NULL, che per un CHECK vale «passa».
   */
  it('il database RIFIUTA una riga che va da un dispositivo a SE STESSO', async () => {
    await expect(
      prisma.cashSessionDeviceChange.create({
        data: {
          tenantId: tenant,
          locationId: sede,
          sessionId: sessione,
          previousDeviceId: principale,
          newDeviceId: principale,
          reason: `${PREFISSO} cambio che non cambia`,
          changedByName: `${PREFISSO} operatore`,
        },
      }),
    ).rejects.toThrow();
  });

  /**
   * ⚠️ A rifiutarla e' il CHECK `devices_differ`, non `one_device_present`:
   * `NULL IS DISTINCT FROM NULL` vale `false`. Il secondo vincolo e' quindi
   * ridondante — misurato provando a falsificarlo, e la prova resta verde
   * anche togliendolo. Il COMPORTAMENTO qui verificato e' comunque quello
   * richiesto, ed e' cio' che conta per chi scrivera' i servizi di C3.
   */
  it('e RIFIUTA una riga che non nomina alcun dispositivo', async () => {
    await expect(
      prisma.cashSessionDeviceChange.create({
        data: {
          tenantId: tenant,
          locationId: sede,
          sessionId: sessione,
          previousDeviceId: null,
          newDeviceId: null,
          reason: `${PREFISSO} riga muta`,
          changedByName: `${PREFISSO} operatore`,
        },
      }),
    ).rejects.toThrow();
  });

  it('non esiste `updated_at`: una riga di storico non si corregge in posto', async () => {
    const colonne = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT "column_name" FROM information_schema.columns
        WHERE "table_name" = 'cash_session_device_changes' AND "column_name" = 'updated_at'`,
    );

    expect(colonne).toHaveLength(0);
  });

  it('la causale è obbligatoria', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "cash_session_device_changes"
           ("id","tenant_id","location_id","session_id","new_device_id","changed_by_name")
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)`,
        tenant,
        sede,
        sessione,
        riserva,
        `${PREFISSO} senza causale`,
      ),
    ).rejects.toThrow();
  });

  // ── Gli `onDelete` che preservano lo storico ─────────────────────────────

  /**
   * ⛔ Era la scelta da non ripetere: `SET NULL` avrebbe azzerato proprio
   * l'identità che lo storico esiste per conservare, e in silenzio.
   */
  it('un dispositivo nominato nello storico NON si cancella', async () => {
    await expect(prisma.fiscalDevice.delete({ where: { id: riserva } })).rejects.toThrow();
    await expect(prisma.fiscalDevice.delete({ where: { id: principale } })).rejects.toThrow();
  });

  it('DISABILITARE il dispositivo non tocca lo storico: è la strada prevista', async () => {
    const prima = await prisma.cashSessionDeviceChange.count({ where: { sessionId: sessione } });

    await prisma.fiscalDevice.update({ where: { id: principale }, data: { enabled: false } });

    const dopo = await prisma.cashSessionDeviceChange.findMany({
      where: { sessionId: sessione },
      orderBy: { createdAt: 'asc' },
    });
    expect(dopo).toHaveLength(prima);
    expect(
      dopo.some((r) => r.previousDeviceId === principale || r.newDeviceId === principale),
    ).toBe(true);
  });

  /**
   * ⚠️ Documenta il limite ereditato di `docs/25` §13, e dice che cosa resta al
   * validatore transazionale di C3: le FK legano gli identificativi uno per
   * uno, quindi il database accetta una riga di storico che nomina una sessione
   * di un'altra sede.
   */
  it('il database NON verifica che la sessione appartenga alla sede indicata', async () => {
    const altraSede = await creaSede(prisma, tenant, 'Sede B');

    const incoerente = await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: tenant,
        // ⛔ Sede diversa da quella della sessione: passa, e non deve.
        locationId: altraSede,
        sessionId: sessione,
        newDeviceId: riserva,
        reason: `${PREFISSO} incoerente`,
        changedByName: `${PREFISSO} operatore`,
      },
    });

    expect(incoerente.locationId).toBe(altraSede);
    const s = await prisma.cashSession.findUnique({ where: { id: sessione } });
    expect(s?.locationId).toBe(sede);
  });

  it('cancellare la SESSIONE porta via il suo storico, e nient_altro', async () => {
    const usaEGetta = await creaSessione(prisma, tenant, sede, null, 'usa e getta');
    await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: tenant,
        locationId: sede,
        sessionId: usaEGetta,
        newDeviceId: riserva,
        reason: `${PREFISSO} storico effimero`,
        changedByName: `${PREFISSO} operatore`,
      },
    });

    await prisma.cashSession.delete({ where: { id: usaEGetta } });

    expect(await prisma.cashSessionDeviceChange.count({ where: { sessionId: usaEGetta } })).toBe(0);
    // Il dispositivo resta: la cascata è sulla sessione, non su di lui.
    expect(await prisma.fiscalDevice.findUnique({ where: { id: riserva } })).not.toBeNull();
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

async function creaTenant(prisma: PrismaClient): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} 1`,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaSede(prisma: PrismaClient, tenantId: string, nome = 'Sede A'): Promise<string> {
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
  ruolo: string,
): Promise<string> {
  const device = await prisma.fiscalDevice.create({
    data: {
      tenantId,
      locationId,
      brand: 'other',
      adapterKey: `fornitore.${ruolo}.v1`,
      notes: `${PREFISSO} ${ruolo}`,
    },
  });
  return device.id;
}

/**
 * ⚠️ Le sessioni nascono CHIUSE: l'indice parziale ammette una sola sessione
 * aperta per sede, ed è il vincolo che rende «principale + riserva» diverso da
 * «due postazioni» (`docs/25` §10).
 */
async function creaSessione(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  fiscalDeviceId: string | null,
  nota = 'principale',
): Promise<string> {
  const s = await prisma.cashSession.create({
    data: {
      tenantId,
      locationId,
      fiscalDeviceId,
      openedByName: `${PREFISSO} operatore`,
      notes: `${PREFISSO} ${nota}`,
      status: 'closed',
      closedAt: new Date(),
    },
  });
  return s.id;
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_device_changes" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_devices" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
