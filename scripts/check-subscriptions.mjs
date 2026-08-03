#!/usr/bin/env node
/**
 * Sottoscrizioni senza via d'uscita.
 *
 * Sostituisce `rxjs/no-ignored-subscription`, che chiedeva la cosa giusta con
 * il criterio sbagliato: pretendeva che il valore di ritorno di `subscribe()`
 * fosse assegnato, e non conosce `takeUntilDestroyed()`. Su questo progetto
 * segnalava 218 casi di cui 203 erano codice corretto — un rapporto che non
 * rende il controllo severo, lo rende illeggibile, e infatti nessuno lo
 * guardava piu'.
 *
 * Qui il criterio e' quello vero: dentro un componente o una direttiva, una
 * sottoscrizione deve avere qualcosa che la chiuda quando la vista muore.
 * Vale una di queste:
 *   - `takeUntilDestroyed()` / `takeUntil(...)` nella pipe;
 *   - un operatore che completa da se' (`take(n)`, `first()`, `last()`);
 *   - il valore assegnato a qualcosa (il chiamante se ne fa carico).
 *
 * Fuori dai componenti non controlla: un service `providedIn: 'root'` vive
 * quanto l'applicazione, e li' la guardia non avrebbe niente da guardare.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = 'src/app';

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) files.push(p.split(sep).join('/'));
  }
})(ROOT);

const CLOSES = /takeUntilDestroyed|takeUntil\s*\(|\btake\s*\(|\bfirst\s*\(|\blast\s*\(/;
/** `const sub = …` o `this.sub = …`: la chiusura e' di chi tiene il riferimento. */
const ASSIGNED = /^\s*(?:const|let|var)\s+\w+[^=]*=|^\s*this\.[\w.]+\s*=|^\s*return\s/;

/**
 * Prima riga dell'istruzione che contiene la riga `i`. Una catena `.pipe(…)`
 * occupa piu' righe, e l'assegnazione sta in cima: guardare solo la riga del
 * `.subscribe(` fa scambiare per anonima una sottoscrizione che ha un nome.
 */
function statementStart(lines, i) {
  let start = i;
  while (start > 0) {
    const prev = lines[start - 1].trim();
    if (prev === '' || prev.endsWith(';') || prev.endsWith('{') || prev.endsWith('}')) break;
    if (prev.startsWith('//') || prev.startsWith('*')) break;
    start--;
  }
  return start;
}

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // Solo cio' che ha un ciclo di vita: componenti e direttive.
  if (!/@Component\s*\(|@Directive\s*\(/.test(text)) continue;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/\.subscribe\s*\(/.test(lines[i])) continue;
    if (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('*')) continue;

    const start = statementStart(lines, i);
    if (ASSIGNED.test(lines[start])) continue;
    if (CLOSES.test(lines.slice(start, i + 1).join('\n'))) continue;

    problems.push(`${file.replace('src/app/', '')}:${i + 1}`);
  }
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} sottoscrizioni senza via d'uscita in un componente:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\n  Aggiungi takeUntilDestroyed(this.destroyRef) alla pipe, oppure un\n" +
      '  operatore che completa (take/first/last) se la sorgente e\' one-shot.\n',
  );
  process.exit(1);
}

console.log("✓ sottoscrizioni: ogni subscribe in un componente ha una via d'uscita.");
