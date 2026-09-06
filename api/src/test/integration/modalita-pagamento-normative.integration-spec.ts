import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904120000_modalita_pagamento_normative` (tranche C2A).
 *
 * ⭐ **Il backfill si verifica RIESEGUENDO le UPDATE del file di migration**,
 *    non una loro copia: una copia che diverge dall'originale collauda se
 *    stessa. Le due istruzioni si estraggono dal `.sql` e si applicano a
 *    fixture che riproducono le 148 forme censite il 04/09/2026.
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   backfill per regex        «Bonifico (MP05) - ns. banca» NON si collega
 *   backfill sulle custom     una voce non di sistema NON si collega
 *   backfill sulle condizioni «30 gg f.m.» non prende mai un codice
 *   Contrassegno/PayPal       restano scollegate: sono decisioni, non omissioni
 *   CHECK assente             collegare un terms deve essere RIFIUTATO dal database
 *   FK SET NULL invece di RESTRICT   cancellare un codice in uso deve essere RIFIUTATO
 * ```
 *
 * Tutto in SQL grezzo e con tenant propri, cancellati alla fine: la suite gira
 * sul PostgreSQL usa-e-getta, mai su DEV (vedi `env.ts`).
 */

/** Le 23 voci del seed corrente, col codice fra parentesi nel nome. */
const MODERNE: readonly (readonly [string, string])[] = [
  ['Contanti (MP01)', 'MP01'],
  ['Assegno (MP02)', 'MP02'],
  ['Assegno circolare (MP03)', 'MP03'],
  ['Contanti presso Tesoreria (MP04)', 'MP04'],
  ['Bonifico (MP05)', 'MP05'],
  ['Vaglia cambiario (MP06)', 'MP06'],
  ['Bollettino bancario (MP07)', 'MP07'],
  ['Carta di pagamento (MP08)', 'MP08'],
  ['RID (MP09)', 'MP09'],
  ['RID utenze (MP10)', 'MP10'],
  ['RID veloce (MP11)', 'MP11'],
  ['RIBA (MP12)', 'MP12'],
  ['MAV (MP13)', 'MP13'],
  ['Quietanza erario (MP14)', 'MP14'],
  ['Giroconto su conti di contabilità speciale (MP15)', 'MP15'],
  ['Domiciliazione bancaria (MP16)', 'MP16'],
  ['Domiciliazione postale (MP17)', 'MP17'],
  ['Bollettino di c/c postale (MP18)', 'MP18'],
  ['SEPA Direct Debit (MP19)', 'MP19'],
  ['SEPA Direct Debit CORE (MP20)', 'MP20'],
  ['SEPA Direct Debit B2B (MP21)', 'MP21'],
  ['Trattenuta su somme già riscosse (MP22)', 'MP22'],
  ['PagoPA (MP23)', 'MP23'],
];

/** Le sette voci di un seed precedente: cinque collegabili, due no. */
const LEGACY: readonly string[] = [
  'Contanti',
  'Assegno',
  'Bonifico bancario',
  'Carta di pagamento',
  'RiBa',
  'Contrassegno',
  'PayPal',
];

const TERMS: readonly string[] = [
  'Vista fattura',
  '30 gg d.f.',
  '30 gg f.m.',
  '60 gg d.f.',
  '60 gg f.m.',
  '90 gg d.f.',
  'Pagamento anticipato',
];

const PREFISSO_TENANT = 'COLLAUDO C2A';

describe('migration modalità pagamento normative — C2A su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let tenants: string[] = [];
  /**
   * ⚠️ Con `noUncheckedIndexedAccess` l'accesso per indice dà
   * `string | undefined`, e `tenantId` di Prisma vuole `string`. Un tenant
   * di prova mancante è un guasto del `beforeAll`, non un caso da propagare.
   */
  const tenantDiProva = (i: number): string => {
    const id = tenants[i];
    if (!id) throw new Error(`tenant di prova ${i} non creato`);
    return id;
  };

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await pulisci(prisma);

    tenants = [];
    for (let i = 1; i <= 4; i++) {
      const riga = await unaRiga<{ id: string }>(
        prisma,
        `INSERT INTO "tenants" ("id","name","updated_at")
         VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
        `${PREFISSO_TENANT} ${i}`,
      );
      tenants.push(riga.id);
    }

    for (const tenantId of tenants) {
      const voci: readonly (readonly [string, string, number, boolean])[] = [
        ...MODERNE.map(([nome], i) => [nome, 'method', i + 1, true] as const),
        ...LEGACY.map((nome, i) => [nome, 'method', 100 + i, true] as const),
        ...TERMS.map((nome, i) => [nome, 'terms', i + 1, true] as const),
        // Le due esche del backfill: stesso testo, condizioni diverse.
        ['Bonifico (MP05) - ns. banca', 'method', 200, true] as const,
        ['Contanti (MP01)', 'method', 201, false] as const,
      ];
      for (const [nome, kind, ordine, sistema] of voci) {
        // La voce «Contanti (MP01)» non di sistema collide con quella di
        // sistema sul vincolo (tenant, kind, name): le si dà un nome proprio.
        const finale = !sistema ? `${nome} [custom]` : nome;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "payment_options" ("id","tenant_id","kind","name","sort_order","is_system","updated_at")
           VALUES (gen_random_uuid(), $1::uuid, $2::"PaymentOptionKind", $3, $4, $5, CURRENT_TIMESTAMP)`,
          tenantId,
          kind,
          finale,
          ordine,
          sistema,
        );
      }
    }

    // Le UPDATE vere, estratte dal file di migration.
    for (const istruzione of await leggiUpdateDellaMigration()) {
      await prisma.$executeRawUnsafe(istruzione);
    }
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  it('il catalogo globale porta i 23 codici normativi', async () => {
    const riga = await unaRiga<{ n: bigint }>(
      prisma,
      `SELECT count(*) AS n FROM "payment_method_codes"`,
    );
    expect(Number(riga.n)).toBe(23);

    const mp05 = await unaRiga<{ label: string }>(
      prisma,
      `SELECT "label" FROM "payment_method_codes" WHERE "code" = 'MP05'`,
    );
    expect(mp05.label).toBe('Bonifico');
  });

  it('collega le 92 voci moderne e le 20 legacy: 112 su 148', async () => {
    const riga = await unaRiga<{ totale: bigint; collegate: bigint }>(
      prisma,
      `SELECT count(*) AS totale, count("method_code_id") AS collegate
       FROM "payment_options"
       WHERE "tenant_id" = ANY($1::uuid[])
         AND "name" NOT LIKE '%[custom]' AND "name" <> 'Bonifico (MP05) - ns. banca'`,
      tenants,
    );
    expect(Number(riga.totale)).toBe(148);
    expect(Number(riga.collegate)).toBe(112);
  });

  it('ogni voce moderna punta al PROPRIO codice, non a uno qualsiasi', async () => {
    const righe = await prisma.$queryRawUnsafe<{ name: string; code: string }[]>(
      `SELECT po."name", pmc."code"
       FROM "payment_options" po
       JOIN "payment_method_codes" pmc ON pmc."id" = po."method_code_id"
       WHERE po."tenant_id" = $1::uuid AND po."name" LIKE '%(MP__)'`,
      tenants[0],
    );
    expect(righe).toHaveLength(23);
    for (const [nome, codice] of MODERNE) {
      expect(righe.find((r) => r.name === nome)?.code).toBe(codice);
    }
  });

  it('collega le cinque legacy alla modalità decisa una per una', async () => {
    const attese: readonly (readonly [string, string])[] = [
      ['Contanti', 'MP01'],
      ['Assegno', 'MP02'],
      ['Bonifico bancario', 'MP05'],
      ['Carta di pagamento', 'MP08'],
      ['RiBa', 'MP12'],
    ];
    for (const [nome, codice] of attese) {
      const riga = await unaRiga<{ code: string | null }>(
        prisma,
        `SELECT pmc."code"
         FROM "payment_options" po
         LEFT JOIN "payment_method_codes" pmc ON pmc."id" = po."method_code_id"
         WHERE po."tenant_id" = $1::uuid AND po."name" = $2`,
        tenants[0],
        nome,
      );
      expect(riga.code).toBe(codice);
    }
  });

  it('lascia Contrassegno e PayPal scollegate: è una decisione, non un buco', async () => {
    const riga = await unaRiga<{ collegate: bigint }>(
      prisma,
      `SELECT count("method_code_id") AS collegate FROM "payment_options"
       WHERE "tenant_id" = ANY($1::uuid[]) AND "name" IN ('Contrassegno','PayPal')`,
      tenants,
    );
    expect(Number(riga.collegate)).toBe(0);
  });

  it('non tocca le condizioni di pagamento', async () => {
    const riga = await unaRiga<{ collegate: bigint }>(
      prisma,
      `SELECT count("method_code_id") AS collegate FROM "payment_options"
       WHERE "tenant_id" = ANY($1::uuid[]) AND "kind" = 'terms'`,
      tenants,
    );
    expect(Number(riga.collegate)).toBe(0);
  });

  it('NON deduce il codice dall_etichetta: una voce rinominata resta scollegata', async () => {
    const riga = await unaRiga<{ method_code_id: string | null }>(
      prisma,
      `SELECT "method_code_id" FROM "payment_options"
       WHERE "tenant_id" = $1::uuid AND "name" = 'Bonifico (MP05) - ns. banca'`,
      tenants[0],
    );
    expect(riga.method_code_id).toBeNull();
  });

  it('non tocca le voci create dall_utente, anche se il nome coincide', async () => {
    const riga = await unaRiga<{ method_code_id: string | null }>(
      prisma,
      `SELECT "method_code_id" FROM "payment_options"
       WHERE "tenant_id" = $1::uuid AND "is_system" = false`,
      tenants[0],
    );
    expect(riga.method_code_id).toBeNull();
  });

  it('il database RIFIUTA di collegare una condizione di pagamento', async () => {
    const codice = await unaRiga<{ id: string }>(
      prisma,
      `SELECT "id" FROM "payment_method_codes" WHERE "code" = 'MP01'`,
    );
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payment_options" SET "method_code_id" = $1::uuid
         WHERE "tenant_id" = $2::uuid AND "kind" = 'terms' AND "name" = 'Vista fattura'`,
        codice.id,
        tenants[0],
      ),
    ).rejects.toThrow();
  });

  it('il database RIFIUTA di cancellare un codice in uso (RESTRICT, non SET NULL)', async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payment_method_codes" WHERE "code" = 'MP05'`),
    ).rejects.toThrow();
  });

  it('un backup PRECEDENTE a C2A si reimporta senza il campo nuovo', async () => {
    // Come lo scrive `tenant-backup-import.service`: `createMany` con i campi
    // che il backup conteneva. Uno anteriore a C2A non ha `methodCodeId`.
    await prisma.paymentOption.createMany({
      data: [
        {
          tenantId: tenantDiProva(1),
          kind: 'method',
          name: 'Voce da backup vecchio',
          sortOrder: 900,
          isSystem: false,
        },
      ],
    });
    const riga = await prisma.paymentOption.findFirst({
      where: { tenantId: tenantDiProva(1), name: 'Voce da backup vecchio' },
    });
    expect(riga?.methodCodeId).toBeNull();
  });

  it('un backup SUCCESSIVO conserva il collegamento nello stesso tenant', async () => {
    const codice = await prisma.paymentMethodCode.findUnique({ where: { code: 'MP05' } });
    await prisma.paymentOption.createMany({
      data: [
        {
          tenantId: tenantDiProva(1),
          kind: 'method',
          name: 'Voce da backup nuovo',
          sortOrder: 901,
          isSystem: false,
          methodCodeId: codice?.id ?? null,
        },
      ],
    });
    const riga = await prisma.paymentOption.findFirst({
      where: { tenantId: tenantDiProva(1), name: 'Voce da backup nuovo' },
    });
    expect(riga?.methodCodeId).toBe(codice?.id);
  });

  it('il purge del tenant non tocca il catalogo globale', async () => {
    const prima = await prisma.paymentMethodCode.count();
    await prisma.paymentOption.deleteMany({ where: { tenantId: tenants[3] } });
    expect(await prisma.paymentMethodCode.count()).toBe(prima);
  });

  it('non riscrive nomi né snapshot: le 148 forme sono ancora quelle', async () => {
    const riga = await unaRiga<{ n: bigint }>(
      prisma,
      `SELECT count(*) AS n FROM "payment_options"
       WHERE "tenant_id" = $1::uuid AND "name" = ANY($2::text[])`,
      tenants[0],
      [...MODERNE.map(([n]) => n), ...LEGACY, ...TERMS],
    );
    expect(Number(riga.n)).toBe(37);
  });
});

/**
 * Estrae le due `UPDATE` dal file di migration.
 *
 * ⛔ Non le riscrive: un test che collauda la propria copia dell'istruzione
 * resta verde anche quando la migration diverge.
 */
async function leggiUpdateDellaMigration(): Promise<string[]> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  // ⚠️ `__dirname` e non `import.meta.url`: il modulo è compilato in
  //    CommonJS, dove `import.meta` non esiste — e il tipo lo rifiuta.
  const qui = __dirname;
  const percorso = join(
    qui,
    '../../../prisma/migrations/20260904120000_modalita_pagamento_normative/migration.sql',
  );
  const sql = await readFile(percorso, 'utf8');
  const istruzioni = sql
    .split(/;\s*(?:\r?\n)/)
    .map((blocco) => blocco.trim())
    .filter((blocco) => /^UPDATE "payment_options"/m.test(blocco.replace(/^--.*$/gm, '').trim()));
  if (istruzioni.length !== 2) {
    throw new Error(`Attese 2 UPDATE nella migration, trovate ${istruzioni.length}`);
  }
  return istruzioni;
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "payment_options" WHERE "tenant_id" IN
       (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`,
    `${PREFISSO_TENANT}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "tenants" WHERE "name" LIKE $1`,
    `${PREFISSO_TENANT}%`,
  );
}

/**
 * Prima riga di una query che ne deve tornare esattamente una.
 *
 * ⚠️ Con `noUncheckedIndexedAccess` la destrutturazione di un array dà
 * `T | undefined`: una query di collaudo che non torna nulla è un guasto,
 * e va detto qui invece di propagarsi come `undefined` in un `expect`.
 */
async function unaRiga<T>(prisma: PrismaClient, sql: string, ...valori: unknown[]): Promise<T> {
  const [riga] = await prisma.$queryRawUnsafe<T[]>(sql, ...valori);
  if (!riga) throw new Error(`la query non ha restituito righe: ${sql.slice(0, 60)}`);
  return riga;
}
