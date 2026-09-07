/**
 * Prove della guardia `check:bersaglio-condiviso`.
 *
 * ⭐ **Ogni caso costruisce un albero finto in una cartella temporanea** e ci
 *    esegue la guardia dentro: nessuna prova tocca `api/.env` vero né alcun
 *    database.
 *
 * ⚠️ **Le prove che devono passare contano quanto quelle che devono fallire.**
 *    Una guardia che dice sempre «rosso» ferma il lavoro e viene aggirata: i
 *    casi `DIRECT_URL_TEST` e la riga commentata esistono perché sono i due
 *    modi in cui una regex frettolosa la renderebbe inutilizzabile.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const QUI = dirname(fileURLToPath(import.meta.url));
const GUARDIA = join(QUI, 'check-bersaglio-condiviso.mjs');

/** Valore finto e riconoscibile: se comparisse nell'output, la guardia perde. */
const VALORE_FINTO = 'postgresql://utente:segretissimo@finto.example:5432/db';

const SCHEMA_CON_DIRECT_URL = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
`;
const SCHEMA_SENZA_DIRECT_URL = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

function esegui({ env, schema }) {
  const radice = mkdtempSync(join(tmpdir(), 'bersaglio-'));
  try {
    mkdirSync(join(radice, 'api', 'prisma'), { recursive: true });
    mkdirSync(join(radice, 'scripts'), { recursive: true });
    copyFileSync(GUARDIA, join(radice, 'scripts', 'check-bersaglio-condiviso.mjs'));
    if (env !== null) writeFileSync(join(radice, 'api', '.env'), env);
    writeFileSync(join(radice, 'api', 'prisma', 'schema.prisma'), schema);
    const esito = spawnSync(process.execPath, ['scripts/check-bersaglio-condiviso.mjs'], {
      cwd: radice,
      encoding: 'utf8',
    });
    return { codice: esito.status, uscita: `${esito.stdout}${esito.stderr}` };
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
}

test('verde: api/.env assente (CI o worktree pulito)', () => {
  const r = esegui({ env: null, schema: SCHEMA_CON_DIRECT_URL });
  assert.equal(r.codice, 0, r.uscita);
});

test('verde: api/.env senza DIRECT_URL', () => {
  const r = esegui({ env: `DATABASE_URL=${VALORE_FINTO}\n`, schema: SCHEMA_CON_DIRECT_URL });
  assert.equal(r.codice, 0, r.uscita);
});

test('verde: DIRECT_URL_TEST non è DIRECT_URL', () => {
  const r = esegui({
    env: `DATABASE_URL_TEST=${VALORE_FINTO}\nDIRECT_URL_TEST=${VALORE_FINTO}\n`,
    schema: SCHEMA_CON_DIRECT_URL,
  });
  assert.equal(r.codice, 0, r.uscita);
});

test('verde: una riga DIRECT_URL commentata non è una dichiarazione', () => {
  const r = esegui({
    env: `# DIRECT_URL=${VALORE_FINTO}\nDATABASE_URL=${VALORE_FINTO}\n`,
    schema: SCHEMA_CON_DIRECT_URL,
  });
  assert.equal(r.codice, 0, r.uscita);
});

test('ROSSO: DIRECT_URL dichiarata in api/.env', () => {
  const r = esegui({
    env: `DATABASE_URL=${VALORE_FINTO}\nDIRECT_URL=${VALORE_FINTO}\n`,
    schema: SCHEMA_CON_DIRECT_URL,
  });
  assert.equal(r.codice, 1, r.uscita);
  assert.match(r.uscita, /riga 2/);
});

test('ROSSO: directUrl tolta dallo schema', () => {
  const r = esegui({ env: `DATABASE_URL=${VALORE_FINTO}\n`, schema: SCHEMA_SENZA_DIRECT_URL });
  assert.equal(r.codice, 1, r.uscita);
  assert.match(r.uscita, /directUrl/);
});

test('ROSSO: entrambe le regole violate insieme', () => {
  const r = esegui({
    env: `DIRECT_URL=${VALORE_FINTO}\n`,
    schema: SCHEMA_SENZA_DIRECT_URL,
  });
  assert.equal(r.codice, 1, r.uscita);
});

test('l\u2019output non contiene MAI il valore della variabile', () => {
  for (const caso of [
    { env: `DIRECT_URL=${VALORE_FINTO}\n`, schema: SCHEMA_CON_DIRECT_URL },
    { env: `DIRECT_URL=${VALORE_FINTO}\n`, schema: SCHEMA_SENZA_DIRECT_URL },
  ]) {
    const r = esegui(caso);
    assert.doesNotMatch(r.uscita, /segretissimo/, 'la password è finita nell\u2019output');
    assert.doesNotMatch(r.uscita, /finto\.example/, 'l\u2019host è finito nell\u2019output');
    assert.doesNotMatch(r.uscita, /postgresql:\/\//, 'una URL è finita nell\u2019output');
  }
});
