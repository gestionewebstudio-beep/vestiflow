/**
 * ⭐ **OGNI PAGINA ELENCO DEVE PASSARE L'ALTEZZA AL TELAIO.**
 *
 * ⛔ **Segnalato dal proprietario il 02/09/2026** guardando l'Inventario: «ha il
 * contenitore delle righe che si visualizza in modo diverso dagli altri e
 * dovrebbe essere unito se puo».
 *
 * `lp.list-page()` emette `:host { display: block }`. Su un host non flessibile
 * la catena si ferma: `app-list-page` non ha da chi ricevere l'altezza, la zona
 * dati resta alta quanto le righe e la riga totali si posa sotto l'ultima invece
 * di stare in fondo al contenitore. Misurato in Chromium sulla stessa catena:
 *
 * ```text
 * :host display: block    zona dati   92px
 * :host display: flex     zona dati  360px
 * ```
 *
 * ⚠️ **Non fallisce e non arrossa nessun test.** La pagina si rende, le righe si
 * leggono, i test passano: si vede solo aprendo il browser e guardando dove
 * finisce il contenitore. È il difetto muto che questo progetto combatte, e
 * l'ha trovato una persona, non una macchina — undici pagine su dodici avevano
 * l'anello e nessuno sapeva che la dodicesima no.
 *
 * ⭐ **Due forme sono ammesse**, e sono quelle già in uso:
 *
 * | forma | quando |
 * | --- | --- |
 * | `@include lp.list-page-fills-viewport(...)` | otto pagine, storica |
 * | `:host { display: flex; … flex: 1 }` scritto a mano | la forma preferita col telaio (vedi `supplier-list`) |
 *
 * ⛔ **Non basta un `:host` qualsiasi**: deve portare `flex: 1`, o l'host non
 * cresce nella colonna che lo contiene. `stock-lookup` ha un `:host` con
 * `display: block` e non è un elenco a piena altezza — per questo la guardia
 * guarda solo le pagine che montano `<app-list-page>`.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const TEMPLATE = 'src/app/**/*.component.html';

/** `:host { … }` che dichiara sia una colonna flessibile sia la crescita. */
const HOST_ELASTICO = /:host\s*\{[^}]*\bflex:\s*1\b[^}]*\}/;
const HOST_FLEX = /:host\s*\{[^}]*\bdisplay:\s*flex\b[^}]*\}/;
const MIXIN = /^\s*@include\s+[\w.]*list-page-fills-viewport\s*\(/m;

/**
 * ⭐ **L'eccezione si DICHIARA nel foglio**, con la ragione accanto:
 *
 * ```scss
 * // catena-altezze: non applicabile — questa non è un elenco, …
 * ```
 *
 * ⛔ Non esiste una lista di esclusioni dentro questo script. Un elenco di nomi
 * qui dentro invecchia da solo — una pagina rinominata esce dal controllo senza
 * che nessuno se ne accorga, ed è il difetto muto che la guardia esiste per
 * togliere. Scritta nel foglio, l'eccezione la legge chi apre quel foglio.
 */
const ESENTE = /catena-altezze:\s*non applicabile\s*—\s*\S/;

const mancanti = [];
let esaminate = 0;
let esenti = 0;

for (const html of globSync(TEMPLATE)) {
  let markup = '';
  try {
    markup = readFileSync(html, 'utf8');
  } catch {
    continue;
  }
  if (!markup.includes('<app-list-page')) {
    continue;
  }

  const scss = html.replace(/\.html$/, '.scss');
  let foglio = '';
  try {
    foglio = readFileSync(scss, 'utf8');
  } catch {
    mancanti.push(`${html}\n   monta <app-list-page> ma non ha un foglio di stile: la catena di altezze non parte.`);
    continue;
  }

  esaminate += 1;
  if (ESENTE.test(foglio)) {
    esenti += 1;
    continue;
  }
  const conMixin = MIXIN.test(foglio);
  const conHost = HOST_ELASTICO.test(foglio) && HOST_FLEX.test(foglio);
  if (!conMixin && !conHost) {
    mancanti.push(
      `${scss}\n   la pagina monta <app-list-page> ma il suo :host non passa l'altezza.\n` +
        `   Il contenitore delle righe resterà alto quanto le righe e la riga totali\n` +
        `   non si ancorerà in fondo. Aggiungi:\n` +
        `     :host { display: flex; flex-direction: column; flex: 1; min-block-size: 0; min-inline-size: 0 }`,
    );
  }
}

if (mancanti.length > 0) {
  console.error('\n⛔ pagine elenco senza catena di altezze:\n');
  for (const m of mancanti) {
    console.error(`  ${m}\n`);
  }
  console.error(`${mancanti.length} pagine con il contenitore righe che non si stira.\n`);
  process.exit(1);
}

const coda = esenti > 0 ? ` (${esenti} con esenzione dichiarata)` : '';
console.log(
  `check:catena-altezze — ${esaminate} pagine elenco, tutte passano l'altezza al telaio${coda}.`,
);
