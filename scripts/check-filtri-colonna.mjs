#!/usr/bin/env node
/**
 * **Chi dichiara la vista sul motore tabella deve anche FILTRARE le righe.**
 *
 * ⛔ **Il difetto è muto, e cattivo.** Un `<app-data-table [viewId]="…">` accende
 * i controlli di filtro nelle intestazioni: l'operatore li vede, sceglie un
 * valore, e **l'elenco non cambia**. Nessun errore, nessun test rosso — solo un
 * comando che finge di funzionare, che è peggio di un comando assente.
 *
 * Il pezzo che manca è `createColumnFilters`, che sta nella tabella dumb perché
 * è lì che vivono le righe, il `cellText` e la riga totali: filtrare altrove
 * lascerebbe i totali sulle righe intere.
 *
 * ⚠️ **La guardia controlla anche il verso opposto**: `createColumnFilters`
 * senza `[viewId]` nel template è un filtro che non riceverà mai uno stato — lo
 * store è per vista, e senza vista non c'è chiave.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function file(dir, est, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) file(p, est, acc);
    else if (voce.endsWith(est)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

/*
  ⚠️ **Il motore è l'unico che accende i controlli**, quindi si cerca `[viewId]`
  DENTRO un `<app-data-table …>`: la stessa proprietà su un altro componente —
  `app-table-column-picker`, la tabella dumb che lo inoltra — non accende niente
  da sé, ed è normale che sia lì.
*/
const APERTURA_MOTORE = /<app-data-table\b[^>]*>/gs;

let difetti = 0;
let conFiltri = 0;

for (const html of file('src', '.html')) {
  const markup = readFileSync(html, 'utf8');
  const ts = html.replace(/\.html$/, '.ts');

  let sorgente = '';
  try {
    sorgente = readFileSync(ts, 'utf8');
  } catch {
    sorgente = '';
  }

  const dichiaraVista = [...markup.matchAll(APERTURA_MOTORE)].some((m) =>
    /\[viewId\]/.test(m[0]),
  );
  // ⚠️ **Il generico esplicito va ammesso**, o la guardia diventa cieca: cercare
  // solo `createColumnFilters(` non trova `createColumnFilters<Riga>({`, che è
  // la forma che si scrive quando il tipo non si inferisce dal solo argomento.
  // Misurato il 02/09/2026 sul dettaglio inventario: la chiamata c'era, e la
  // guardia la dichiarava assente — cioè segnalava un difetto inesistente
  // proprio mentre non avrebbe visto quello vero.
  const filtra = /\bcreateColumnFilters\s*(?:<[^>]*>)?\s*\(/.test(sorgente);

  if (dichiaraVista && !filtra) {
    console.error(
      `⛔ ${html}\n   passa [viewId] al motore — quindi mostra i controlli di filtro — ma il suo .ts non chiama createColumnFilters: i filtri NON restringono niente.`,
    );
    difetti += 1;
    continue;
  }

  if (filtra && !dichiaraVista) {
    console.error(
      `⛔ ${ts}\n   chiama createColumnFilters ma il template non passa [viewId] al motore: lo stato dei filtri non ha una vista a cui agganciarsi.`,
    );
    difetti += 1;
    continue;
  }

  if (dichiaraVista) {
    conFiltri += 1;
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} elenchi con i filtri di colonna a metà.`);
  process.exit(1);
}

console.log(
  `check:filtri-colonna — ${conFiltri} elenchi hanno i filtri di colonna, e tutti restringono davvero.`,
);
