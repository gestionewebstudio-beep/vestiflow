#!/usr/bin/env node
/**
 * **Le classi di caratteri delle regex hanno la loro barra rovesciata.**
 *
 * ⛔ **Il difetto, trovato in PRODUZIONE il 31/08/2026**:
 *
 * ```ts
 * const ISO_DATE = /^d{4}-d{2}-d{2}$/;   // ⛔ mancano tre \
 * ```
 *
 * Quel regex accetta **solo la stringa letterale `dddd-dd-dd`**. Filtrava le
 * date degli Ordini fornitore: l'operatore impostava un periodo, ricaricava la
 * pagina, e il periodo spariva — senza errore e senza test rosso.
 *
 * ⚠️ **Una regex che non aggancia mai non fallisce**: si limita a rifiutare
 * tutto, o ad accettare tutto. È il difetto più silenzioso che ci sia.
 *
 * ## Da dove viene
 *
 * Gli heredoc di shell mangiano le barre doppie: `\\d` diventa `\d`, e dentro un
 * template literal JS `\d` collassa a `d`. **Cinque volte in una giornata** su
 * questo progetto, di cui una arrivata in produzione mesi fa.
 *
 * ## Che cosa cerca
 *
 * Un quantificatore `{n}` o `{n,m}` subito dopo una lettera che è una classe
 * nota (`d`, `w`, `s`, `S`, `W`, `D`) **non preceduta da barra**. È la forma in
 * cui il difetto si manifesta: `d{4}` invece di `\d{4}`.
 *
 * ⚠️ **Non segnala `x{2}`** su lettere che classi non sono: `a{3}` è
 * legittimamente «tre a». Solo le sei lettere che hanno un significato speciale
 * quando precedute da barra.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tutti(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'node_modules' || nome === 'dist' || nome === '.angular') continue;
      tutti(p, acc);
    } else if (/\.(ts|mjs|js)$/.test(p)) {
      acc.push(p.replace(/\\/g, '/'));
    }
  }
  return acc;
}

/** Le lettere che sono una classe SOLO se precedute da barra. */
const CLASSI = 'dwsSWD';

let difetti = 0;
let esaminate = 0;

for (const file of [...tutti('src'), ...tutti('api/src'), ...tutti('scripts'), ...tutti('e2e')]) {
  const righe = readFileSync(file, 'utf8').split(/\r?\n/);

  righe.forEach((riga, i) => {
    /*
      I letterali regex della riga. ⚠️ Si esclude ciò che sta dopo `//` o dentro
      una stringa: un commento che PARLA di regex non è una regex.
    */
    const senzaCommento = riga.replace(/\/\/.*$/, '').replace(/\*.*$/, '');
    const letterali = [...senzaCommento.matchAll(/\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+)\/[gimsuy]*/g)];

    for (const letterale of letterali) {
      esaminate += 1;
      const corpo = letterale[1];
      /*
        ⚠️ Si tolgono prima le sequenze CON la barra, o `\d{4}` verrebbe visto
        come una `d{4}` nuda subito dopo il carattere `\`.
      */
      const nudo = corpo.replace(/\\./g, '·');
      const sospetti = [...nudo.matchAll(new RegExp(`(?<![·\\[])([${CLASSI}])\\{\\d`, 'g'))];
      if (sospetti.length === 0) {
        continue;
      }
      difetti += 1;
      console.error(
        `⛔ ${file}:${i + 1} — /${corpo}/ contiene ` +
          `${sospetti.map((s) => `«${s[1]}{…}»`).join(', ')} senza barra: ` +
          `è la lettera, non la classe. La regex non aggancerà mai ciò che dovrebbe.`,
      );
    }
  });
}

if (difetti > 0) {
  console.error(
    `\n${difetti} regex con una classe di caratteri senza barra, su ${esaminate} esaminate.\n` +
      `⚠️ Una regex che non aggancia mai non fallisce: rifiuta tutto in silenzio.`,
  );
  process.exit(1);
}

console.log(`check:regex-barre — ${esaminate} regex, nessuna classe di caratteri senza barra.`);
