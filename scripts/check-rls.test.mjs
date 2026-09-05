import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function run(args, response, credentials = true) {
  const stub =
    response === null
      ? "globalThis.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')}"
      : `globalThis.fetch=async()=>({status:${response.status},json:async()=>(${JSON.stringify(response.body)})})`;
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(stub)}`,
      'scripts/check-rls.mjs',
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: credentials ? 'http://invalid.test' : '',
        SUPABASE_ANON_KEY: credentials ? 'fixture' : '',
      },
    },
  );
}

test('statico senza credenziali e senza rete', () => {
  const result = run(['--static'], null, false);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /statica/i);
  assert.doesNotMatch(result.stdout, /nessuna tabella espone/);
});
test('statico non contatta la rete neppure con credenziali presenti', () => {
  const result = run(['--static'], null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('il comando ordinario continua a richiedere la verifica live', () => {
  assert.equal(run([], null, false).status, 2);
});
for (const status of [401, 403, 404, 200]) {
  test(`sonda live HTTP ${status} senza righe`, () => {
    assert.equal(run([], { status, body: [] }).status, 0);
  });
}
for (const response of [
  { status: 500, body: [] },
  { status: 200, body: {} },
  { status: 200, body: [{ id: 'fixture' }] },
]) {
  test(`sonda live inconcludente o dati esposti: ${JSON.stringify(response)}`, () => {
    assert.equal(run([], response).status, 1);
  });
}

/*
 * ── Fase 1: la guardia deve FALLIRE su una tabella senza RLS ────────────────
 *
 * ⛔ **I test qui sopra provano solo che la guardia PASSA sullo schema vero.**
 * Una guardia che non si e' mai vista fallire non e' una guardia: se domani la
 * ricerca di `ENABLE ROW LEVEL SECURITY` smettesse di agganciare qualcosa,
 * resterebbero tutti verdi e la tabella nuova senza RLS passerebbe — che e'
 * esattamente il difetto del 04/09/2026, quando `cash_session_device_changes`
 * fu creata senza RLS e servi' una migration correttiva il giorno dopo.
 *
 * ⭐ Si esegue lo script VERO su un albero finto: `check-rls.mjs` calcola la
 * radice dalla propria posizione, quindi basta copiarlo in `<tmp>/scripts/` e
 * mettergli accanto `<tmp>/api/prisma/`. Nessun parametro nuovo da inventare
 * nello script, e nessuna copia della sua logica dentro il test.
 *
 * ⚠️ **Il controllo positivo non e' un doppione**: senza, un albero finto
 * sbagliato — percorso errato, schema illeggibile — farebbe fallire lo script
 * per la ragione sbagliata, e la falsificazione sembrerebbe riuscita.
 */
function alberoFinto({ schemaExtra = '', sqlExtra = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-rls-'));
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'api/prisma/migrations/0001_init'), { recursive: true });
    copyFileSync(join(root, 'scripts/check-rls.mjs'), join(dir, 'scripts/check-rls.mjs'));
    writeFileSync(
      join(dir, 'api/prisma/schema.prisma'),
      [
        'model Protetta {',
        '  id String @id',
        '  @@map("protetta")',
        '}',
        'model Scoperta {',
        '  id String @id',
        '  @@map("scoperta")',
        '}',
        schemaExtra,
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'api/prisma/migrations/0001_init/migration.sql'),
      ['ALTER TABLE "protetta" ENABLE ROW LEVEL SECURITY;', sqlExtra].join('\n'),
    );
    return spawnSync(process.execPath, [join(dir, 'scripts/check-rls.mjs'), '--static'], {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('FALSIFICAZIONE: una tabella senza ENABLE RLS fa fallire il controllo', () => {
  const esito = alberoFinto();
  assert.equal(esito.status, 1, esito.stdout + esito.stderr);
  assert.match(esito.stderr, /- scoperta/);
  // La tabella protetta NON deve comparire fra le mancanti: se comparisse, il
  // fallimento sarebbe di lettura dell'albero, non del controllo che si prova.
  assert.doesNotMatch(esito.stderr, /- protetta/);
});

test('CONTROLLO POSITIVO: aggiunta la riga ALTER TABLE, lo stesso albero passa', () => {
  const esito = alberoFinto({ sqlExtra: 'ALTER TABLE "scoperta" ENABLE ROW LEVEL SECURITY;' });
  assert.equal(esito.status, 0, esito.stdout + esito.stderr);
  assert.match(esito.stdout, /tutte le 2 tabelle/);
});

test('un @@map dentro un enum non viene contato come tabella', () => {
  const esito = alberoFinto({
    schemaExtra: 'enum Stato {\n  uno\n  @@map("finta_tabella")\n}',
    sqlExtra: 'ALTER TABLE "scoperta" ENABLE ROW LEVEL SECURITY;',
  });
  assert.equal(esito.status, 0, esito.stdout + esito.stderr);
  assert.doesNotMatch(esito.stderr, /finta_tabella/);
  assert.match(esito.stdout, /tutte le 2 tabelle/);
});
