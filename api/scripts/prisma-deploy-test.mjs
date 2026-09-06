/**
 * `prisma migrate deploy` sull'ambiente TEST locale, e SOLO su quello.
 *
 * ⛔ **Prisma non accetta un URL da riga di comando: lo prende dall'ambiente.**
 *    Puntarlo altrove significa quindi sostituire `DATABASE_URL`/`DIRECT_URL`
 *    nel processo — ed è il momento pericoloso di tutta questa infrastruttura,
 *    perché è il comando che può riscrivere un database.
 *
 * ⭐ **La sostituzione avviene nel SOLO processo figlio.** L'ambiente di questa
 *    shell non viene modificato: un comando lanciato dopo, in un altro
 *    terminale, continua a vedere DEV come sempre.
 *
 * ⛔ **Le stesse barriere della suite, applicate PRIMA di invocare Prisma.** Se
 *    il controllo vivesse solo nei test, il comando che scrive lo schema
 *    sarebbe l'unico senza rete — cioè proprio quello che non deve esserlo.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadApiEnv } from '../../scripts/backup/load-env.mjs';

const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

/**
 * ⭐ Lo STESSO bersaglio di `api/src/test/integration/env.ts`: host, porta e
 *    nome del database insieme, non «basta che sia locale».
 *
 * ⚠️ I due elenchi sono duplicati per forza — questo è `.mjs` fuori da
 *    `api/src`, quello è TypeScript dentro — e a tenerli allineati ci pensa
 *    `check:integration-db` (regola R4), che fa fallire il lint se divergono.
 *    Senza quella guardia, una porta cambiata in un solo posto lascerebbe il
 *    comando che scrive lo schema con un controllo più debole della suite.
 */
const BERSAGLIO = {
  host: new Set(['localhost', '127.0.0.1']),
  porta: '5433',
  database: 'vestiflow_test',
};

function muori(messaggio) {
  console.error(`\n${ROSSO}${GRASSETTO}  Fermo: ${messaggio}${FINE}\n`);
  process.exit(1);
}

function verifica(nome, valore) {
  if (!valore || valore.trim() === '') {
    muori(
      `${nome} non è impostata.\n` +
        `    Avvia il database di prova:  npm run db:test:up\n` +
        `    poi dichiara ${nome} in api/.env.\n` +
        `    ⛔ Non usare DATABASE_URL: è DEV, ed è condiviso col collega.`,
    );
  }
  let url;
  try {
    url = new URL(valore);
  } catch {
    muori(`${nome} non è una URL valida.`);
  }
  if (!BERSAGLIO.host.has(url.hostname)) {
    muori(
      `${nome} punta a «${url.hostname}», che non è locale.\n` +
        `    L'ambiente TEST vive in un container su questa macchina.\n` +
        `    Un host remoto è rifiutato SEMPRE, non solo se è DEV.`,
    );
  }
  if (url.port !== BERSAGLIO.porta) {
    muori(
      `${nome} usa la porta ${url.port || '(nessuna)'}, attesa ${BERSAGLIO.porta}.\n` +
        `    ⛔ La 5432 è un PostgreSQL qualunque su questa macchina: locale\n` +
        `       non vuol dire «di prova».`,
    );
  }
  const database = url.pathname.replace(/^\//, '');
  if (database !== BERSAGLIO.database) {
    muori(
      `${nome} punta al database «${database}», atteso «${BERSAGLIO.database}».\n` +
        `    ⛔ migrate deploy scrive lo schema: un nome diverso è un altro\n` +
        `       database, e verrebbe riscritto.`,
    );
  }
  return url;
}

function assertNonCoincideConDev(url, nome, env) {
  for (const etichetta of ['DATABASE_URL', 'DIRECT_URL']) {
    const grezza = env[etichetta];
    if (!grezza) continue;
    let dev;
    try {
      dev = new URL(grezza);
    } catch {
      continue;
    }
    if (
      dev.hostname === url.hostname &&
      dev.port === url.port &&
      dev.pathname === url.pathname
    ) {
      muori(
        `${nome} punta allo stesso database di ${etichetta}.\n` +
          `    ${url.hostname}:${url.port}${url.pathname}\n` +
          `    ⛔ TEST e DEV non possono coincidere.`,
      );
    }
  }
}

const env = loadApiEnv();

const databaseUrl = verifica('DATABASE_URL_TEST', env['DATABASE_URL_TEST']);
const directUrl = verifica('DIRECT_URL_TEST', env['DIRECT_URL_TEST']);
assertNonCoincideConDev(databaseUrl, 'DATABASE_URL_TEST', env);
assertNonCoincideConDev(directUrl, 'DIRECT_URL_TEST', env);

console.log(
  `\n  Applico le migration a ${GRASSETTO}${databaseUrl.hostname}:${databaseUrl.port}` +
    `${databaseUrl.pathname}${FINE}  (TEST locale, non DEV)\n`,
);

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
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
