/**
 * DIMOSTRAZIONE sul database del collaudo (5434) con il codice compilato in `dist/`:
 * il push di una variante portata da un ordine di canale aperto SENZA sede non
 * invia niente (`ordine_senza_sede`), e «Allinea» rifiuta prima di esaminare.
 *
 *   node scripts/collaudo-dimostra-quantita-ferma.mjs
 *
 * ⛔ Legge l'ambiente con la stessa composizione di `start:collaudo` (le chiavi
 *    del collaudo MESSE nell'ambiente, così `api/.env` non entra) e si rifiuta
 *    di partire se il bersaglio non è `localhost:5434/vestiflow_collaudo`.
 * ⚠️ Scrive solo ciò che il codice vero scrive quando ferma un push: il motivo
 *    sulla connessione. Verso Shopify: nessuna scrittura per costruzione — è
 *    proprio ciò che si dimostra, rileggendo la quantità remota prima e dopo.
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
const runner = join(apiRoot, 'scripts', 'collaudo-dimostra-quantita-ferma.runner.cjs');
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
