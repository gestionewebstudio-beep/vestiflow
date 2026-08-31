#!/usr/bin/env node
/**
 * **Chi usa `appRowCard` deve importarne la direttiva.**
 *
 * ⛔ **Il difetto è muto.** Un `<ng-template appRowCard>` in un componente che non
 * importa `DataTableRowCardDirective` non è un errore per Angular: l'attributo è
 * sconosciuto e viene **ignorato**. Il template compila, i test passano, e sotto
 * `lg` la card progettata semplicemente non c'è — si torna al ripiego a
 * etichetta:valore senza che niente lo dica.
 *
 * Misurato il 30/08/2026 sull'elenco documenti: card scritta, direttiva non
 * importata, build verde.
 *
 * ⚠️ **Vale per tutte e tre le direttive del motore**, per la stessa ragione:
 * `appCell` e `appRowActions` si comportano allo stesso modo — un template che
 * nessuno raccoglie.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** attributo del template → classe da importare. */
const DIRETTIVE = {
  appRowCard: 'DataTableRowCardDirective',
  appRowActions: 'DataTableRowActionsDirective',
  appCell: 'DataTableCellDirective',
};

function file(dir, est, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) file(p, est, acc);
    else if (voce.endsWith(est)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

let difetti = 0;
let controllati = 0;

for (const html of file('src', '.html')) {
  const markup = readFileSync(html, 'utf8');
  const usate = Object.keys(DIRETTIVE).filter((attr) =>
    new RegExp(`<ng-template[^>]*\\b${attr}\\b`).test(markup),
  );
  if (usate.length === 0) {
    continue;
  }

  const ts = html.replace(/\.html$/, '.ts');
  let sorgente;
  try {
    sorgente = readFileSync(ts, 'utf8');
  } catch {
    console.error(`⛔ ${html} usa ${usate.join(', ')} ma non ha un .ts accanto.`);
    difetti += 1;
    continue;
  }

  controllati += 1;
  for (const attr of usate) {
    const classe = DIRETTIVE[attr];
    /*
      ⚠️ Si cerca dentro `imports: [...]`, non nel file intero: un `import`
      in cima senza la voce nell'array è esattamente il caso che sbaglia.
    */
    const blocco = sorgente.match(/imports:\s*\[([\s\S]*?)\]/);
    if (!blocco || !new RegExp(`\\b${classe}\\b`).test(blocco[1])) {
      console.error(
        `⛔ ${html}\n   usa «${attr}» ma ${classe} non è in \`imports\`: il template viene IGNORATO, in silenzio.`,
      );
      difetti += 1;
    }
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} template del motore tabella che nessuno raccoglie.`);
  process.exit(1);
}

console.log(
  `check:row-card — ${controllati} componenti usano i template del motore, tutti con la loro direttiva.`,
);
