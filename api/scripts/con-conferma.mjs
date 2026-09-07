#!/usr/bin/env node
/**
 * Esegue un comando dopo aver mostrato — e, se il bersaglio non e' locale, fatto
 * confermare — su quale database andra' a finire.
 *
 *   node scripts/con-conferma.mjs "prisma db seed" -- npx prisma db seed
 *
 * ⭐ **Serve ai comandi che passano dal CLIENT Prisma**, non a quelli di
 *    migration: `db seed` e `studio` usano `DATABASE_URL`, che nel `.env` resta
 *    perche' serve all'applicazione. Vedi `bersaglio.mjs` per il perche'.
 *
 * ⚠️ Gli argomenti dopo `--` vengono passati al comando cosi' come sono, tranne
 *    `--conferma`, che e' di questo wrapper e non del comando sotto.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { confermaBersaglioOEsci } from './bersaglio.mjs';
import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const separatore = argv.indexOf('--');
if (separatore < 1) {
  console.error('Uso: node scripts/con-conferma.mjs "<azione>" -- <comando> [argomenti]');
  process.exit(1);
}
const azione = argv[0];
const nostri = argv.slice(1, separatore);
const comando = argv.slice(separatore + 1).filter((a) => a !== '--conferma');
const passati = argv.slice(separatore + 1).filter((a) => a === '--conferma');

if (comando.length === 0) {
  console.error('Manca il comando da eseguire dopo «--».');
  process.exit(1);
}

/*
  ⚠️ Il bersaglio si legge come lo legge il CLIENT Prisma: `DATABASE_URL`
  dall'ambiente, e in mancanza da `api/.env` — che il client carica da se'.
  Leggerlo diversamente descriverebbe un bersaglio che non e' quello vero.
*/
const daFile = (() => {
  try {
    return leggiFileAmbiente(join(apiRoot, '.env'));
  } catch {
    return {};
  }
})();
const url = process.env['DATABASE_URL'] ?? daFile['DATABASE_URL'];

await confermaBersaglioOEsci({ azione, url, argomenti: [...nostri, ...passati] });

const esito = spawnSync(comando[0], comando.slice(1), {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(esito.status ?? 1);
