#!/usr/bin/env node
/**
 * I parametri della RICERCA ARTICOLO PER NOME — quella che si apre digitando
 * nel campo nome di una riga documento (specifica §9) — erano in OTTO copie:
 * sette maschere più il pannello condiviso, che per di più chiamava la propria
 * `SEARCH_DEBOUNCE_MS` invece di `VARIANT_SEARCH_DEBOUNCE_MS`: stesso valore,
 * nome diverso, quindi invisibile a chi cercava le copie.
 *
 * Tutte con gli stessi numeri, ma per coincidenza tenuta a mano. Cambiarne una
 * avrebbe cambiato il comportamento di una maschera sola, e niente lo avrebbe
 * fatto vedere: non rompe la compilazione, non arrossa un test, e a schermo si
 * nota solo mettendo due maschere accanto.
 *
 * ⛔ Il divieto NON è sul valore: è sulla RIDICHIARAZIONE. Cambiare la soglia si
 * fa nel modulo condiviso, dove vale per tutti.
 *
 * ⚠️ **Il controllo è STRETTO apposta**, e la prima versione non lo era: cercava
 * `pageSize` ovunque nel file e accusava l'elenco clienti (100) e gli ordini
 * fornitore ricevibili (50), che non sono questa ricerca. Guarda solo dentro
 * una chiamata `searchVariantSummaries` che porta `search:` — cioè una ricerca
 * per TESTO. Risolvere un barcode (5), caricare le varianti di un prodotto
 * (100) o confermare un codice (1) sono strumenti diversi, e la specifica li
 * distingue apposta (§10).
 *
 * ⚠️ E NON guarda `SEARCH_DEBOUNCE_MS` in generale: quel nome sta in tredici
 * elenchi (clienti, fornitori, movimenti, documenti, ricerca globale) che sono
 * ricerche diverse da questa. È una duplicazione vera, ma di un altro
 * perimetro, e accusarla qui renderebbe questo controllo rumore da ignorare.
 *
 * Specifica: `docs/03-specifica-unificazione-righe-documento.md` §9.1 («un solo
 * motore») e §28 («non costruire motori ricerca locali»).
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const CASA = 'document-variant-search.config.ts';
const MODULO = '@domain/documents/utils/document-variant-search.config';

/** Le costanti che possono vivere in un posto solo. */
const NOMI = [
  'VARIANT_SEARCH_MIN_CHARS',
  'VARIANT_SEARCH_DEBOUNCE_MS',
  'VARIANT_SEARCH_PAGE_SIZE',
];

const file = globSync('src/app/**/*.ts').filter((f) => !f.endsWith('.spec.ts'));
const colpevoli = [];

for (const f of file) {
  const percorso = f.split('\\').join('/');
  if (percorso.endsWith(CASA)) continue;
  const testo = readFileSync(f, 'utf8');
  const righe = testo.split('\n');

  // 1. Ridichiarazione locale di uno dei tre nomi.
  for (const nome of NOMI) {
    const re = new RegExp(`^\\s*(?:const|let|var)\\s+${nome}\\s*=`);
    const i = righe.findIndex((l) => re.test(l));
    if (i >= 0) {
      colpevoli.push(`${percorso}:${i + 1} — ridichiara ${nome}, che vive nel modulo condiviso`);
    }
  }

  // 2. Un `pageSize` numerico dentro una ricerca PER TESTO.
  //
  //    ⚠️ Solo nei file che IMPORTANO il modulo condiviso, cioè che dichiarano
  //    di fare questa ricerca. Senza questa condizione il controllo accusava
  //    `barcode-lookup.service`, che cerca per testo (`search: code`) ma sta
  //    risolvendo un CODICE — e cinque risultati sono giusti lì.
  if (!testo.includes(MODULO)) continue;
  const chiamate = testo.matchAll(/searchVariantSummaries\(\s*\{([^}]*)\}/gs);
  for (const c of chiamate) {
    const corpo = c[1] ?? '';
    if (!/\bsearch\s*:/.test(corpo)) continue;
    const m = corpo.match(/pageSize:\s*(\d+)/);
    if (!m) continue;
    const riga = testo.slice(0, c.index).split('\n').length;
    colpevoli.push(
      `${percorso}:${riga} — ricerca per nome con \`pageSize: ${m[1]}\` cablato: usa VARIANT_SEARCH_PAGE_SIZE`,
    );
  }
}

if (colpevoli.length > 0) {
  console.error('\n✗ parametri della ricerca articolo duplicati fuori dal modulo condiviso:\n');
  for (const c of colpevoli) console.error(`  ${c}`);
  console.error(
    `\n  Vivono in src/app/domain/documents/utils/${CASA}.\n  Cambiarli si fa lì: vale per tutte le maschere insieme.\n`,
  );
  process.exit(1);
}

console.log('✓ ricerca articolo: i parametri stanno in un posto solo, nessuna copia locale.');
