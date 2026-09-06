#!/usr/bin/env node
/**
 * ⭐ **Il catalogo delle colonne di elenco si rispetta** (`14` §15, §0.2).
 *
 * I TIPI fermano già la divergenza scritta attraverso `colonna()`:
 * `colonna('location', { label: 'Magazzino' })` non compila. Ma il catalogo si
 * può **scavalcare** scrivendo di nuovo l'oggetto a mano —
 * `{ id: 'location', label: 'Magazzino' }` — e lì il compilatore non ha niente
 * da dire: è un `TableColumnDef` valido.
 *
 * Questa guardia chiude quella porta. Cerca nelle configurazioni di colonna
 * degli ELENCHI ogni dichiarazione grezza il cui `id` sta nel catalogo, e
 * fallisce se l'etichetta diverge da quella dichiarata.
 *
 * ⚠️ **Il vocabolario si SCOPRE dal catalogo**, non è ricopiato qui: chi
 * aggiunge una voce a `column-catalog.ts` è protetto senza toccare questo file.
 * È la stessa scelta di `check-list-actions.mjs`.
 *
 * ⚠️ **E conta anche le dichiarazioni su più righe.** Quelle con un commento in
 * mezzo occupano tre-quattro righe: una guardia che leggesse riga per riga le
 * salterebbe, ed è il caso di `documentDate` e `reference` negli elenchi
 * documenti — che sono nel catalogo.
 *
 * ⛔ Le colonne di **riga documento** non sono di questa famiglia: sono celle di
 * una maschera di inserimento, e il loro vocabolario è quello del documento.
 */
import { readFileSync, globSync } from 'node:fs';

const CATALOGO_TS = 'src/app/shared/table-columns/column-catalog.ts';

function leggiCatalogo() {
  const testo = readFileSync(CATALOGO_TS, 'utf8');
  const inizio = testo.indexOf('export const CATALOGO_COLONNE');
  const fine = testo.indexOf('} as const satisfies');
  if (inizio < 0 || fine < 0) {
    console.error(`⛔ ${CATALOGO_TS}: non trovo CATALOGO_COLONNE. La guardia è cieca.`);
    process.exit(1);
  }
  const dentro = testo.slice(inizio, fine);
  const voci = new Map();
  for (const m of dentro.matchAll(/^ {2}(\w+): \{([^}]*)\},?\s*$/gm)) {
    const label = /label: '([^']*)'/.exec(m[2])?.[1];
    if (!label) continue;
    voci.set(m[1], { label, fisso: /fisso: true/.test(m[2]) });
  }
  return voci;
}

const catalogo = leggiCatalogo();
if (catalogo.size === 0) {
  console.error('⛔ catalogo colonne vuoto: la guardia non verificherebbe niente.');
  process.exit(1);
}

const file = globSync('src/app/**/*columns*.config.ts').filter((f) =>
  /_COLUMN_DEFS/.test(readFileSync(f, 'utf8')),
);

const problemi = [];
let grezze = 0;

for (const percorso of file) {
  const testo = readFileSync(percorso, 'utf8');
  for (const m of testo.matchAll(/\{\s*id: '([\w-]+)',[\s\S]{0,400}?label: '([^']*)'/g)) {
    const voce = catalogo.get(m[1]);
    if (!voce) continue; // colonna propria dell'elenco: legittima
    grezze += 1;
    const riga = testo.slice(0, m.index).split(/\r?\n/).length;
    if (voce.fisso && m[2] !== voce.label) {
      problemi.push(
        `⛔ ${percorso}:${riga}\n   «${m[1]}» dice «${m[2]}», il catalogo dice «${voce.label}» ed è fissa.\n   Usa colonna('${m[1]}') — l'etichetta viene da lì.`,
      );
    } else {
      const conEtichetta = m[2] === voce.label ? '' : `, { label: '${m[2]}' }`;
      problemi.push(
        `⚠️  ${percorso}:${riga}\n   «${m[1]}» è nel catalogo ma è dichiarata a mano: usa colonna('${m[1]}'${conEtichetta}).`,
      );
    }
  }
}

if (problemi.length > 0) {
  for (const p of problemi) console.error(p);
  console.error(
    `\n${problemi.length} dichiarazione/i scavalcano il catalogo (${catalogo.size} voci note).`,
  );
  process.exit(1);
}

console.log(
  `check:column-catalog — ${catalogo.size} voci di catalogo, ${file.length} elenchi, nessuno la scavalca. (${grezze} grezze ammesse)`,
);
