/**
 * ⛔ **Un decoratore staccato dal suo campo finisce su quello DOPO.**
 *
 * Misurato il 26/08/2026, e il difetto era in produzione locale prima che
 * qualcuno se ne accorgesse. Togliendo la riga di una proprietà da un DTO —
 * `defaultUnitOfMeasure?: string;` — sono rimasti i suoi tre decoratori:
 *
 * ```ts
 *   @IsOptional()
 *   @IsString()
 *   @MaxLength(16)
 *                        ← la proprietà tolta stava qui
 *   @IsOptional()
 *   @IsUUID()
 *   defaultVatCodeId?: string;    ← e i cinque decoratori sono caduti QUI
 * ```
 *
 * `@MaxLength(16)` su un UUID di 36 caratteri: ogni salvataggio delle
 * Impostazioni rispondeva 400, per tutti i tenant, perché il pannello manda
 * un PATCH unico con dentro anche il codice IVA.
 *
 * ⚠️ **Non lo vedeva NIENTE**, ed è la ragione per cui questa guardia esiste:
 * TypeScript compila (i decoratori sono legali dove sono finiti), ESLint tace,
 * i test del service passavano 14/14, e `api/vitest.config.ts` esclude
 * `src/**\/dto/**` dalla copertura. Un difetto che rompe una schermata intera
 * e non arrossa una sola spia.
 *
 * ⭐ La firma è inequivocabile: **una riga vuota dentro una sequenza di
 * decoratori**. Nessun codice legittimo la scrive — i decoratori stanno
 * attaccati al membro che decorano.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DECORATORE = /^\s*@[A-Z][A-Za-z0-9_]*\s*(\(.*\))?\s*,?\s*$/;

const file = execSync('git ls-files "api/src/**/*.ts" "src/**/*.ts"', { encoding: 'utf8' })
  .split('\n')
  .map((r) => r.trim())
  .filter(Boolean);

const guasti = [];

for (const f of file) {
  let testo;
  try {
    testo = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const righe = testo.split(/\r?\n/);
  for (let i = 0; i < righe.length - 1; i++) {
    if (!DECORATORE.test(righe[i])) continue;
    // quante righe vuote seguono?
    let j = i + 1;
    while (j < righe.length && righe[j].trim() === '') j++;
    if (j === i + 1) continue; // nessuna riga vuota: tutto a posto
    // dopo il vuoto ricomincia un decoratore? allora il primo è ORFANO
    if (j < righe.length && DECORATORE.test(righe[j])) {
      guasti.push({ f, riga: i + 1, testo: righe[i].trim(), poi: righe[j].trim() });
    }
  }
}

if (guasti.length > 0) {
  console.error('\n⛔ check:decoratori-orfani — decoratori staccati dal loro campo\n');
  for (const g of guasti) {
    console.error(`  ${g.f}:${g.riga}`);
    console.error(`    problema  ${g.testo} è seguito da una riga vuota, poi da ${g.poi}`);
    console.error(`    → rimedio il campo che decorava è stato tolto: togli anche i suoi decoratori,`);
    console.error(`              o riattaccali. Così cadono sul campo successivo, in silenzio.\n`);
  }
  process.exit(1);
}

console.log(
  `✅ check:decoratori-orfani — ${file.length} file, nessun decoratore staccato dal proprio campo.`,
);
