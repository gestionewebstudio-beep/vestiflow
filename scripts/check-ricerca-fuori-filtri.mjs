#!/usr/bin/env node
/**
 * **Ricerca e Periodo NON seguono il pulsante «Filtri»** (`14` §0.2).
 *
 * Decisione del proprietario, 31/08/2026: _«ricerca e periodo possono restare
 * fuori»_. Hanno il proprio controllo sempre a vista in barra — la ricerca il suo
 * campo, il periodo il suo slot — a ogni larghezza: spegnere «Filtri» non li
 * tocca, e non contano nel badge.
 *
 * ⛔ **La divergenza era in NOVE pagine su nove**, e nessun test la copriva: la
 * regola era scritta da giorni e il codice faceva il contrario, in silenzio.
 * Chi premeva «Filtri» per spegnerli si ritrovava la ricerca svuotata e — su
 * Movimenti, Documenti e Ordini cliente — anche le date riportate al
 * predefinito.
 *
 * ⚠️ **Il controllo è per NOME**, e non può essere altrimenti: i campi del
 * periodo si chiamano diversamente su ogni elenco (`dateFrom`, `placedFrom`,
 * `fulfilledFrom`, `fromFilter`, `periodPreset`). Aggiungendo un elenco con un
 * nome nuovo, va aggiunto anche qui.
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

/** Chi non deve comparire nel corpo del metodo di azzeramento. */
const FUORI = [
  { nome: 'la RICERCA', regex: /\bsearch(?:Draft)?\b/ },
  {
    nome: 'il PERIODO',
    regex: /\b(?:periodPreset|periodFilter|fromFilter|toFilter|\w*(?:From|To))\b/,
  },
];

/**
 * Il corpo di un metodo, dalla graffa aperta alla sua chiusura.
 *
 * ⚠️ Conta le graffe invece di fermarsi alla prima chiusura: il corpo contiene
 * oggetti letterali, e una regex ingorda prenderebbe mezzo file.
 */
function corpoDi(sorgente, nomeMetodo) {
  const inizio = sorgente.indexOf(`${nomeMetodo}(): void {`);
  if (inizio < 0) {
    return null;
  }
  let profondita = 0;
  for (let i = sorgente.indexOf('{', inizio); i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') profondita += 1;
    else if (sorgente[i] === '}') {
      profondita -= 1;
      if (profondita === 0) {
        return sorgente.slice(inizio, i + 1);
      }
    }
  }
  return null;
}

let difetti = 0;
let controllati = 0;

for (const html of file('src', '.html')) {
  const markup = readFileSync(html, 'utf8');
  const legame = markup.match(/\(filtersCleared\)="(\w+)\(\)"/);
  if (!legame) {
    continue;
  }

  const ts = html.replace(/\.html$/, '.ts');
  let sorgente;
  try {
    sorgente = readFileSync(ts, 'utf8');
  } catch {
    console.error(`⛔ ${html} lega (filtersCleared) ma non ha un .ts accanto.`);
    difetti += 1;
    continue;
  }

  const metodo = legame[1];
  const corpo = corpoDi(sorgente, metodo);
  if (corpo === null) {
    console.error(`⛔ ${ts}\n   (filtersCleared) chiama «${metodo}()», che non esiste.`);
    difetti += 1;
    continue;
  }

  controllati += 1;
  for (const { nome, regex } of FUORI) {
    if (regex.test(corpo)) {
      console.error(
        `⛔ ${ts}\n   «${metodo}()» azzera ${nome}, che sta FUORI dal pulsante «Filtri» (14 §0.2):\n   ha il proprio controllo sempre a vista, e spegnere i filtri non deve toccarlo.`,
      );
      difetti += 1;
    }
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} azzeramenti che portano via ciò che non devono.`);
  process.exit(1);
}

console.log(
  `check:ricerca-fuori-filtri — ${controllati} elenchi azzerano i filtri, nessuno tocca ricerca o periodo.`,
);
