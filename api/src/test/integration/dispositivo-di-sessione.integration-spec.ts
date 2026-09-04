import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904160000_dispositivo_di_sessione` (tranche C1C).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il dispositivo resta implicito   la sessione DEVE poterlo dichiarare
 *   sessione e ricevuta sono uno     DEVONO poter puntare a dispositivi diversi
 *   cancellare azzera lo storico     il database DEVE rifiutare la cancellazione
 *   disabilitare rompe lo storico    disabilitare NON deve toccare nulla
 * ```
 *
 * ⚠️ Il caso che giustifica DUE campi invece di uno è «passaggio al muletto»:
 * la sessione passa alla riserva, e le ricevute già emesse continuano a
 * riferire il principale. Con un campo solo, quell'informazione non esiste.
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C1C';

describe('il dispositivo si lega alla sessione — C1C su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let tenantA = '';
  let tenantB = '';
  let sedeA = '';
  let sedeB = '';

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await pulisci(prisma);

    [tenantA, tenantB] = await Promise.all([creaTenant(prisma, 1), creaTenant(prisma, 2)]);
    sedeA = await creaSede(prisma, tenantA, 'Sede A');
    sedeB = await creaSede(prisma, tenantB, 'Sede B');
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  it('una sessione DICHIARA il proprio dispositivo', async () => {
    const device = await creaDispositivo(prisma, tenantA, sedeA, 'principale');
    const sessione = await creaSessione(prisma, tenantA, sedeA, device.id);

    expect(sessione.fiscalDeviceId).toBe(device.id);

    const riletta = await prisma.cashSession.findUnique({
      where: { id: sessione.id },
      include: { device: true },
    });
    expect(riletta?.device?.adapterKey).toBe('fornitore.principale.v1');
  });

  it('una sessione SENZA dispositivo entra: la sede può non fiscalizzare', async () => {
    const sessione = await creaSessione(prisma, tenantA, sedeA, null);

    expect(sessione.fiscalDeviceId).toBeNull();
  });

  /**
   * ⭐ Il caso che giustifica due campi distinti. La sessione passa al muletto;
   * la ricevuta emessa prima continua a riferire il dispositivo che l'ha
   * prodotta — che è il dato da riconciliare con la chiusura giornaliera di
   * QUEL registratore.
   */
  it('sessione e ricevuta possono puntare a dispositivi DIVERSI', async () => {
    const principale = await creaDispositivo(prisma, tenantA, sedeA, 'principale');
    const riserva = await creaDispositivo(prisma, tenantA, sedeA, 'riserva');
    const sessione = await creaSessione(prisma, tenantA, sedeA, principale.id);

    const documento = await creaDocumento(prisma, tenantA, sedeA);
    const ricevuta = await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenantA,
        documentId: documento,
        deviceId: principale.id,
        status: 'emitted',
        fiscalNumber: '0007',
        closureNumber: '0001',
      },
    });

    // Guasto: la sessione passa alla riserva. È una scrittura esplicita.
    await prisma.cashSession.update({
      where: { id: sessione.id },
      data: { fiscalDeviceId: riserva.id },
    });

    const dopo = await prisma.cashSession.findUnique({ where: { id: sessione.id } });
    const emessa = await prisma.fiscalReceipt.findUnique({ where: { id: ricevuta.id } });

    expect(dopo?.fiscalDeviceId).toBe(riserva.id);
    expect(emessa?.deviceId).toBe(principale.id);
    expect(emessa?.deviceId).not.toBe(dopo?.fiscalDeviceId);
  });

  it('il database RIFIUTA di cancellare un dispositivo usato da una sessione', async () => {
    const device = await creaDispositivo(prisma, tenantA, sedeA, 'principale');
    await creaSessione(prisma, tenantA, sedeA, device.id);

    await expect(prisma.fiscalDevice.delete({ where: { id: device.id } })).rejects.toThrow();
  });

  /**
   * ⛔ Era `ON DELETE SET NULL`: cancellare il dispositivo azzerava il
   * riferimento su tutte le ricevute che aveva emesso, in silenzio. Ogni RT ha
   * numerazione e chiusura giornaliera proprie: senza dispositivo, una ricevuta
   * non è più riconciliabile con la chiusura che la contiene.
   */
  it('e RIFIUTA di cancellare un dispositivo che ha già emesso', async () => {
    const device = await creaDispositivo(prisma, tenantA, sedeA, 'principale');
    const documento = await creaDocumento(prisma, tenantA, sedeA);
    await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenantA,
        documentId: documento,
        deviceId: device.id,
        status: 'emitted',
        fiscalNumber: '0011',
        closureNumber: '0002',
      },
    });

    await expect(prisma.fiscalDevice.delete({ where: { id: device.id } })).rejects.toThrow();
  });

  it('DISABILITARE resta la strada: non tocca né sessione né ricevute', async () => {
    const device = await creaDispositivo(prisma, tenantA, sedeA, 'principale');
    const sessione = await creaSessione(prisma, tenantA, sedeA, device.id);
    const documento = await creaDocumento(prisma, tenantA, sedeA);
    const ricevuta = await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenantA,
        documentId: documento,
        deviceId: device.id,
        status: 'emitted',
        fiscalNumber: '0021',
        closureNumber: '0003',
      },
    });

    await prisma.fiscalDevice.update({ where: { id: device.id }, data: { enabled: false } });

    const s = await prisma.cashSession.findUnique({ where: { id: sessione.id } });
    const r = await prisma.fiscalReceipt.findUnique({ where: { id: ricevuta.id } });
    expect(s?.fiscalDeviceId).toBe(device.id);
    expect(r?.deviceId).toBe(device.id);
    expect(r?.fiscalNumber).toBe('0021');
  });

  /**
   * ⚠️ Documenta il limite ereditato di `docs/25` §13: le chiavi esterne legano
   * gli identificativi uno per uno, quindi il database accetta una sessione del
   * tenant A che punta a un dispositivo censito sulla sede del tenant B.
   *
   * ⛔ **Non è il comportamento atteso della Cassa**: è la ragione per cui la
   * verifica tenant+sede deve esistere nel codice PRIMA che un'API scriva
   * questo campo (`docs/25` §10, condizione obbligatoria 1).
   */
  it('il database NON verifica tenant e sede: la guardia dovrà essere applicativa', async () => {
    const altrui = await creaDispositivo(prisma, tenantB, sedeB, 'principale');
    const sessione = await creaSessione(prisma, tenantA, sedeA, altrui.id);

    expect(sessione.tenantId).toBe(tenantA);
    const device = await prisma.fiscalDevice.findUnique({ where: { id: altrui.id } });
    expect(device?.tenantId).toBe(tenantB);
    expect(device?.locationId).toBe(sedeB);
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

async function creaDispositivo(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  ruolo: 'principale' | 'riserva',
) {
  return prisma.fiscalDevice.create({
    data: {
      tenantId,
      locationId,
      brand: 'other',
      adapterKey: `fornitore.${ruolo}.v1`,
      notes: `${PREFISSO} ${ruolo}`,
    },
  });
}

async function creaSessione(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  fiscalDeviceId: string | null,
) {
  return prisma.cashSession.create({
    data: {
      tenantId,
      locationId,
      fiscalDeviceId,
      openedByName: `${PREFISSO} operatore`,
      // ⚠️ Chiusa subito: l'indice parziale ammette UNA sola sessione aperta
      //    per sede, ed è il vincolo che rende questa tranche «principale +
      //    riserva» invece che «due postazioni» (`docs/25` §10).
      status: 'closed',
      closedAt: new Date(),
    },
  });
}

async function creaTenant(prisma: PrismaClient, n: number): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} ${n}`,
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

async function creaDocumento(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "documents"
       ("id","tenant_id","location_id","type","status","year","document_date",
        "created_by_name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'store_sale'::"DocumentType",
             'confirmed'::"DocumentStatus", EXTRACT(YEAR FROM CURRENT_DATE)::int,
             CURRENT_DATE, 'collaudo C1C', CURRENT_TIMESTAMP)
     RETURNING "id"`,
    tenantId,
    locationId,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_receipts" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  // ⚠️ Dopo le sessioni: la FK è RESTRICT, e cancellarli prima fallirebbe.
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_devices" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
