import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const WINDOWS_PG_ROOT = 'C:\\Program Files\\PostgreSQL';

function listWindowsPgBinDirs() {
  if (process.platform !== 'win32' || !existsSync(WINDOWS_PG_ROOT)) {
    return [];
  }

  return readdirSync(WINDOWS_PG_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(WINDOWS_PG_ROOT, entry.name, 'bin'))
    .filter((binDir) => existsSync(join(binDir, 'pg_dump.exe')));
}

/** Risolve pg_dump/pg_restore: PATH di sistema, poi installazioni Windows standard. */
export function resolvePgTool(toolName) {
  const exe = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  const candidates = [toolName];

  for (const binDir of listWindowsPgBinDirs()) {
    candidates.push(join(binDir, exe));
  }

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
