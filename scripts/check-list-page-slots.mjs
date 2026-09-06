#!/usr/bin/env node
/**
 * ⛔ **Il telaio elenco SCARTA in silenzio il contenuto senza slot.**
 *
 * `app-list-page` ha N caselle nominate (`<ng-content select="[x]">`) e nessuna
 * casella senza nome. Angular elimina dal DOM il contenuto proiettato che non
 * trova uno slot: **nessun errore, nessun test rosso** — il componente viene
 * perfino costruito, solo non compare.
 *
 * Misurato il 29/08/2026: due pannelli persi cosi'. Il filtro mobile di Ordini
 * fornitore («Filtri (n)» non apriva niente) e il «Nuovo ordine fornitore» di
 * Situazione magazzino, che non compariva su nessun device.
 *
 * ⭐ Le caselle si SCOPRONO dal template del telaio, non si elencano qui: una
 * casella nuova non richiede di ricordarsi di aggiornare la guardia.
 */
import { readFileSync, globSync } from 'node:fs';

const TELAIO = 'src/app/shared/components/list-page/list-page.component.html';
const TESTA = readFileSync(TELAIO, 'utf8');

const slot = [...TESTA.matchAll(/<ng-content\s+select="\[([\w-]+)\]"/g)].map((m) => m[1]);
if (slot.length === 0) {
  console.error('check:list-page-slots — nessuno slot trovato nel telaio: guardia cieca.');
  process.exit(1);
}
if (/<ng-content\s*\/?>/.test(TESTA)) {
  console.error(
    'check:list-page-slots — il telaio ha una casella SENZA nome: questa guardia non serve piu\',\n' +
      'e va tolta insieme alla decisione che la introduce.',
  );
  process.exit(1);
}

/** Nomi che non sono elementi: i blocchi di controllo Angular non si proiettano. */
const TAG_VUOTI = new Set(['img', 'input', 'br', 'hr', 'source', 'track', 'wbr']);

/** Figli di primo livello di `<app-list-page>`, con la riga in cui stanno. */
function figli(testo) {
  const apre = testo.indexOf('<app-list-page');
  if (apre < 0) return [];
  const inizio = testo.indexOf('>', apre) + 1;
  const chiude = testo.indexOf('</app-list-page>');
  const corpo = testo.slice(inizio, chiude < 0 ? undefined : chiude);

  const trovati = [];
  let profondita = 0;
  // ⚠️ Il gruppo degli attributi è PIGRO (`*?`) apposta: greedy, `[^>"']`
  //    inghiotte anche la barra di `/>` e ogni tag auto-chiuso viene contato
  //    come aperto. La profondità non torna mai a zero e la guardia smette di
  //    vedere — misurato falsificandola il 29/08/2026: non segnalava nulla.
  const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*(\/?)>/g;
  let m;
  while ((m = tag.exec(corpo)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    const chiusura = m[1] === '/';
    const nome = m[2];
    const attributi = m[3];
    const autoChiusura = m[4] === '/';

    if (chiusura) {
      profondita -= 1;
      continue;
    }
    if (profondita === 0) {
      trovati.push({ nome, attributi, riga: testo.slice(0, inizio + m.index).split('\n').length });
    }
    if (!autoChiusura && !TAG_VUOTI.has(nome)) profondita += 1;
  }
  return trovati;
}

const consumatori = globSync('src/app/**/*.html').filter((f) =>
  readFileSync(f, 'utf8').includes('<app-list-page'),
);

let guasti = 0;
for (const file of consumatori) {
  const testo = readFileSync(file, 'utf8');
  for (const figlio of figli(testo)) {
    const dichiara = slot.some((s) =>
      new RegExp('(^|\\s)' + s + '(\\s|=|$)').test(figlio.attributi),
    );
    if (dichiara) continue;
    guasti += 1;
    console.error(
      '  ' +
        file.split('\\').join('/') +
        ':' +
        figlio.riga +
        '  <' +
        figlio.nome +
        '> non dichiara nessuno slot — Angular lo scarta.',
    );
  }
}

if (guasti > 0) {
  console.error(
    '\ncheck:list-page-slots — ' +
      guasti +
      " figlio/i del telaio senza slot.\nCaselle disponibili: " +
      slot.map((s) => '[' + s + ']').join(' ') +
      '\nGli overlay (dialoghi, pannelli laterali) vanno in [overlays].',
  );
  process.exit(1);
}

console.log(
  'check:list-page-slots — ' +
    consumatori.length +
    ' pagine, ' +
    slot.length +
    ' caselle, nessun orfano.',
);
