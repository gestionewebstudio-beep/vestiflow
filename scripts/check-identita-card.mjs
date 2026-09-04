#!/usr/bin/env node
/**
 * **L'identità di una card non segue il selettore Colonne.**
 *
 * ⭐ Deciso dal proprietario il 31/08/2026: _«spegnere una colonna non deve
 * rompere la card dei riepiloghi»_.
 *
 * ## ⛔ Qui c'era la decisione opposta
 *
 * Ogni campo della card era condizionato a `visibile(...)`, con la motivazione —
 * scritta in dodici file — che «la card legge le colonne che il motore ha già
 * ricevuto: una fonte sola invece di due che possono divergere». L'argomento non
 * era sbagliato, ed è stato pesato contro un altro: **spegnendo due o tre colonne
 * la card restava senza data, senza numero o del tutto vuota.**
 *
 * Il selettore Colonne governa la TABELLA — è lì che si guadagna larghezza — e
 * una card non ha colonne da restringere.
 *
 * ## Che cosa resta legato alle colonne, e perché
 *
 * ```text
 * identità  ·  __when · __what · __anchor   ⭐ sempre presente
 * parole    ·  origine, sede, stato          segue le colonne
 * numeri    ·  importi, quantità             segue le colonne
 * ```
 *
 * L'identità risponde a «di che riga si tratta», e una riga di cui non si sa
 * quale sia non è consultabile. Il resto è dettaglio, ed è esattamente ciò che
 * l'operatore chiede di togliere spegnendo una colonna.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tutti(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) tutti(p, acc);
    else acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

const IDENTITA = ['list-card__when', 'list-card__what', 'list-card__anchor'];

/**
 * ⭐ **Ogni blocco `@if (…) { … }`, con parentesi e graffe BILANCIATE.**
 *
 * ⛔ La forma a regex sbagliava in due modi documentati: `[^)]*` non attraversa
 * una parentesi annidata, e `@if \(visibile` esige la condizione sulla stessa
 * riga — mentre Prettier la manda a capo oltre i 100 caratteri. In entrambi i
 * casi un campo di identità tornava spegnibile senza che la guardia lo dicesse.
 *
 * ⚠️ **Bilanciare non è un lusso**: una condizione è un'espressione, e le
 * espressioni si contano, non si indovinano.
 */
function blocchiCondizionali(testo) {
  const blocchi = [];
  const re = /@if\s*\(/g;
  let m;

  while ((m = re.exec(testo))) {
    // 1. La condizione: dalla parentesi aperta alla sua chiusa.
    let i = m.index + m[0].length;
    let profondita = 1;
    const daCondizione = i;
    while (i < testo.length && profondita > 0) {
      if (testo[i] === '(') profondita += 1;
      else if (testo[i] === ')') profondita -= 1;
      i += 1;
    }
    if (profondita !== 0) {
      continue;
    }
    const condizione = testo.slice(daCondizione, i - 1);

    // 2. Il corpo: dalla graffa aperta alla sua chiusa.
    const apertura = testo.indexOf('{', i);
    if (apertura < 0) {
      continue;
    }
    let k = apertura + 1;
    profondita = 1;
    while (k < testo.length && profondita > 0) {
      if (testo[k] === '{') profondita += 1;
      else if (testo[k] === '}') profondita -= 1;
      k += 1;
    }
    if (profondita !== 0) {
      continue;
    }

    blocchi.push({ condizione, corpo: testo.slice(apertura + 1, k - 1) });
  }

  return blocchi;
}

const CARD = tutti('src/app/features').filter(
  (f) => f.endsWith('.html') && readFileSync(f, 'utf8').includes('appRowCard'),
);

let difetti = 0;
let campi = 0;

for (const file of CARD) {
  const t = readFileSync(file, 'utf8').split('\r\n').join('\n');
  const nome = file.replace('src/app/features/', '');

  /*
    ⛔ **Qui c'era una REGEX, ed era cieca in due modi** — misurati da una
    revisione avversariale il 31/08/2026, iniettando guasti veri:

    ```text
    @if (visibile('x') && (a || b))    il [^)]* non attraversa una `)`
    @if (\n  visibile('x') && …\n) {   Prettier va a capo oltre i 100 caratteri
    ```

    In entrambi i casi il campo di identità tornava spegnibile e la guardia
    restava verde. ⚠️ Una regex che deve capire una condizione annidata non è la
    forma giusta: le parentesi si BILANCIANO, non si indovinano.
  */
  for (const blocco of blocchiCondizionali(t)) {
    const trovati = IDENTITA.filter((c) => blocco.corpo.includes(c));
    if (trovati.length === 0) {
      continue;
    }
    /*
      ⚠️ **Non ogni `@if` è un difetto.** `valoreCard(...)` è la condizione che
      OMETTE un segnaposto vuoto, ed è voluta: l'identità c'è sempre, ma un
      trattino nudo in cima a una card no. Il difetto è dipendere dalle COLONNE.
    */
    if (!/visibile\(|colonne\(|columns\(/.test(blocco.condizione)) {
      continue;
    }
    difetti += 1;
    const condizione = blocco.condizione.replace(/\s+/g, ' ').trim();
    console.error(
      `⛔ ${nome}: ${trovati.join(', ')} è condizionato a «${condizione}» — ` +
        `spegnendo quella colonna la card perde la propria identità.`,
    );
  }

  campi += IDENTITA.filter((c) => t.includes(c)).length;
}

if (difetti > 0) {
  console.error(
    `\n${difetti} campi di identità dipendono dal selettore Colonne.\n` +
      `Il selettore governa la TABELLA: una card non ha colonne da restringere.`,
  );
  process.exit(1);
}

console.log(
  `check:identita-card — ${CARD.length} card, ${campi} campi di identità, nessuno spegnibile.`,
);
