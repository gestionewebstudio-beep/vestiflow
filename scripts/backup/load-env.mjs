import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Carica variabili da api/.env senza dipendenze extra (process.env ha priorità). */
export function loadApiEnv() {
  const merged = { ...process.env };
  const envPath = join(root, 'api/.env');
  if (!existsSync(envPath)) {
    return merged;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (merged[key] === undefined || merged[key] === '') {
      merged[key] = value;
    }
  }

  return merged;
}

export const repoRoot = root;
