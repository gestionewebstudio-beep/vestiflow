/**
 * La barra azioni di un documento è **UNA dichiarazione**.
 *
 * ⛔ **Misurato il 25/08/2026, prima dell'estrazione:** ogni maschera la
 * dichiarava DUE volte — `doc-form__actions` per la scrivania e
 * `doc-form__mobile-actions` per il telefono, che commutavano alla soglia `lg`.
 * Quattordici dichiarazioni per sette barre.
 *
 * ⚠️ **E il costo si vedeva.** Nel Trasferimento la copia mobile aveva un
 * `@if (isConfirmedEdit())` con **rami byte-identici**: era stata copiata da
 * quella di scrivania — dove i rami differivano davvero — e la differenza si era
 * persa in una copia sola. Nessun test è diventato rosso, perché il risultato a
 * schermo era giusto per caso.
 *
 * ## Che cosa controlla
 *
 * Per ogni maschera documentale:
 *
 * 1. `<app-document-actions>` compare **al massimo una volta**;
 * 2. il markup vecchio — `class="doc-form__actions"` e `doc-form__mobile-actions`
 *    — non c'è più.
 *
 * ⭐ **Non pretende che la barra CI SIA.** Una maschera nuova può non averla
 * ancora, e non è un difetto: il controllo impedisce di dichiararla due volte o
 * di rifarla a mano, non di ometterla.
 *
 * ## ⛔ Che cosa NON controlla, e perché
 *
 * - **L'ordine dei pulsanti**: lo impone il template del componente, e nessuna
 *   maschera può cambiarlo. Verificarlo qui sarebbe verificare il componente.
 * - **Le azioni specifiche proiettate**: sono contenuto del documento. La barra
 *   le ospita senza sapere che cosa siano, ed è il criterio di accettazione
 *   dell'estrazione — `check-document-grammar` verifica l'altro lato, cioè che
 *   il componente non nomini nessun tipo documento.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Il markup che l'estrazione ha sostituito. */
const RESIDUI = [
  { ago: 'class="doc-form__actions"', dice: 'la barra di scrivania scritta a mano' },
  { ago: 'doc-form__mobile-actions', dice: 'la seconda dichiarazione, per la veste compatta' },
];

const RADICI = [
  'src/app/features/documents',
  'src/app/features/orders',
  'src/app/features/sales-orders',
  'src/app/features/store-sales',
  'src/app/features/inventory',
];

function templateDiMaschera(cartella, trovati = []) {
  let voci;
  try {
    voci = readdirSync(cartella);
  } catch {
    return trovati;
  }
  for (const voce of voci) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      templateDiMaschera(percorso, trovati);
      continue;
    }
    if (/form\.component\.html$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

const rigaDi = (testo, indice) => testo.slice(0, indice).split(/\r?\n/).length;

const violazioni = [];
let conBarra = 0;

for (const radice of RADICI) {
  for (const percorso of templateDiMaschera(radice)) {
    const testo = readFileSync(percorso, 'utf8');
    const rel = relative(process.cwd(), percorso);

    const dichiarazioni = testo.split('<app-document-actions').length - 1;
    if (dichiarazioni > 0) conBarra++;
    if (dichiarazioni > 1) {
      violazioni.push({
        file: rel,
        riga: rigaDi(testo, testo.indexOf('<app-document-actions')),
        problema: `dichiarata ${dichiarazioni} volte: la barra è UNA, e la veste la sceglie il componente`,
      });
    }

    for (const { ago, dice } of RESIDUI) {
      // ⚠️ Solo il markup vero: i commenti che NOMINANO il vecchio blocco per
      // dire che non c'è più sono documentazione, non residuo.
      const indice = testo.indexOf(ago);
      if (indice < 0) continue;
      const riga = testo.split(/\r?\n/)[rigaDi(testo, indice) - 1] ?? '';
      if (riga.trimStart().startsWith('//') || riga.includes('`')) continue;
      if (!/<\w/.test(riga)) continue;
      violazioni.push({ file: rel, riga: rigaDi(testo, indice), problema: `${dice} — va sostituita` });
    }
  }
}

if (violazioni.length === 0) {
  console.log(
    `✅ check:document-actions — la barra azioni è una dichiarazione sola ` +
      `(${conBarra} maschere la montano, nessun residuo del markup vecchio).`,
  );
  process.exit(0);
}

console.error('\n⛔ La barra azioni non è una dichiarazione sola.\n');
console.error('   Prima dell\'estrazione ogni maschera la dichiarava DUE volte, e nel');
console.error('   Trasferimento la copia mobile aveva un `@if` con rami byte-identici:');
console.error('   la differenza si era persa in una copia, e nessun test era diventato');
console.error('   rosso perché a schermo il risultato era giusto per caso.\n');
for (const v of violazioni) {
  console.error(`   ${v.file}:${v.riga}  ${v.problema}`);
}
console.error('');
process.exit(1);
