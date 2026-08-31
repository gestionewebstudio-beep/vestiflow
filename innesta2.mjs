import { readFileSync, writeFileSync } from 'node:fs';

const F = 'src/app/features/documents/models/document-table-columns.config.ts';
let t = readFileSync(F, 'utf8');
const eol = t.includes('\r\n') ? '\r\n' : '\n';
const N = (s) => s.split('\n').join(eol);

/*
  ⚠️ **Sostituzione MIRATA, non una regex sul file.** Il primo tentativo usava
  `export const (\w+_COLUMN_DEFS) = \[([\s\S]*?)\.\.\.EXTRA` e ha inglobato le
  dichiarazioni che stavano IN MEZZO fra due cataloghi — `DOCUMENT_LIST_SORTABLE_COLUMNS`
  è finita dentro un array di colonne. Qui si tocca solo la riga dello spread e
  la riga di apertura del suo catalogo, che sono le due che devono cambiare.
*/

const righe = t.split(eol);
const spread = righe
  .map((r, i) => (r.trim() === '...COLONNE_DOCUMENTALI_EXTRA,' ? i : -1))
  .filter((i) => i >= 0);

if (spread.length === 0) {
  console.error('STOP: nessuno spread trovato');
  process.exit(1);
}

/*
  Per ogni spread si risale al suo `export const X: readonly TableColumnDef[] = [`
  e si trasforma la coppia:

    export const X: … = [        →  export const X: … = conColonneCondivise([
      …voci…                            …voci…
      ...COLONNE_DOCUMENTALI_EXTRA,
    ] as const;                   →  ]);
*/
let fatti = 0;
for (const i of [...spread].reverse()) {
  // La riga di chiusura è quella dopo lo spread.
  const chiusura = i + 1;
  if (!righe[chiusura].startsWith('] as const;')) {
    console.error(`STOP: riga ${chiusura + 1} non è la chiusura attesa: ${righe[chiusura]}`);
    process.exit(1);
  }

  let apertura = -1;
  for (let k = i; k >= 0; k -= 1) {
    if (/^export const \w+_COLUMN_DEFS: readonly TableColumnDef\[\] = \[$/.test(righe[k])) {
      apertura = k;
      break;
    }
  }
  if (apertura < 0) {
    console.error(`STOP: nessuna apertura per lo spread di riga ${i + 1}`);
    process.exit(1);
  }

  righe[apertura] = righe[apertura].replace(/= \[$/, '= conColonneCondivise([');
  righe[chiusura] = ']);';
  righe.splice(i, 1);
  fatti += 1;
}

t = righe.join(eol);

// Via la costante locale, che il modulo condiviso rimpiazza.
const piatto = t.split(eol).join('\n');
const senza = piatto.replace(
  /\/\*\*[\s\S]*?\*\/\nexport const COLONNE_DOCUMENTALI_EXTRA: readonly TableColumnDef\[\] = \[[\s\S]*?\] as const;\n\n/,
  '',
);
if (senza === piatto) {
  console.error('STOP: costante locale non trovata');
  process.exit(1);
}
t = senza.split('\n').join(eol);

const imp = N(`import type { TableColumnDef } from '@shared/table-columns/table-column.model';`);
if (t.split(imp).length - 1 !== 1) {
  console.error('STOP: import di TableColumnDef non univoco');
  process.exit(1);
}
t = t.replace(
  imp,
  N(`import type { TableColumnDef } from '@shared/table-columns/table-column.model';

import { conColonneCondivise } from './document-shared-columns';`),
);

writeFileSync(F, t, 'utf8');
console.log(`  ok  ${fatti} cataloghi passano alla funzione condivisa`);
