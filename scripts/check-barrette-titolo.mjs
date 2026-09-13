#!/usr/bin/env node
/**
 * ⛔ **La barretta verticale in `--color-primary` accanto a un titolo è stata
 *    RESPINTA dal proprietario** (01/09/2026, sull'anagrafica: «blocchetti neri
 *    poco eleganti, non è stata una buona idea»), e il 13/09/2026 era tornata
 *    su due pannelli Shopify — perché `regole-stile-ui` §7-bis la prescriveva
 *    ancora, e nessuna guardia la fermava.
 *
 * La ragione è misurabile: `--color-primary` è `#25343b`, un grigio-blu che in
 * una barra da 4×14px **legge nero**. Una tinta si riconosce su una superficie,
 * non su un filo. ⭐ Il colore va sul TESTO del titolo, con il filo sotto tinto
 * al 22% (`_anagrafica.scss`, `--form-section-title-color`).
 *
 * Fallisce se un foglio dichiara `border-inline-start` (o `border-left`) con
 * `--border-width-accent` **e** `--color-primary` a piena tinta nella stessa
 * regola. Gli accenti TINTI (`color-mix`) e quelli di stato (`--color-warning`,
 * `--color-info`) sono un'altra cosa: sono la grammatica delle card, e restano.
 */
import { globSync, readFileSync } from 'node:fs';

const fogli = globSync('src/**/*.scss');
const difetti = [];

for (const foglio of fogli) {
  const testo = readFileSync(foglio, 'utf8');
  // Una regola per volta: dal selettore alla graffa di chiusura.
  const regole = testo.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selettore, corpo] of regole) {
    const righe = corpo.split('\n');
    for (const riga of righe) {
      const dichiarazione = riga.trim();
      if (!/^border-(inline-start|left)\s*:/.test(dichiarazione)) {
        continue;
      }
      if (
        dichiarazione.includes('--border-width-accent') &&
        /var\(--color-primary\)/.test(dichiarazione) &&
        !dichiarazione.includes('color-mix')
      ) {
        difetti.push(
          `${foglio}\n     ${selettore.trim().split('\n').at(-1)?.trim()} → ${dichiarazione}`,
        );
      }
    }
  }
}

if (difetti.length > 0) {
  console.error(
    '⛔ Barretta verticale in --color-primary accanto a un titolo: forma RESPINTA (01/09/2026).',
  );
  console.error(
    '   Il colore va sul testo del titolo, il filo sotto è tinto (`_anagrafica.scss`).',
  );
  for (const difetto of difetti) {
    console.error(`   ${difetto}`);
  }
  process.exit(1);
}
console.log(
  `✓ check:barrette-titolo — ${fogli.length} fogli, nessuna barretta piena in --color-primary`,
);
