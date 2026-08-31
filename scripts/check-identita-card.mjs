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

const CARD = tutti('src/app/features').filter(
  (f) => f.endsWith('.html') && readFileSync(f, 'utf8').includes('appRowCard'),
);

let difetti = 0;
let campi = 0;

for (const file of CARD) {
  const t = readFileSync(file, 'utf8').split('\r\n').join('\n');
  const nome = file.replace('src/app/features/', '');

  /*
    Ogni blocco `@if (visibile('x')) { … }`: se dentro c'è un campo di identità,
    quel campo è condizionato — cioè può sparire.
  */
  const re = /@if \(visibile\('([^']+)'\)[^)]*\) \{\n([\s\S]*?)\n *\}/g;
  let m;
  while ((m = re.exec(t))) {
    const dentro = m[2];
    const trovati = IDENTITA.filter((c) => dentro.includes(c));
    if (trovati.length === 0) {
      continue;
    }
    difetti += 1;
    console.error(
      `⛔ ${nome}: ${trovati.join(', ')} è condizionato a visibile('${m[1]}') — ` +
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
