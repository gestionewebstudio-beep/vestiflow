/**
 * Lancia un RUNNER del collaudo (un `.cjs` in `scripts/`) nel contesto Nest
 * compilato, con l'ambiente del collaudo composto come in `start:collaudo`:
 *
 *   node scripts/collaudo-esegui.mjs collaudo-situazione.runner.cjs
 *   node scripts/collaudo-esegui.mjs collaudo-reimporta-ordini.runner.cjs '#1010' '#1011'
 *
 * ⛔ Le chiavi del collaudo vengono MESSE nell'ambiente del figlio (così `api/.env`
 *    non entra) e si rifiuta di partire se il bersaglio non è
 *    `localhost:5434/vestiflow_collaudo`. Che cosa scriva lo dice ogni runner.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { componiAmbienteCollaudo } from './collaudo-ambiente.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const [nomeRunner, ...argomenti] = process.argv.slice(2);
if (!nomeRunner || !/^collaudo-[a-z0-9-]+\.runner\.cjs$/.test(basename(nomeRunner))) {
  console.error('Uso: node scripts/collaudo-esegui.mjs collaudo-<nome>.runner.cjs [argomenti]');
  process.exit(1);
}
const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
for (const nome of ['DATABASE_URL', 'DIRECT_URL']) {
  const esito = verificaBersaglioCollaudo(env[nome]);
  if (!esito.ok) {
    console.error(`Fermo: ${nome} ${esito.motivo}.`);
    process.exit(1);
  }
}
const runner = join(apiRoot, 'scripts', basename(nomeRunner));
if (!existsSync(runner) || !existsSync(join(apiRoot, 'dist', 'app.module.js'))) {
  console.error('Fermo: manca il runner o dist/app.module.js.');
  process.exit(1);
}
const fileSviluppo = join(apiRoot, '.env');
const chiaviSviluppo = existsSync(fileSviluppo) ? Object.keys(leggiFileAmbiente(fileSviluppo)) : [];
const figlio = spawn(process.execPath, [runner, ...argomenti], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: componiAmbienteCollaudo(process.env, env, chiaviSviluppo, '.env.collaudo.local'),
});
figlio.on('exit', (codice) => process.exit(codice ?? 1));
