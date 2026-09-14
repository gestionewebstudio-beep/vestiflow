/**
 * `prisma migrate deploy` sul database del COLLAUDO REALE Shopify (`docs/28`),
 * e SOLO su quello: `localhost:5434/vestiflow_collaudo`
 * (`docker-compose.collaudo.yml`).
 *
 * ⭐ Stessa forma di `prisma-deploy-test.mjs`: il bersaglio si verifica per
 *    host, porta e nome PRIMA di invocare Prisma, e le due variabili si
 *    sostituiscono nel solo processo figlio. Con una differenza voluta: le URL
 *    si leggono da `api/.env.collaudo.local`, MAI da `api/.env` — l'ambiente di
 *    sviluppo non entra nel collaudo, nemmeno per errore.
 *
 * ⛔ TEST (5433) e COLLAUDO (5434) sono due container: `db:test:reset` distrugge
 *    il primo e non tocca il secondo, `svuota()` delle suite legge
 *    `DATABASE_URL_TEST` e non conosce questo database.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';

const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

export const BERSAGLIO_COLLAUDO = Object.freeze({
  host: new Set(['localhost', '127.0.0.1']),
  porta: '5434',
  database: 'vestiflow_collaudo',
});

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE_AMBIENTE_COLLAUDO = join(apiRoot, '.env.collaudo.local');

function muori(messaggio) {
  console.error(`\n${ROSSO}${GRASSETTO}  Fermo: ${messaggio}${FINE}\n`);
  process.exit(1);
}

/** Vero solo se `valore` è una URL locale su 5434 verso `vestiflow_collaudo`. */
export function verificaBersaglioCollaudo(valore) {
  let url;
  try {
    url = new URL(valore ?? '');
  } catch {
    return { ok: false, motivo: 'non è una URL valida' };
  }
  if (!BERSAGLIO_COLLAUDO.host.has(url.hostname)) {
    return { ok: false, motivo: `punta a «${url.hostname}», che non è locale` };
  }
  if (url.port !== BERSAGLIO_COLLAUDO.porta) {
    return {
      ok: false,
      motivo: `usa la porta ${url.port || '(nessuna)'}, attesa ${BERSAGLIO_COLLAUDO.porta} (5433 è TEST, 5432 è un PostgreSQL qualunque)`,
    };
  }
  const database = url.pathname.replace(/^\//, '');
  if (database !== BERSAGLIO_COLLAUDO.database) {
    return {
      ok: false,
      motivo: `punta al database «${database}», atteso «${BERSAGLIO_COLLAUDO.database}»`,
    };
  }
  return { ok: true, url };
}

function verifica(nome, valore) {
  if (!valore || valore.trim() === '') {
    muori(
      `${nome} non è impostata in ${FILE_AMBIENTE_COLLAUDO}.\n` +
        `    Avvia il database del collaudo:  npm run db:collaudo:up\n` +
        `    e dichiara ${nome} nel file del collaudo (modello: .env.collaudo.example).`,
    );
  }
  const esito = verificaBersaglioCollaudo(valore);
  if (!esito.ok) {
    muori(`${nome} ${esito.motivo}.`);
  }
  return esito.url;
}

const invocatoDirettamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invocatoDirettamente) {
  const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
  const databaseUrl = verifica('DATABASE_URL', env['DATABASE_URL']);
  const directUrl = verifica('DIRECT_URL', env['DIRECT_URL']);

  console.log(
    `\n  Applico le migration a ${GRASSETTO}${databaseUrl.hostname}:${databaseUrl.port}` +
      `${databaseUrl.pathname}${FINE}  (COLLAUDO locale: non TEST, non DEV)\n`,
  );

  const esito = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // ⭐ Le sole due variabili sostituite, e solo qui dentro.
      DATABASE_URL: databaseUrl.toString(),
      DIRECT_URL: directUrl.toString(),
    },
  });
  process.exit(esito.status ?? 1);
}
