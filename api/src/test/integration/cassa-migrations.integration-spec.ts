import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama } from './app';
import { creaDatasetCassa } from './cassa.fixture';
import { ambienteIntegrazione, ambienteProcessoIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/** Comando esplicito: ricrea SOLO public nel database usa-e-getta verificato. Nessun Prisma reset/dev/db push. */
describe('Cassa — installazione pulita e aggiornamento da develop', () => {
  let prisma: PrismaClient;
  let staging: string;
  const apiRoot = resolve('.');
  const repoRoot = resolve('..');
  const logs = join(repoRoot, 'test-results');
  // Baseline storica verificata: non deve spostarsi quando develop riceve queste migration.
  const baseline = 'd0a1d95bb1b13badaa31ec140fd480111fba2a5c';

  beforeAll(async () => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    staging = await mkdtemp(join(tmpdir(), 'vestiflow-cassa-migrations-'));
    await mkdir(logs, { recursive: true });
    execFileSync('git', ['cat-file', '-e', `${baseline}^{commit}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    console.info(`Baseline locale verificata: ${baseline}`);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (staging) {
      const target = resolve(staging);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !target.startsWith(resolve(tmpdir()) + sep + 'vestiflow-cassa-migrations-')
      ) {
        throw new Error('Pulizia staging rifiutata: percorso non verificato.');
      }
      await rm(target, { recursive: true, force: true });
    }
  });

  async function cleanSchema() {
    const target = ambienteIntegrazione();
    expect(target.host).toBe('localhost:5433');
    expect(target.database).toBe('vestiflow_test');
    const db = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (db[0]?.name !== 'vestiflow_test')
      throw new Error('DROP public rifiutato: database inatteso.');
    await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO PUBLIC');
  }

  async function stage(ref: string | null, before?: string) {
    const folder = await mkdtemp(join(staging, ref ? 'baseline-' : 'current-'));
    await mkdir(join(folder, 'migrations'), { recursive: true });
    let files: string[];
    if (ref) {
      files = execFileSync(
        'git',
        [
          'ls-tree',
          '-r',
          '--name-only',
          ref,
          '--',
          'api/prisma/migrations',
          'api/prisma/schema.prisma',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      )
        .trim()
        .split(/\r?\n/);
    } else {
      const names = await readdir(join(apiRoot, 'prisma/migrations'), { withFileTypes: true });
      files = [
        'api/prisma/schema.prisma',
        'api/prisma/migrations/migration_lock.toml',
        ...names
          .filter((entry) => entry.isDirectory())
          .map((entry) => `api/prisma/migrations/${entry.name}/migration.sql`),
      ];
    }
    if (before)
      files = files.filter(
        (file) => !file.endsWith('/migration.sql') || file.split('/')[3]! < before,
      );
    for (const file of files) {
      const relative = file.replace(/^api\/prisma\//, '');
      const path = resolve(folder, relative);
      if (!path.startsWith(resolve(folder) + sep)) throw new Error('Percorso migration inatteso.');
      const content = ref
        ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: repoRoot, encoding: 'utf8' })
        : await readFile(join(repoRoot, file), 'utf8');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content.replace(/\r\n/g, '\n'));
    }
    return {
      schema: join(folder, 'schema.prisma'),
      count: files.filter((file) => file.endsWith('/migration.sql')).length,
    };
  }

  async function deploy(schema: string, label: string) {
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolveResult, reject) => {
        const child = spawn(
          process.execPath,
          [
            join(apiRoot, 'node_modules/prisma/build/index.js'),
            'migrate',
            'deploy',
            '--schema',
            schema,
          ],
          {
            cwd: apiRoot,
            windowsHide: true,
            env: ambienteProcessoIntegrazione(),
          },
        );
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolveResult({ code, output }));
      },
    );
    await writeFile(join(logs, `cassa-migrations-${label}.log`), result.output);
    expect(result.code, result.output).toBe(0);
  }

  async function assertSchema(count: number) {
    const migrations = await prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(Number(migrations[0]!.n)).toBe(count);
    const columns = await prisma.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document_lines' AND column_name = 'unit_price_minor'`;
    expect(columns).toEqual([{ numeric_precision: 16, numeric_scale: 6 }]);
    const security = await prisma.$queryRaw<
      { rls: boolean; anon: boolean; authenticated: boolean }[]
    >`
      SELECT relrowsecurity AS rls,
        has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS anon,
        has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS authenticated
      FROM pg_class WHERE oid = 'public.cash_session_device_changes'::regclass`;
    expect(security).toEqual([{ rls: true, anon: false, authenticated: false }]);
  }

  async function smokeCash() {
    const fixture = await creaDatasetCassa(prisma);
    const app = await avviaApp();
    try {
      const token = await app.token(IDS.authA1);
      const opened = await chiama(app, 'POST', '/cash-sessions/open', {
        token,
        corpo: { locationId: IDS.locA1, openingFloatMinor: 0 },
      });
      expect(opened.stato).toBe(201);
      const sessionId = (opened.corpo as { id: string }).id;
      const input = {
        locationId: IDS.locA1,
        sessionId,
        creationIntentId: crypto.randomUUID(),
        lines: [{ variantId: fixture.variantId, quantity: 3, unitPriceMinor: 1218.6667 }],
        payments: [{ paymentOptionId: fixture.cashId, amountMinor: 3656 }],
      };
      const sale = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: input });
      expect(sale.stato, JSON.stringify(sale.corpo)).toBe(201);
      const retry = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: input });
      expect(retry.corpo).toEqual(sale.corpo);
      const id = (sale.corpo as { documentId: string }).documentId;
      const line = await prisma.documentLine.findFirstOrThrow({ where: { documentId: id } });
      const payment = await prisma.storeSalePayment.findFirstOrThrow({ where: { documentId: id } });
      const returned = await chiama(app, 'POST', '/cash-sessions/returns', {
        token,
        corpo: {
          locationId: IDS.locA1,
          sessionId,
          creationIntentId: crypto.randomUUID(),
          originalDocumentId: id,
          reason: 'Collaudo migration',
          lines: [{ originalLineId: line.id, quantity: 1 }],
          refunds: [{ originalPaymentId: payment.id, amountMinor: 1219 }],
        },
      });
      expect(returned.stato, JSON.stringify(returned.corpo)).toBe(201);
      expect(await prisma.document.count({ where: { cashSessionId: sessionId } })).toBe(2);
    } finally {
      await app.chiudi();
    }
  }

  it('installazione da zero: tutte le migration, vincoli/RLS e vendita-reso HTTP', async () => {
    const current = await stage(null);
    await cleanSchema();
    await deploy(current.schema, 'fresh');
    await assertSchema(current.count);
    await smokeCash();
  }, 300_000);

  it('aggiornamento da develop: documenti e Decimal rappresentativi sopravvivono', async () => {
    const old = await stage(baseline);
    const current = await stage(null);
    await cleanSchema();
    await deploy(old.schema, 'baseline');
    await creaDataset(prisma);
    // Il baseline supportato ha le tabelle Cassa dormienti vuote, come rilevato
    // sul condiviso. Non si inventa una conversione da una vecchia Cassa in uso.
    const empty = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM cash_sessions`;
    expect(Number(empty[0]!.n)).toBe(0);
    await prisma.$executeRaw`
      INSERT INTO store_sale_payments (id, tenant_id, document_id, method, amount_minor, updated_at)
      VALUES ('9a000000-0000-4000-8000-000000000001'::uuid, ${IDS.tenantA}::uuid, ${IDS.docA1}::uuid, 'cash', 0, NOW())`;
    await prisma.$executeRaw`
      INSERT INTO document_lines (id, tenant_id, document_id, line_number, description, quantity, unit_price_minor, updated_at)
      VALUES ('9a000000-0000-4000-8000-000000000002'::uuid, ${IDS.tenantA}::uuid, ${IDS.docA1}::uuid, 1, 'Decimal storico TEST', 3, 1218.666711, NOW())`;
    const before = await prisma.$queryRaw<
      { value: string }[]
    >`SELECT row_to_json(d)::text AS value FROM documents d ORDER BY id`;
    await deploy(current.schema, 'upgrade');
    await assertSchema(current.count);
    const after = await prisma.$queryRaw<
      { value: string }[]
    >`SELECT row_to_json(d)::text AS value FROM documents d ORDER BY id`;
    expect(after).toEqual(before);
    const line = await prisma.documentLine.findUniqueOrThrow({
      where: { id: '9a000000-0000-4000-8000-000000000002' },
    });
    expect(line.unitPriceMinor.toString()).toBe('1218.666711');
    const payment = await prisma.storeSalePayment.findUniqueOrThrow({
      where: { id: '9a000000-0000-4000-8000-000000000001' },
    });
    expect(payment).toMatchObject({
      method: 'cash',
      amountMinor: 0,
      paymentOptionId: null,
      refundedFromPaymentId: null,
    });
    await smokeCash();
    await svuota(prisma);
  }, 300_000);

  it('la nuova migration RLS preserva lo storico esistente e revoca i privilegi effettivi', async () => {
    const old = await stage(null, '20260905210000_protezione_storico_dispositivi_cassa');
    const current = await stage(null);
    await cleanSchema();
    await deploy(old.schema, 'before-rls');
    await creaDatasetCassa(prisma);
    const device = await prisma.fiscalDevice.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        brand: 'other',
      },
    });
    const session = await prisma.cashSession.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        openedByName: 'Operatore storico TEST',
      },
    });
    await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        sessionId: session.id,
        newDeviceId: device.id,
        reason: 'Assegnazione storica TEST',
        changedByName: 'Operatore storico TEST',
      },
    });
    await prisma.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON cash_session_device_changes TO anon, authenticated',
    );
    const before = await prisma.cashSessionDeviceChange.findMany();
    await deploy(current.schema, 'corrective-rls');
    await assertSchema(current.count);
    expect(await prisma.cashSessionDeviceChange.findMany()).toEqual(before);
    await svuota(prisma);
  }, 300_000);
});
