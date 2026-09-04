import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904140000_dispositivo_fiscale_neutrale` (tranche C1B).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   unicità per sede ancora attiva   due dispositivi sulla stessa sede DEVONO entrare
 *   endpoint ancora obbligatorio     un dispositivo cloud senza indirizzo DEVE entrare
 *   adapter legato al produttore     `brand` e `adapterKey` DEVONO essere indipendenti
 *   FK verso un altro tenant         una sede altrui NON deve essere collegabile in silenzio
 *   storico riscritto                disabilitare un dispositivo NON tocca le sue ricevute
 * ```
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C1B';

describe('dispositivo fiscale provider-neutral — C1B su PostgreSQL TEST', () => {
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

  it('accetta PIÙ dispositivi sulla stessa sede', async () => {
    const uno = await prisma.fiscalDevice.create({
      data: { tenantId: tenantA, locationId: sedeA, brand: 'other', endpoint: 'https://cassa-1' },
    });
    const due = await prisma.fiscalDevice.create({
      data: { tenantId: tenantA, locationId: sedeA, brand: 'other', endpoint: 'https://cassa-2' },
    });

    expect(uno.id).not.toBe(due.id);
    expect(await prisma.fiscalDevice.count({ where: { locationId: sedeA } })).toBe(2);
  });

  // ── Le garanzie che i vecchi vincoli fornivano ──────────────────────────
  //
  // ⛔ La flessibilità da sola non basta: l'unicità per sede rendeva la
  //    selezione deterministica, l'endpoint obbligatorio impediva le
  //    configurazioni incomplete, e salvare rendeva il dispositivo operativo.
  //    Questi test provano che quelle garanzie sono tornate in altra forma.

  it('un dispositivo nasce SPENTO, non attivo appena censito', async () => {
    const device = await prisma.fiscalDevice.create({
      data: { tenantId: tenantA, locationId: sedeA, brand: 'other' },
    });

    expect(device.enabled).toBe(false);
  });

  it('il database RIFIUTA di abilitare un dispositivo senza adapter', async () => {
    await expect(
      prisma.fiscalDevice.create({
        data: {
          tenantId: tenantA,
          locationId: sedeA,
          brand: 'other',
          enabled: true,
          // adapterKey assente: non si sa con chi si parlerebbe
        },
      }),
    ).rejects.toThrow();
  });

  it('e rifiuta anche di abilitarlo DOPO, togliendo l_adapter', async () => {
    const device = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'other',
        adapterKey: 'fornitore.protocollo.v1',
        enabled: true,
      },
    });
    expect(device.enabled).toBe(true);

    // Il vincolo regge anche sull'aggiornamento: è un CHECK, non una
    // validazione di servizio che si aggira passando da un'altra strada.
    await expect(
      prisma.fiscalDevice.update({ where: { id: device.id }, data: { adapterKey: null } }),
    ).rejects.toThrow();
  });

  it('accetta un dispositivo SENZA indirizzo: il trasporto non è deciso', async () => {
    const cloud = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'other',
        adapterKey: 'fornitore.cloud.v1',
      },
    });

    expect(cloud.endpoint).toBeNull();
    expect(cloud.adapterKey).toBe('fornitore.cloud.v1');
  });

  it('produttore e adapter sono indipendenti', async () => {
    // Stessa marca, due protocolli diversi: è il caso che un enum di
    // produttore, usato come selettore, non saprebbe rappresentare.
    const a = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'epson',
        adapterKey: 'fornitore.protocollo-a.v1',
        firmwareVersion: '1.2.3',
      },
    });
    const b = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'epson',
        adapterKey: 'fornitore.protocollo-b.v2',
        firmwareVersion: '4.5.6',
      },
    });

    expect(a.brand).toBe(b.brand);
    expect(a.adapterKey).not.toBe(b.adapterKey);
    expect(a.firmwareVersion).not.toBe(b.firmwareVersion);
  });

  it('la configurazione dell_adapter è un dato strutturato, senza segreti', async () => {
    const device = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'other',
        adapterKey: 'fornitore.protocollo.v1',
        adapterConfig: { timeoutMs: 10_000, operatore: '1' },
      },
    });

    expect(device.adapterConfig).toMatchObject({ timeoutMs: 10_000 });
  });

  /**
   * ⚠️ Il database NON impedisce il collegamento cross-tenant: le FK legano
   * gli id uno per uno e il `tenant_id` viaggia in un vincolo separato
   * (`docs/25` §13, limite ereditato). Questo test lo DOCUMENTA invece di
   * fingere una protezione che non c'è: la verifica dovrà essere applicativa,
   * ed è la ragione per cui `docs/25` la richiede prima dei servizi Cassa.
   */
  it('il database NON protegge dal cross-tenant: la guardia dovrà essere applicativa', async () => {
    const incoerente = await prisma.fiscalDevice.create({
      data: { tenantId: tenantA, locationId: sedeB, brand: 'other' },
    });

    expect(incoerente.tenantId).toBe(tenantA);
    const sede = await prisma.location.findUnique({ where: { id: sedeB } });
    expect(sede?.tenantId).toBe(tenantB);

    await prisma.fiscalDevice.delete({ where: { id: incoerente.id } });
  });

  it('disabilitare un dispositivo NON tocca le ricevute già emesse', async () => {
    const device = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenantA,
        locationId: sedeA,
        brand: 'other',
        // ⚠️ L'adapter serve per poterlo abilitare: e' il CHECK
        //    `fiscal_devices_enabled_requires_adapter`.
        adapterKey: 'fornitore.protocollo.v1',
        enabled: true,
      },
    });
    const documento = await creaDocumento(prisma, tenantA, sedeA);
    const ricevuta = await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenantA,
        documentId: documento,
        deviceId: device.id,
        status: 'emitted',
        fiscalNumber: '0034',
        closureNumber: '0012',
      },
    });

    await prisma.fiscalDevice.update({ where: { id: device.id }, data: { enabled: false } });

    const dopo = await prisma.fiscalReceipt.findUnique({ where: { id: ricevuta.id } });
    expect(dopo?.deviceId).toBe(device.id);
    expect(dopo?.fiscalNumber).toBe('0034');
    expect(dopo?.closureNumber).toBe('0012');
    expect(dopo?.status).toBe('emitted');
  });

  /**
   * ⚠️ Dimostra il difetto segnalato in `docs/25` §10 e NON corretto in C1B:
   * `documentId` è unico e i campi di esito sono scalari singoli, quindi un
   * secondo tentativo sovrascrive la risposta del primo. Con un esito incerto
   * è proprio la traccia che servirebbe.
   */
  it('la cronologia dei tentativi OGGI si perde: il secondo sovrascrive il primo', async () => {
    const device = await prisma.fiscalDevice.create({
      data: { tenantId: tenantA, locationId: sedeA, brand: 'other' },
    });
    const documento = await creaDocumento(prisma, tenantA, sedeA);

    const primo = await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenantA,
        documentId: documento,
        deviceId: device.id,
        status: 'failed',
        errorMessage: 'primo tentativo: nessuna risposta',
      },
    });
    await prisma.fiscalReceipt.update({
      where: { id: primo.id },
      data: { status: 'emitted', errorMessage: null, fiscalNumber: '0002', closureNumber: '0001' },
    });

    const finale = await prisma.fiscalReceipt.findUnique({ where: { id: primo.id } });
    // Del primo tentativo non resta traccia: è il difetto, non il contratto.
    expect(finale?.errorMessage).toBeNull();
    expect(await prisma.fiscalReceipt.count({ where: { documentId: documento } })).toBe(1);
  });
});

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
             CURRENT_DATE, 'collaudo C1B', CURRENT_TIMESTAMP)
     RETURNING "id"`,
    tenantId,
    locationId,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  await prisma.$executeRawUnsafe(
    `DELETE FROM "fiscal_receipts" WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "fiscal_devices" WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "documents" WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "locations" WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
