import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteIntegrazione, ambienteProcessoIntegrazione } from './env';
import { creaClientIntegrazione } from './prisma';

/**
 * La migration dello storico dei collegamenti e' ATOMICA: se fallisce a meta',
 * non lascia dietro nulla.
 *
 * ⭐ **Non e' una proprieta' ovvia**: basta un comando che PostgreSQL rifiuta
 *    dentro una transazione (`CREATE INDEX CONCURRENTLY`, `VACUUM`) perche' il
 *    file smetta di essere applicabile in blocco, e un'interruzione lasci meta'
 *    schema in piedi. La prova sta qui perche' resti vera anche dopo che
 *    qualcuno avra' aggiunto una riga a quel file.
 *
 * ⚠️ **Parentela dichiarata**: `cassa-migrations.integration-spec.ts` ha una
 *    propria copia di questa meccanica (staging + `migrate deploy` sul database
 *    di prova). Non e' stata unificata per non toccare un test della Cassa da
 *    una tranche Shopify: vanno accorpate quando si lavorera' su quel file.
 */
describe('Storico collegamenti Shopify — la migration e` atomica', () => {
  let prisma: PrismaClient;
  let staging: string;
  const apiRoot = resolve('.');
  const MIGRATION = '20260907000000_shopify_link_history';
  const TABELLE = [
    'shopify_shops',
    'shopify_product_links',
    'shopify_variant_links',
    'shopify_location_pairs',
    'shopify_location_links',
  ];

  beforeAll(async () => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    staging = await mkdtemp(join(tmpdir(), 'vestiflow-shopify-rollback-'));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (!staging) return;
    const bersaglio = resolve(staging);
    if (
      dirname(bersaglio) !== resolve(tmpdir()) ||
      !bersaglio.startsWith(resolve(tmpdir()) + sep + 'vestiflow-shopify-rollback-')
    ) {
      throw new Error('Pulizia staging rifiutata: percorso non verificato.');
    }
    await rm(bersaglio, { recursive: true, force: true });
  });

  /** ⛔ Ricrea SOLO `public`, e solo sul database di prova verificato. */
  async function schemaPulito(): Promise<void> {
    const bersaglio = ambienteIntegrazione();
    expect(bersaglio.host).toBe('localhost:5433');
    expect(bersaglio.database).toBe('vestiflow_test');
    const attuale = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (attuale[0]?.name !== 'vestiflow_test') {
      throw new Error('DROP public rifiutato: database inatteso.');
    }
    await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO PUBLIC');
  }

  /**
   * Copia schema e migration in una cartella temporanea. Con `guasta`, alla
   * migration dello storico si aggiunge in coda un errore: e' il modo per
   * provare un fallimento A META', non alla prima istruzione.
   */
  async function prepara(guasta: boolean): Promise<string> {
    const cartella = await mkdtemp(join(staging, guasta ? 'guasta-' : 'integra-'));
    await cp(join(apiRoot, 'prisma'), cartella, { recursive: true });
    if (guasta) {
      const file = join(cartella, 'migrations', MIGRATION, 'migration.sql');
      const contenuto = await readFile(file, 'utf8');
      await writeFile(
        file,
        `${contenuto}\n-- errore iniettato dalla prova di atomicita'\nSELECT 1 FROM tabella_che_non_esiste;\n`,
      );
    }
    await mkdir(dirname(join(cartella, 'schema.prisma')), { recursive: true });
    return join(cartella, 'schema.prisma');
  }

  async function applica(schema: string): Promise<{ codice: number | null; testo: string }> {
    return new Promise((risolvi, rifiuta) => {
      const figlio = spawn(
        process.execPath,
        [join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
        { cwd: apiRoot, windowsHide: true, env: ambienteProcessoIntegrazione() },
      );
      let testo = '';
      figlio.stdout.on('data', (pezzo: Buffer) => (testo += pezzo.toString()));
      figlio.stderr.on('data', (pezzo: Buffer) => (testo += pezzo.toString()));
      figlio.on('error', rifiuta);
      figlio.on('close', (codice) => risolvi({ codice, testo }));
    });
  }

  async function esiste(relazione: string): Promise<boolean> {
    const righe = await prisma.$queryRawUnsafe<{ presente: boolean }[]>(
      'SELECT to_regclass($1) IS NOT NULL AS presente',
      `public.${relazione}`,
    );
    return righe[0]!.presente;
  }

  it(
    'un errore a meta` non lascia ne` tabelle, ne` enum, ne` indici, ne` colonne',
    async () => {
      await schemaPulito();

      const guasta = await applica(await prepara(true));
      expect(guasta.codice, guasta.testo).not.toBe(0);
      expect(guasta.testo).toContain('tabella_che_non_esiste');

      // Le migration precedenti restano applicate: e' l'unica a essere caduta.
      const applicate = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      expect(Number(applicate[0]!.n)).toBeGreaterThan(100);

      const incompiuta = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL`;
      expect(incompiuta.map((riga) => riga.migration_name)).toEqual([MIGRATION]);

      // ⭐ Il punto della prova: NIENTE di cio' che la migration crea sopravvive.
      for (const tabella of TABELLE) {
        expect(await esiste(tabella), `${tabella} non deve esistere`).toBe(false);
      }
      const enumResidui = await prisma.$queryRaw<{ presente: boolean }[]>`
        SELECT to_regtype('"ShopifyLinkStatus"') IS NOT NULL AS presente`;
      expect(enumResidui[0]!.presente, 'l enum non deve esistere').toBe(false);

      const indice = await prisma.$queryRaw<{ presente: boolean }[]>`
        SELECT to_regclass('locations_id_tenant_id_key') IS NOT NULL AS presente`;
      expect(indice[0]!.presente, 'l indice ausiliario non deve esistere').toBe(false);

      const colonna = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM information_schema.columns
         WHERE table_name = 'shopify_connections' AND column_name = 'shop_id'`;
      expect(Number(colonna[0]!.n), 'la colonna non deve esistere').toBe(0);
    },
    600_000,
  );

  it(
    'la versione integra si applica, e crea tutte e quattro le tabelle protette',
    async () => {
      await schemaPulito();

      const integra = await applica(await prepara(false));
      expect(integra.codice, integra.testo).toBe(0);

      for (const tabella of TABELLE) {
        expect(await esiste(tabella), `${tabella} deve esistere`).toBe(true);
      }

      const protette = await prisma.$queryRawUnsafe<{ relname: string; rls: boolean }[]>(
        `SELECT c.relname, c.relrowsecurity AS rls FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
          ORDER BY c.relname`,
        TABELLE,
      );
      expect(protette).toHaveLength(TABELLE.length);
      for (const riga of protette) expect(riga.rls, riga.relname).toBe(true);
    },
    600_000,
  );
});
