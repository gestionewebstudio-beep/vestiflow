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

export function probePgTool(toolName) {
  const candidates = resolvePgTool(toolName);

  return new Promise((resolve, reject) => {
    const tryNext = (index) => {
      if (index >= candidates.length) {
        reject(
          new Error(
            `${toolName} non trovato nel PATH. Installa PostgreSQL client tools ` +
              '(https://www.postgresql.org/download/) oppure aggiungi ' +
              '"C:\\Program Files\\PostgreSQL\\18\\bin" al PATH di Windows.',
          ),
        );
        return;
      }

      const command = candidates[index];
      const probe = spawn(command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      probe.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      probe.on('error', () => tryNext(index + 1));
      probe.on('close', (code) => {
        if (code === 0) {
          resolve(command);
          return;
        }
        tryNext(index + 1);
      });
    };

    tryNext(0);
  });
}
