import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PaymentTenderKind, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SEED_TENDER_KINDS } from '../../payment-options/payment-option-seed.data';
import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904170000_classificazione_incasso` (tranche C2B).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il backfill classifica per NOME      rinominare NON deve cambiare nulla
 *   classifica anche le personalizzate   una voce non di sistema resta NULL
 *   deriva dal catalogo normativo        MP04 è «contanti» e DEVE restare NULL
 *   una condizione si può classificare   il database DEVE rifiutarlo
 *   il backup vecchio non si importa     righe senza `tender_kind` DEVONO entrare
 *   un valore sbagliato entra a metà     il ripristino DEVE fallire per intero
 * ```
 *
 * ⚠️ La mappa non si ricopia: si **estrae dal file della migration** e si
 * confronta con quella del seed. Due copie della stessa regola divergono, e la
 * divergenza qui significherebbe che un tenant nuovo nasce classificato in modo
 * diverso da uno preesistente.
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C2B';

describe('classificazione operativa dei Tipi pagamento — C2B su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let tenant = '';
  let idMp01 = '';
  let idMp04 = '';
  let idMp08 = '';

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await pulisci(prisma);

    tenant = await creaTenant(prisma, 1);
    [idMp01, idMp04, idMp08] = await Promise.all([
      idCodice(prisma, 'MP01'),
      idCodice(prisma, 'MP04'),
      idCodice(prisma, 'MP08'),
    ]);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  // ── La mappa è UNA ────────────────────────────────────────────────────────

  it('la mappa del seed e quella della migration coincidono', () => {
    const sql = leggiMigration();
    const dallaMigration = new Map<string, string>();

    // Ogni UPDATE del backfill nomina il proprio codice e la propria classe.
    for (const blocco of sql.split('UPDATE "payment_options"').slice(1)) {
      const codice = blocco.match(/pmc\."code" = '(MP\d\d)'/)?.[1];
      const classe = blocco.match(/SET "tender_kind" = '(\w+)'/)?.[1];
      if (codice && classe) {
        dallaMigration.set(codice, classe);
      }
    }

    expect(dallaMigration.size).toBeGreaterThan(0);
    expect(Object.fromEntries(dallaMigration)).toEqual(SEED_TENDER_KINDS);
  });

  // ── Il backfill ───────────────────────────────────────────────────────────

  it('classifica le voci di sistema secondo la mappa, e SOLO quelle', async () => {
    await creaVoce(prisma, tenant, 'Contanti (MP01)', idMp01, true);
    await creaVoce(prisma, tenant, 'Contanti presso Tesoreria (MP04)', idMp04, true);
    await creaVoce(prisma, tenant, 'Carta di pagamento (MP08)', idMp08, true);
    // ⚠️ Personalizzata, collegata allo STESSO codice di una classificata.
    await creaVoce(prisma, tenant, 'PayPal', idMp01, false);

    await eseguiBackfill(prisma);

    expect(await classeDi(prisma, tenant, 'Contanti (MP01)')).toBe('cash');
    expect(await classeDi(prisma, tenant, 'Carta di pagamento (MP08)')).toBe('electronic');
    // ⛔ MP04 è «contanti» per la normativa, ma non è la cassa del negozio:
    //    dedurre dal catalogo l'avrebbe classificata.
    expect(await classeDi(prisma, tenant, 'Contanti presso Tesoreria (MP04)')).toBeNull();
    // ⛔ Personalizzata: chi l'ha creata sa cos'è, il gestionale non lo indovina.
    expect(await classeDi(prisma, tenant, 'PayPal')).toBeNull();
  });

  /**
   * ⭐ La condizione che ha deciso la forma della mappa: se la chiave fosse il
   * nome, questa voce non verrebbe classificata.
   */
  it('una voce di sistema RINOMINATA viene classificata lo stesso', async () => {
    await creaVoce(prisma, tenant, 'Soldi in cassa', idMp01, true);

    await eseguiBackfill(prisma);

    expect(await classeDi(prisma, tenant, 'Soldi in cassa')).toBe('cash');
  });

  it('una voce SCOLLEGATA dal catalogo resta NULL', async () => {
    await creaVoce(prisma, tenant, 'Contanti senza codice', null, true);

    await eseguiBackfill(prisma);

    expect(await classeDi(prisma, tenant, 'Contanti senza codice')).toBeNull();
  });

  it('il backfill è idempotente: rieseguirlo non cambia nulla', async () => {
    await creaVoce(prisma, tenant, 'Contanti bis (MP01)', idMp01, true);

    await eseguiBackfill(prisma);
    const prima = await classeDi(prisma, tenant, 'Contanti bis (MP01)');
    await eseguiBackfill(prisma);

    expect(await classeDi(prisma, tenant, 'Contanti bis (MP01)')).toBe(prima);
  });

  // ── Il vincolo ────────────────────────────────────────────────────────────

  it('il database RIFIUTA di classificare una condizione di pagamento', async () => {
    await expect(
      prisma.paymentOption.create({
        data: {
          tenantId: tenant,
          kind: 'terms',
          name: `${PREFISSO} 30 gg`,
          sortOrder: 900,
          tenderKind: 'cash',
        },
      }),
    ).rejects.toThrow();
  });

  it('e rifiuta anche di classificarla DOPO averla creata', async () => {
    const condizione = await prisma.paymentOption.create({
      data: { tenantId: tenant, kind: 'terms', name: `${PREFISSO} 60 gg`, sortOrder: 901 },
    });

    await expect(
      prisma.paymentOption.update({
        where: { id: condizione.id },
        data: { tenderKind: 'electronic' },
      }),
    ).rejects.toThrow();
  });

  it('accetta tutte e tre le classi su un Tipo, `voucher` compresa', async () => {
    const classi: PaymentTenderKind[] = ['cash', 'electronic', 'voucher'];

    for (const classe of classi) {
      const voce = await prisma.paymentOption.create({
        data: {
          tenantId: tenant,
          kind: 'method',
          name: `${PREFISSO} ${classe}`,
          sortOrder: 910,
          tenderKind: classe,
        },
      });
      expect(voce.tenderKind).toBe(classe);
    }
  });

  // ── Il backup ─────────────────────────────────────────────────────────────
  //
  // ⚠️ L'export è `findMany` e l'import è `createMany`: si collauda la forma
  //    dei dati che vi transitano, che è ciò che il backup davvero fa.

  it('un backup PRECEDENTE, senza `tenderKind`, si importa', async () => {
    const vecchio = {
      id: crypto.randomUUID(),
      tenantId: tenant,
      kind: 'method' as const,
      name: `${PREFISSO} da backup vecchio`,
      sortOrder: 920,
      isSystem: false,
      isActive: true,
      methodCodeId: null,
      // ⛔ La chiave NON c'è, com'è in un backup fatto prima di C2B.
    };

    await prisma.paymentOption.createMany({ data: [vecchio] });

    const riletta = await prisma.paymentOption.findUnique({ where: { id: vecchio.id } });
    expect(riletta?.tenderKind).toBeNull();
  });

  it('un backup NUOVO conserva il valore', async () => {
    const nuovo = {
      id: crypto.randomUUID(),
      tenantId: tenant,
      kind: 'method' as const,
      name: `${PREFISSO} da backup nuovo`,
      sortOrder: 921,
      isSystem: false,
      isActive: true,
      methodCodeId: null,
      tenderKind: 'electronic' as const,
    };

    await prisma.paymentOption.createMany({ data: [nuovo] });

    const riletta = await prisma.paymentOption.findUnique({ where: { id: nuovo.id } });
    expect(riletta?.tenderKind).toBe('electronic');
  });

  /**
   * ⛔ Atomico: un valore non valido non deve lasciare dentro le righe buone che
   * lo precedono. L'import gira già in transazione, e qui si prova che il
   * rifiuto arriva dal database e non da una validazione applicativa aggirabile.
   */
  it('un valore NON VALIDO fa fallire il ripristino per intero', async () => {
    const buona = crypto.randomUUID();
    const cattiva = crypto.randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.paymentOption.createMany({
          data: [
            {
              id: buona,
              tenantId: tenant,
              kind: 'method',
              name: `${PREFISSO} riga buona`,
              sortOrder: 930,
              tenderKind: 'cash',
            },
          ],
        });
        // `contante` non esiste nell'enum: il tipo lo vieta, e qui si verifica
        // che lo vieti anche il DATABASE, che è la garanzia vera.
        await tx.$executeRawUnsafe(
          `INSERT INTO "payment_options"
             ("id","tenant_id","kind","name","sort_order","tender_kind","updated_at")
           VALUES ($1::uuid, $2::uuid, 'method', $3, 931, 'contante', CURRENT_TIMESTAMP)`,
          cattiva,
          tenant,
          `${PREFISSO} riga cattiva`,
        );
      }),
    ).rejects.toThrow();

    // ⭐ La riga buona NON è rimasta: è questa l'atomicità.
    expect(await prisma.paymentOption.findUnique({ where: { id: buona } })).toBeNull();
    expect(await prisma.paymentOption.findUnique({ where: { id: cattiva } })).toBeNull();
  });

  it('il catalogo globale dei codici NON appartiene al tenant', async () => {
    // ⛔ `payment_method_codes` non ha `tenant_id`: non può finire in un backup
    //    di tenant, e quindi non può essere duplicato al ripristino.
    const colonne = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT "column_name" FROM information_schema.columns
        WHERE "table_name" = 'payment_method_codes'`,
    );
    expect(colonne.map((c) => c.column_name)).not.toContain('tenant_id');
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

/** Il file della migration, per estrarne la mappa invece di ricopiarla. */
function leggiMigration(): string {
  return readFileSync(
    join(__dirname, '../../../prisma/migrations/20260904170000_classificazione_incasso/migration.sql'),
    'utf8',
  );
}

/** Riesegue i soli `UPDATE` del backfill, presi dal file della migration. */
async function eseguiBackfill(prisma: PrismaClient): Promise<void> {
  const sql = leggiMigration();
  for (const blocco of sql.split(';')) {
    if (blocco.includes('UPDATE "payment_options"')) {
      await prisma.$executeRawUnsafe(blocco);
    }
  }
}

async function idCodice(prisma: PrismaClient, code: string): Promise<string> {
  const riga = await prisma.paymentMethodCode.findUnique({ where: { code } });
  if (!riga) throw new Error(`codice ${code} assente: la migration C2A non è applicata`);
  return riga.id;
}

async function creaVoce(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
  methodCodeId: string | null,
  isSystem: boolean,
): Promise<void> {
  await prisma.paymentOption.create({
    data: {
      tenantId,
      kind: 'method',
      name: `${PREFISSO} ${name}`,
      sortOrder: 1,
      isSystem,
      methodCodeId,
    },
  });
}

async function classeDi(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
): Promise<PaymentTenderKind | null> {
  const voce = await prisma.paymentOption.findFirst({
    where: { tenantId, name: `${PREFISSO} ${name}` },
  });
  if (!voce) throw new Error(`voce «${name}» non trovata`);
  return voce.tenderKind;
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

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  await prisma.$executeRawUnsafe(
    `DELETE FROM "payment_options" WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
