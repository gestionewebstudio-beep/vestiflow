#!/usr/bin/env node
/**
 * **Ogni maniglia di ridimensionamento deve inoltrare ANCHE il rilascio.**
 *
 * ⛔ Difetto misurato il 24/08/2026: l'intestazione comune delle righe
 * documento montava 28 maniglie e inoltrava `(resized)` su **14**. Le altre
 * quattordici — tutte quelle aggiunte migrando l'Arrivo merce e l'Ordine
 * fornitore — emettevano il solo `(resizing)`.
 *
 * La conseguenza non somigliava a un difetto: la colonna **si muoveva dal
 * vivo** e sembrava sistemarsi, ma al rilascio non si salvava niente. Peggio,
 * la bozza del trascinamento restava incastrata: da lì in poi «Ripristina
 * colonne» non toccava più le larghezze, e una colonna riaccesa dal selettore
 * rendeva in una scala diversa da tutte le altre.
 *
 * ⚠️ **Nessun test lo vedeva**, ed è la ragione per cui questo controllo
 * esiste: il ponte fra il template e il punto delle larghezze non è esercitato
 * da nessuna prova di componente, e il difetto è **additivo** — si presenta
 * aggiungendo una colonna, che è la cosa che si fa più spesso.
 */
import { readFileSync } from 'node:fs';

const TEMPLATE =
  'src/app/domain/documents/components/document-line-head/document-line-head.component.html';

const testo = readFileSync(TEMPLATE, 'utf8');

const ingresso = [...testo.matchAll(/columnResizing\.emit\(\{ column: '([a-zA-Z]+)'/g)].map(
  (m) => m[1],
);
const rilascio = new Set(
  [...testo.matchAll(/columnResized\.emit\(\{ column: '([a-zA-Z]+)'/g)].map((m) => m[1]),
);
const maniglie = (testo.match(/appTableColumnResize/g) ?? []).length;

const orfane = ingresso.filter((colonna) => !rilascio.has(colonna));
const senzaIngresso = [...rilascio].filter((colonna) => !ingresso.includes(colonna));

if (orfane.length > 0 || senzaIngresso.length > 0 || maniglie !== ingresso.length) {
  console.error('\n⛔ maniglie di colonna: ingresso e rilascio non combaciano.\n');
  if (orfane.length > 0) {
    console.error(
      `  ${orfane.length} colonne muovono senza salvare (manca \`(resized)\`):\n    ${orfane.join(', ')}\n`,
    );
    console.error(
      '  Si trascina, la tabella si ridistribuisce, e al rilascio non si salva niente.\n' +
        '  La bozza resta incastrata: «Ripristina colonne» smette di toccare le larghezze.\n',
    );
  }
  if (senzaIngresso.length > 0) {
    console.error(
      `  ${senzaIngresso.length} colonne salvano senza muovere (manca \`(resizing)\`):\n    ${senzaIngresso.join(', ')}\n`,
    );
  }
  if (maniglie !== ingresso.length) {
    console.error(`  ${maniglie} maniglie montate ma ${ingresso.length} inoltrano il movimento.\n`);
  }
  console.error(`  File: ${TEMPLATE}\n`);
  process.exit(1);
}

console.log(`✓ maniglie di colonna: ${maniglie} montate, tutte inoltrano movimento e rilascio.`);
