/**
 * La SITUAZIONE ATTUALE sul database del collaudo (5434), col codice compilato in
 * `dist/`: i problemi aperti come li calcola l'API (`ShopifySetupService.stato`),
 * per causa, con azione e data di rilevazione. È la stessa lettura della pagina,
 * senza la pagina: serve a verificare i numeri prima di guardarli a schermo.
 *
 *   node scripts/collaudo-situazione.mjs
 *
 * ⛔ Legge l'ambiente con la stessa composizione di `start:collaudo` (le chiavi
 *    del collaudo MESSE nell'ambiente, così `api/.env` non entra) e si rifiuta
 *    di partire se il bersaglio non è `localhost:5434/vestiflow_collaudo`.
 * ⚠️ Sola lettura: `stato()` non scrive niente, né sul database né su Shopify.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { componiAmbienteCollaudo } from './collaudo-ambiente.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
for (const nome of ['DATABASE_URL', 'DIRECT_URL']) {
  const esito = verificaBersaglioCollaudo(env[nome]);
  if (!esito.ok) {
    console.error(`Fermo: ${nome} ${esito.motivo}.`);
    process.exit(1);
  }
}
const runner = join(apiRoot, 'scripts', 'collaudo-situazione.runner.cjs');
if (!existsSync(runner) || !existsSync(join(apiRoot, 'dist', 'app.module.js'))) {
  console.error('Fermo: manca il runner o dist/app.module.js.');
  process.exit(1);
}
const fileSviluppo = join(apiRoot, '.env');
const chiaviSviluppo = existsSync(fileSviluppo) ? Object.keys(leggiFileAmbiente(fileSviluppo)) : [];
const figlio = spawn(process.execPath, [runner], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: componiAmbienteCollaudo(process.env, env, chiaviSviluppo, '.env.collaudo.local'),
});
figlio.on('exit', (codice) => process.exit(codice ?? 1));
