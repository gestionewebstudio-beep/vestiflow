#!/usr/bin/env node
/**
 * Due difetti del giro del Tab che NIENTE fa emergere da solo: non rompono la
 * compilazione, non arrossano un test, non producono un errore visibile finché
 * qualcuno non prova la maschera da tastiera. Sono stati trovati a mano il
 * 18/08/2026, sulla scheda articolo, e questo controllo esiste perché non
 * servano di nuovo occhi umani per accorgersene.
 *
 * ── 1. Focusabile E nascosto all'albero accessibile ────────────────────────
 *
 * `tabindex="0"` insieme ad `aria-hidden="true"` sullo stesso elemento è una
 * contraddizione: il Tab ci si ferma, ma per chi usa uno screen reader quel
 * punto non esiste — si atterra su un nulla annunciato. È anche ciò che fa
 * comparire l'avviso del browser in console quando il fuoco ci entra.
 *
 * Ne sono state trovate SEDICI, tutte icone informative della scheda articolo:
 * uscendo col Tab dal Codice IVA il fuoco andava su un'icona invece che sul
 * campo dopo.
 *
 * La correzione NON è togliere l'attributo: il tooltip si apre anche col fuoco,
 * e su schermo touch quello è l'unico modo (`@media (hover: none)`). È
 * `tabindex="-1"` — fuori dal giro del Tab, ancora raggiungibile col tocco.
 *
 * ── 2. Le voci di un elenco come fermate del Tab ───────────────────────────
 *
 * Un `role="option"` con `tabindex="0"` fa entrare il Tab DENTRO l'elenco,
 * mentre il Tab deve cambiare campo e sono le frecce a muoversi fra le voci
 * (specifica righe documento §4.3). Peggio: quando il pannello si chiude, la
 * voce che aveva il fuoco sparisce dal DOM e il fuoco finisce sul `<body>` —
 * cioè da nessuna parte, e si riparte solo col mouse.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** Tutti i template dell'app. */
function templates(dir) {
  const out = [];
  for (const voce of readdirSync(dir)) {
    const path = join(dir, voce);
    if (statSync(path).isDirectory()) {
      out.push(...templates(path));
    } else if (voce.endsWith('.html')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Il tag che contiene una certa posizione, dal `<` che lo apre al `>` che lo
 * chiude. Serve perché gli attributi stanno su righe diverse: cercarli sulla
 * stessa riga non troverebbe niente.
 */
function tagAttorno(sorgente, posizione) {
  const apertura = sorgente.lastIndexOf('<', posizione);
  const chiusura = sorgente.indexOf('>', posizione);
  if (apertura < 0 || chiusura < 0) {
    return '';
  }
  return sorgente.slice(apertura, chiusura + 1);
}

function riga(sorgente, posizione) {
  return sorgente.slice(0, posizione).split('\n').length;
}

const errori = [];

for (const file of templates(SRC)) {
  const sorgente = readFileSync(file, 'utf8');
  const nome = relative(ROOT, file).split(sep).join('/');

  for (const trovato of sorgente.matchAll(/tabindex="0"/g)) {
    const tag = tagAttorno(sorgente, trovato.index);
    // Il commento che spiega la regola cita gli attributi: non è markup.
    if (tag.startsWith('<!--')) {
      continue;
    }
    if (tag.includes('aria-hidden="true"')) {
      errori.push(
        `${nome}:${riga(sorgente, trovato.index)} — focusabile e aria-hidden insieme: usa tabindex="-1"`,
      );
    }
    if (/role="option"/.test(tag)) {
      errori.push(
        `${nome}:${riga(sorgente, trovato.index)} — una voce di elenco non è una fermata del Tab: usa tabindex="-1"`,
      );
    }
  }
}

if (errori.length > 0) {
  console.error('✗ giro del Tab: %d punti da correggere\n', errori.length);
  for (const e of errori) {
    console.error(`  ${e}`);
  }
  console.error('\n  Vedi scripts/check-tab-stops.mjs per il perché.');
  process.exit(1);
}

console.log(
  '✓ giro del Tab: nessun elemento focusabile è nascosto, nessuna voce di elenco è una fermata.',
);
