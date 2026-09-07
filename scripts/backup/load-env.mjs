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

/**
 * Legge un file di ambiente INDICATO dall’operatore (`--env-file`).
 *
 * ⭐ **Non è `loadApiEnv` con un percorso diverso**, e la differenza è tutta
 *    qui: quello mescola `api/.env` con l’ambiente del processo ed è pensato
 *    per «prendi la configurazione di sviluppo». Questo restituisce SOLO ciò
 *    che sta nel file che qualcuno ha nominato, e serve a rispondere alla
 *    domanda opposta: «usa esattamente questo, e niente altro».
 *
 * ⛔ Se il file non esiste, LANCIA: un ripiego silenzioso su un’altra fonte è
 *    il difetto che questi strumenti hanno appena smesso di avere.
 */
export function leggiFileAmbiente(percorso) {
  if (!existsSync(percorso)) {
    throw new Error(`File di ambiente non trovato: ${percorso}`);
  }
  const valori = {};
  for (const rigaGrezza of readFileSync(percorso, 'utf8').split(/\r?\n/)) {
    const riga = rigaGrezza.trim();
    if (!riga || riga.startsWith('#')) {
      continue;
    }
    const eq = riga.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const chiave = riga.slice(0, eq).trim();
    let valore = riga.slice(eq + 1).trim();
    if (
      (valore.startsWith('"') && valore.endsWith('"')) ||
      (valore.startsWith("'") && valore.endsWith("'"))
    ) {
      valore = valore.slice(1, -1);
    }
    valori[chiave] = valore;
  }
  return valori;
}
