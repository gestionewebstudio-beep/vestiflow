#!/usr/bin/env node
/**
 * **Gli strati della tabella stanno nell'ordine giusto.**
 *
 * ⛔ **Il difetto, misurato il 31/08/2026 sui Prodotti**: la colonna Nome
 * finiva **sopra** la riga dei totali. L'ultima riga si leggeva attraverso il
 * piede — ma solo nella prima colonna.
 *
 * ⚠️ **Solo lì perché solo quella è FISSATA**: una cella `pinned` è
 * `position: sticky` con `z-index: --z-raised + 1`, e la riga totali stava a
 * `--z-raised`. Uno sotto: la cella le scorreva sopra, e il suo fondo bianco
 * copriva il piede.
 *
 * ⛔ **Il commento nel foglio diceva il contrario di ciò che il codice faceva**:
 * «sopra le righe, ma sotto l'intestazione appiccicata». Aveva contato
 * l'intestazione e dimenticato che il `+1` è anche di **ogni cella fissata di
 * ogni riga** — che scorre, e quindi passa di lì.
 *
 * ## ⚠️ Perché serve una guardia e non un test
 *
 * **jsdom non calcola gli strati.** Un test di componente monta la tabella,
 * legge il DOM e non sa dire chi copre chi: si vede solo a schermo, scorrendo un
 * elenco con una colonna fissata fino in fondo. Questa guardia legge i numeri
 * dichiarati e verifica l'ordine.
 */
import { readFileSync } from 'node:fs';

const FOGLIO = 'src/app/shared/components/data-table/data-table.component.scss';

/**
 * Gli strati, dal più basso al più alto.
 *
 * ⭐ **L'ordine è la specifica**: chi scorre sotto sta prima, chi copre sta dopo.
 * Una riga fissata passa sotto il piede; il piede passa sotto l'intestazione.
 */
const SCALA = [
  { classe: 'data-table__cell--pinned', ruolo: 'cella fissata di riga' },
  { classe: 'data-table__totals', ruolo: 'riga totali' },
  { classe: 'data-table__head th', ruolo: 'intestazione' },
  { classe: 'data-table__head .data-table__cell--pinned', ruolo: 'intestazione fissata' },
];

const foglio = readFileSync(FOGLIO, 'utf8');

/**
 * Lo `z-index` dichiarato per un selettore, come scostamento da `--z-raised`.
 *
 * ⚠️ Si accetta sia `var(--z-raised)` sia `calc(var(--z-raised) + N)`: sono la
 * stessa scala, e un valore nudo (`z-index: 5`) è un difetto a sé — lo dice il
 * ritorno `null`.
 */
function stratoDi(selettore) {
  const re = new RegExp(
    `\\.${selettore.replace(/[.\s]/g, (c) => (c === ' ' ? '\\s+' : '\\.'))}\\s*\\{([^}]*)\\}`,
  );
  const corpo = re.exec(foglio)?.[1];
  if (corpo === undefined) {
    return { errore: 'selettore non trovato' };
  }
  const riga = /z-index:\s*([^;]+);/.exec(corpo)?.[1]?.trim();
  if (riga === undefined) {
    return { errore: 'nessuno z-index dichiarato' };
  }
  if (riga === 'var(--z-raised)') {
    return { valore: 0 };
  }
  const scostamento = /calc\(\s*var\(--z-raised\)\s*\+\s*(\d+)\s*\)/.exec(riga)?.[1];
  if (scostamento === undefined) {
    return { errore: `z-index fuori dalla scala: «${riga}»` };
  }
  return { valore: Number(scostamento) };
}

let difetti = 0;
const letti = [];

for (const { classe, ruolo } of SCALA) {
  const esito = stratoDi(classe);
  if (esito.errore) {
    console.error(`⛔ .${classe} (${ruolo}): ${esito.errore}`);
    difetti += 1;
    continue;
  }
  letti.push({ classe, ruolo, valore: esito.valore });
}

for (let i = 1; i < letti.length; i += 1) {
  const sotto = letti[i - 1];
  const sopra = letti[i];
  if (sopra.valore > sotto.valore) {
    continue;
  }
  difetti += 1;
  console.error(
    `⛔ ${sopra.ruolo} (+${sopra.valore}) non sta sopra ${sotto.ruolo} (+${sotto.valore}) — ` +
      `scorrendo, ${sotto.ruolo} lo COPRE.`,
  );
}

if (difetti > 0) {
  console.error(
    `\n${difetti} problemi nella scala degli strati.\n` +
      `L'ordine giusto, dal basso: ${SCALA.map((s) => s.ruolo).join(' → ')}.\n` +
      `⚠️ Nessun test lo vede: jsdom non calcola gli strati.`,
  );
  process.exit(1);
}

console.log(
  `check:strati-tabella — ${letti.length} strati: ${letti.map((s) => `${s.ruolo} +${s.valore}`).join(' < ')}.`,
);
