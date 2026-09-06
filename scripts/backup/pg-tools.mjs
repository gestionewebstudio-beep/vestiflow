import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const WINDOWS_PG_ROOT = 'C:\\Program Files\\PostgreSQL';
const LINUX_PG_ROOT = '/usr/lib/postgresql';

function parsePostgresMajorVersion(dirName) {
  const parsed = Number.parseInt(dirName, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listVersionedPgBinDirs(rootDir, dumpFileName) {
  if (!existsSync(rootDir)) {
    return [];
  }

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => parsePostgresMajorVersion(right.name) - parsePostgresMajorVersion(left.name))
    .map((entry) => join(rootDir, entry.name, 'bin'))
    .filter((binDir) => existsSync(join(binDir, dumpFileName)));
}

function listWindowsPgBinDirs() {
  if (process.platform !== 'win32') {
    return [];
  }

  return listVersionedPgBinDirs(WINDOWS_PG_ROOT, 'pg_dump.exe');
}

function listLinuxPgBinDirs() {
  if (process.platform === 'win32') {
    return [];
  }

  return listVersionedPgBinDirs(LINUX_PG_ROOT, 'pg_dump');
}

/** Risolve pg_dump/pg_restore: installazioni versionate, poi PATH di sistema. */
export function resolvePgTool(toolName) {
  const exe = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  const candidates = [];

  for (const binDir of listLinuxPgBinDirs()) {
    candidates.push(join(binDir, exe));
  }
  for (const binDir of listWindowsPgBinDirs()) {
    candidates.push(join(binDir, exe));
  }

  candidates.push(toolName);

  return candidates;
}

/**
 * ⭐ **IMMAGINE FISSATA ALLA MAJOR DI DEV**, non `latest`.
 *
 * `docker-compose.test.yml` usa `postgres:17` per la stessa ragione, e la major
 * di DEV e' stata MISURATA (`server_version` → 17.6): un `pg_dump` piu' vecchio
 * del server rifiuta il dump, e uno piu' nuovo puo' produrre un archivio che il
 * `pg_restore` locale non legge.
 */
const IMMAGINE_PG = 'postgres:17';

/**
 * Da dove viene lo strumento: dal sistema, o da un container usa-e-getta.
 *
 * @typedef {{ comando: string, prefisso: string[], viaDocker: boolean }} StrumentoPg
 */

/**
 * ⭐ **Il ripiego DOCKER**, aggiunto il 06/09/2026.
 *
 * ⛔ Su questa macchina `pg_dump` non esiste — ne' nel PATH ne' in
 *    `C:\Program Files\PostgreSQL` — e il backup non partiva affatto. La causa
 *    radice non e' il PATH: e' che il progetto pretende un'installazione di
 *    PostgreSQL su una macchina che non ne ha bisogno per nient'altro.
 *
 * ⭐ Docker c'e' gia', e ci gira gia' `postgres:17` per il database di prova:
 *    lo strumento si prende da li' invece di chiedere un'installazione.
 *
 * ⚠️ `--add-host=host.docker.internal:host-gateway` serve al RIPRISTINO, non al
 *    backup: il bersaglio usa-e-getta sta su `localhost` dell'HOST, che dentro
 *    un container e' il container stesso. Chi chiama deve riscrivere l'host con
 *    `perDocker()`.
 */
function strumentoDocker(toolName) {
  return {
    comando: 'docker',
    prefisso: [
      'run',
      '--rm',
      '-i',
      '--add-host=host.docker.internal:host-gateway',
      IMMAGINE_PG,
      toolName,
    ],
    viaDocker: true,
  };
}

/**
 * Riscrive un URL che punta all'host locale perche' sia raggiungibile da dentro
 * un container. Senza, `localhost` dentro il container e' il container.
 */
export function perDocker(url) {
  return String(url).replace(
    /@(localhost|127\.0\.0\.1)(?=[:/])/,
    '@host.docker.internal',
  );
}

/**
 * Risolve lo strumento: prima le installazioni native, poi Docker.
 *
 * ⚠️ Ritorna un DESCRITTORE e non piu' una stringa: con Docker il comando e'
 *    `docker` e il vero strumento e' un argomento. Chi lo usa deve anteporre
 *    `prefisso` ai propri argomenti.
 */
export function probePgTool(toolName) {
  const candidates = resolvePgTool(toolName).map((comando) => ({
    comando,
    prefisso: [],
    viaDocker: false,
  }));
  candidates.push(strumentoDocker(toolName));

  return new Promise((resolve, reject) => {
    const tryNext = (index) => {
      if (index >= candidates.length) {
        reject(
          new Error(
            `${toolName} non trovato: ne' nel PATH, ne' fra le installazioni ` +
              'PostgreSQL versionate, ne\' via Docker. Installa i client tools ' +
              '(https://www.postgresql.org/download/) oppure avvia Docker: ' +
              `l'immagine ${IMMAGINE_PG} basta e non richiede installazioni.`,
          ),
        );
        return;
      }

      const strumento = candidates[index];
      const probe = spawn(strumento.comando, [...strumento.prefisso, '--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';

      probe.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      probe.on('error', () => tryNext(index + 1));
      probe.on('close', (code) => {
        if (code === 0) {
          resolve(strumento);
          return;
        }
        tryNext(index + 1);
      });
    };

    tryNext(0);
  });
}
