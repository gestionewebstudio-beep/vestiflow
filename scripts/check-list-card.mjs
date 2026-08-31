#!/usr/bin/env node
/**
 * **La grafica della card di elenco è quella dei Corrispettivi, e non si tocca.**
 *
 * ⭐ Su quel registro il disegno era stato chiuso: tre fasce, «a sinistra le
 * parole, a destra i numeri», ogni misura decisa guardando lo schermo. Il
 * 30/08/2026 quelle regole sono state promosse a grammatica comune di tutti gli
 * elenchi (`styles/_list-card.scss`) — **cambiando i nomi delle classi, non il
 * disegno**.
 *
 * ⛔ **E nel promuoverle ne erano cambiate tre**, senza che nessuno se ne
 * accorgesse: `align-items: center` aggiunto sulla fascia importi e
 * `font-variant-numeric` duplicato in due punti. Nessun test poteva vederlo — è
 * CSS, e jsdom non calcola il layout.
 *
 * Questa guardia confronta le dichiarazioni **una per una** con quelle originali,
 * congelate qui sotto. Un ritocco alla grammatica è legittimo: va fatto
 * aggiornando ANCHE questa lista, cioè dichiarando che si sta cambiando un
 * disegno chiuso — non di sfuggita.
 */
import { readFileSync } from 'node:fs';

/**
 * Il disegno originale, dal foglio dei Corrispettivi prima della promozione.
 * ⚠️ Le chiavi sono le classi comuni; i valori, le dichiarazioni attese.
 */
const DISEGNO = {
  'list-card__head': [
    'align-items: baseline',
    'display: flex',
    'flex-wrap: nowrap',
    'font-size: var(--text-sm)',
    'gap: var(--space-2)',
  ],
  'list-card__ident': [
    'align-items: baseline',
    'display: flex',
    'flex: 1',
    'gap: var(--space-2)',
    'min-inline-size: 0',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'white-space: nowrap',
  ],
  'list-card__when': ['color: var(--color-text-muted)', 'flex-shrink: 0'],
  'list-card__what': ['font-weight: var(--font-weight-semibold)'],
  'list-card__what--negative': ['color: var(--color-danger)'],
  'list-card__anchor': ['color: var(--color-text-muted)', 'flex-shrink: 0'],
  'list-card__words': [
    'color: var(--color-text-muted)',
    'display: flex',
    'flex-wrap: wrap',
    'font-size: var(--text-xs)',
    'gap: var(--space-1) var(--space-2)',
  ],
  'list-card__figures': [
    'color: var(--color-text-muted)',
    'display: flex',
    'flex-wrap: wrap',
    'font-size: var(--text-xs)',
    'gap: var(--space-1) var(--space-3)',
    'justify-content: flex-end',
  ],
  'list-card__total': [
    'color: var(--color-text)',
    'flex-shrink: 0',
    'font-size: var(--text-sm)',
    'font-weight: var(--font-weight-bold)',
  ],
  'list-card__total--negative': ['color: var(--color-danger)'],
  'list-card__caret': [
    'align-self: center',
    'color: var(--color-text-subtle)',
    'flex-shrink: 0',
    'font-size: var(--text-xs)',
  ],
  'list-card__caret--empty': ['visibility: hidden'],
  'list-card__undetermined': ['color: var(--color-text-subtle)', 'font-style: italic'],
};

const foglio = readFileSync('src/styles/_list-card.scss', 'utf8');

/** Le dichiarazioni di un ruleset, normalizzate e ordinate. */
function regoleDi(classe) {
  const re = new RegExp(`\\.${classe.replace(/-/g, '\\-')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(foglio);
  if (!m) {
    return null;
  }
  return m[1]
    .split(';')
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r.length > 0 && !r.startsWith('//') && !r.startsWith('/*'))
    .sort();
}

let difetti = 0;

for (const [classe, attese] of Object.entries(DISEGNO)) {
  const trovate = regoleDi(classe);
  if (trovate === null) {
    console.error(`⛔ .${classe} non esiste più: era parte del disegno chiuso dei Corrispettivi.`);
    difetti += 1;
    continue;
  }
  const mancanti = attese.filter((r) => !trovate.includes(r));
  const aggiunte = trovate.filter((r) => !attese.includes(r));
  if (mancanti.length === 0 && aggiunte.length === 0) {
    continue;
  }
  difetti += 1;
  console.error(`⛔ .${classe} non è più il disegno originale:`);
  for (const r of mancanti) console.error(`     − ${r}   (c'era e non c'è più)`);
  for (const r of aggiunte) console.error(`     + ${r}   (aggiunta)`);
}

if (difetti > 0) {
  console.error(
    `\n${difetti} classi divergono dal disegno chiuso.\n` +
      `Se il cambiamento è voluto, aggiorna DISEGNO in questo file: cambiare una\n` +
      `grafica decisa è una decisione, e va dichiarata.`,
  );
  process.exit(1);
}

console.log(
  `check:list-card — ${Object.keys(DISEGNO).length} classi, tutte fedeli al disegno dei Corrispettivi.`,
);
