#!/usr/bin/env node
/**
 * check:column-gates — la visibilità di una colonna la decide il SELETTORE, e basta.
 *
 * ⛔ **Il difetto che questa guardia impedisce, misurato il 27/08/2026.** La
 * tabella Prodotti rendeva la colonna Shopify con
 * `@if (showColumn('shopify') && showShopifyColumn())`: due gate in serie, di
 * cui il selettore conosceva solo il primo. Per un tenant senza canale Shopify
 * la voce «Shopify» compariva nel tasto Colonne, si poteva accendere, e **non
 * succedeva niente** — un comando che non comanda.
 *
 * ⭐ **La regola è `docs/03` §22 · LINE-012**: «tenant senza modulo Shopify →
 * nessuna colonna; la colonna non compare nemmeno nel selettore; nessun
 * placeholder». E dice anche DOVE sta il gate: «una capacità fornita dalla
 * configurazione, non un ramo hardcoded dentro ogni cella».
 *
 * ⚠️ **Il gate non sparisce: si sposta alla DICHIARAZIONE.** Si filtrano le
 * `defs` passate a `registerView`, come fanno l’Arrivo merce
 * (`goods-receipt-form.component.ts`) e ora l’elenco Prodotti. Così selettore,
 * preset e resa leggono la stessa verità, invece di due che si smentiscono.
 *
 * ⚠️ **Non riguarda le tabelle SENZA selettore colonne** — lì un `@if` sul
 * canale è l’unico gate possibile ed è corretto (es. `location-table` in
 * Impostazioni). Questa guardia cerca solo la condizione COMPOSTA che nomina
 * `showColumn`, cioè il caso in cui un selettore c’è e viene contraddetto.
 *
 * Misura alla scrittura: 48 `@if (showColumn('x'))` semplici, zero composte.
 */
import fs from 'node:fs';
import path from 'node:path';

function percorri(dir, out = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) percorri(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

/** La condizione di un `@if (`, dalla parentesi aperta a quella che la chiude. */
function condizione(testo, apertura) {
  let livello = 0;
  for (let i = apertura; i < testo.length; i += 1) {
    if (testo[i] === '(') livello += 1;
    else if (testo[i] === ')') {
      livello -= 1;
      if (livello === 0) return testo.slice(apertura + 1, i);
    }
  }
  return null;
}

const violazioni = [];
for (const file of percorri('src')) {
  const testo = fs.readFileSync(file, 'utf8');
  for (const m of testo.matchAll(/@if\s*\(/g)) {
    const apertura = m.index + m[0].length - 1;
    const cond = condizione(testo, apertura);
    if (!cond || !cond.includes('showColumn(')) continue;
    if (!/&&|\|\|/.test(cond)) continue;
    violazioni.push({
      file,
      riga: testo.slice(0, m.index).split('\n').length,
      cond: cond.replace(/\s+/g, ' ').trim(),
    });
  }
}

if (violazioni.length > 0) {
  console.error('\n⛔ check:column-gates — una colonna ha un gate OLTRE il selettore.\n');
  for (const v of violazioni) {
    console.error(`   ${v.file}:${v.riga}`);
    console.error(`     @if (${v.cond})`);
    console.error(`     Il selettore conosce solo showColumn(): l'altra condizione lo`);
    console.error(`     contraddice in silenzio — la voce si accende e non compare nulla.`);
    console.error(`     Sposta il gate su registerView(), filtrando le defs.\n`);
  }
  process.exit(1);
}

const semplici = percorri('src').reduce(
  (n, f) => n + [...fs.readFileSync(f, 'utf8').matchAll(/@if\s*\(\s*showColumn\(/g)].length,
  0,
);
console.log(
  `✅ check:column-gates — ${semplici} colonne condizionate, tutte dal solo selettore.`,
);
