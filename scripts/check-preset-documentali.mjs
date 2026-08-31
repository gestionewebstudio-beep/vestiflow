#!/usr/bin/env node
/**
 * **Ogni profilo documentale mostra DATA e NUMERO.**
 *
 * ⭐ Deciso dal proprietario il 31/08/2026: _«I documenti hanno tutti la propria
 * data, quindi va messa la colonna data, numero (numero + serie), e sia da
 * scrivania che da mobile avremo la colonna data del documento e numerazione
 * interna propria.»_
 *
 * Sono le due colonne che un registro non può non avere: senza il numero non si
 * identifica la riga, senza la data non si ordina né si raggruppa. E valgono su
 * entrambe le viste — la card le prende dalle colonne accese.
 *
 * ## ⛔ I preset sono il posto dove si perdono
 *
 * Ognuno è un elenco scritto a mano, e il 31/08/2026 **dieci su quaranta**
 * avevano la data e non il numero. Il peggiore era «Registrazione fattura ·
 * Contabile», che portava il numero della fattura **del fornitore** e non quello
 * interno — due numeri che il file stesso dice di non confondere.
 *
 * ⚠️ **Nessun test poteva vederlo**: un preset è un array di stringhe, compila e
 * passa. Si vede solo scegliendo quel preset e guardando la tabella.
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

/** Gli id che valgono come data e come numero, in tutti i profili. */
const DATE = ['documentDate', 'placedAt', 'fulfilledAt', 'createdAt', 'occurredAt', 'orderDate'];

/**
 * ⚠️ `invoiceNumber` NON è nell'elenco, ed è il punto: è il numero della fattura
 * del FORNITORE, non la numerazione interna. Contarlo avrebbe fatto passare
 * proprio il preset più sbagliato.
 */
const NUMERI = ['reference', 'orderNumber', 'number'];

/** Un catalogo è documentale se dichiara una data documentale. */
const CATALOGHI = tutti('src/app/features').filter(
  (f) => /columns\.config\.ts$/.test(f) && !f.includes('line'),
);

let difetti = 0;
let esaminati = 0;

for (const file of CATALOGHI) {
  const t = readFileSync(file, 'utf8');
  if (!/documentDate|placedAt|fulfilledAt|orderDate/.test(t)) {
    continue;
  }
  const nome = file.split('/').pop().replace('.config.ts', '');
  const mappe = [...t.matchAll(/(\w+_PRESETS)\s*:\s*TableViewPresetMap\s*=\s*\{([\s\S]*?)\n\};/g)];

  for (const [, nomeMappa, corpo] of mappe) {
    for (const [, quale, lista] of corpo.matchAll(/PresetId\.(\w+)\]\s*:\s*\[([\s\S]*?)\]/g)) {
      const ids = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (ids.length === 0) {
        continue;
      }
      esaminati += 1;
      const manca = [
        !ids.some((id) => DATE.includes(id)) && 'DATA',
        !ids.some((id) => NUMERI.includes(id)) && 'NUMERO',
      ].filter(Boolean);
      if (manca.length === 0) {
        continue;
      }
      difetti += 1;
      console.error(`⛔ ${nome} · ${nomeMappa} · ${quale}: manca ${manca.join(' e ')}`);
      console.error(`     [${ids.join(', ')}]`);
    }
  }
}

if (difetti > 0) {
  console.error(
    `\n${difetti} preset documentali su ${esaminati} perdono la data o il numero.\n` +
      `Sono le due colonne che identificano una riga di registro: vanno in OGNI\n` +
      `preset, anche in quelli di analisi.`,
  );
  process.exit(1);
}

console.log(
  `check:preset-documentali — ${esaminati} preset, tutti con data e numero interno.`,
);
