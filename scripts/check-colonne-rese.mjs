#!/usr/bin/env node
/**
 * **Ogni colonna dichiarata ha qualcuno che la rende.**
 *
 * ⛔ **Il difetto che questa guardia esiste per prendere, misurato il
 * 31/08/2026**: tre colonne — Operatore, Sede, Scadenza — erano state aggiunte a
 * cinque cataloghi documentali **senza il loro ramo in `cellText`**. Accendendole
 * dal selettore Colonne si ottenevano tre colonne **sempre vuote** su Documenti,
 * Vendite, Fatture, Vendite al banco e Arrivi merce: cadevano nel
 * `default: return ''`.
 *
 * ⚠️ **Non falliva niente.** Una colonna senza renderer compila, passa il lint e
 * passa 5.281 test: è una stringa in un array e una cella vuota a schermo.
 * L'hanno trovata una revisione avversariale e nessuna delle 44 guardie — perché
 * nessuna incrociava il **catalogo colonne** con **chi rende quella cella**.
 *
 * ## Come si rende una colonna, e sono quattro modi
 *
 * ```text
 * case 'x':                     nel cellText del componente
 * <ng-template appCell="x">     nel suo template
 * COLONNE_DOCUMENTO_CONDIVISE   il catalogo condiviso, che porta il renderer con sé
 * colonne strutturali           'select' e simili: le disegna il motore
 * ```
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const leggi = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

function tutti(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) tutti(p, acc);
    else acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

const FILE = tutti('src/app/features');

/**
 * ⚠️ Le colonne che il MOTORE disegna da sé, senza passare da `cellText`.
 * Non sono eccezioni comode: sono celle strutturali, non celle di dato.
 */
const STRUTTURALI = new Set(['select', 'actions', 'rowActions']);

/** I cataloghi di ELENCO (non le righe documento, che sono un'altra cosa). */
const CATALOGHI = FILE.filter((f) => /columns\.config\.ts$/.test(f) && !f.includes('line'));

/**
 * Il renderer condiviso porta con sé le colonne che sa rendere.
 *
 * ⛔ **Ma valgono solo se qualcuno lo CHIAMA.** La prima stesura di questa
 * guardia le dava per rese perché il modulo esisteva — e in quel momento
 * `cellText` non lo invocava affatto: la guardia passava verde sul difetto che
 * era nata per prendere. Una guardia che si fida di una dichiarazione invece che
 * di un uso è cieca esattamente dove serve.
 */
const CONDIVISE = new Set(
  [
    ...leggi('src/app/features/documents/models/document-shared-columns.ts').matchAll(
      /^ {2}(\w+): \{$/gm,
    ),
  ].map((m) => m[1]),
);

const CHIAMATA_CONDIVISA = 'testoColonnaCondivisa(';

let difetti = 0;
let esaminate = 0;

for (const catalogo of CATALOGHI) {
  const testo = leggi(catalogo);
  const nome = catalogo.split('/').pop();

  // Le colonne dichiarate: `{ id: 'x'` e `colonna('x'`.
  const ids = new Set([
    ...[...testo.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]),
    ...[...testo.matchAll(/colonna\('([^']+)'/g)].map((m) => m[1]),
  ]);
  if (ids.size === 0) {
    continue;
  }

  /*
    ⛔ **Il renderer NON sta dove sta l'import.** La pagina importa il catalogo e
    lo passa a un componente tabella figlio (`[columns]`): è quello a rendere le
    celle. Cercando solo in chi importa, la prima stesura di questa guardia ha
    dato **venti falsi positivi** — tutte le colonne di Clienti dichiarate «non
    rese» mentre `customer-table` le rendeva tutte.

    ⭐ Si guarda quindi l'intera FEATURE: pagina e componenti tabella stanno
    sotto la stessa cartella, e basta che uno dei due renda la colonna.
  */
  const feature = catalogo.replace(/^(src\/app\/features\/[^/]+)\/.*$/, '$1');
  const consumer = FILE.filter((f) => f.startsWith(`${feature}/`) && /\.component\.ts$/.test(f));
  if (consumer.length === 0) {
    continue;
  }

  const reso = new Set();
  let delegaAlCondiviso = false;

  for (const c of consumer) {
    const ts = leggi(c);
    const html = leggi(c.replace(/\.ts$/, '.html'));
    for (const m of ts.matchAll(/case '([^']+)':/g)) reso.add(m[1]);
    for (const m of html.matchAll(/appCell="([^"]+)"/g)) reso.add(m[1]);
    if (ts.includes(CHIAMATA_CONDIVISA)) {
      delegaAlCondiviso = true;
    }
  }

  // ⭐ Le colonne condivise contano SOLO se questa feature le invoca davvero.
  if (delegaAlCondiviso) {
    for (const id of CONDIVISE) reso.add(id);
  }

  /*
    ⛔ **Un catalogo che CHIAMA `conColonneCondivise` eredita colonne che nel suo
    testo non compaiono.**

    È il buco che ha fatto passare la falsificazione: le tre colonne condivise
    non stanno più letteralmente nel catalogo — le aggiunge una funzione — quindi
    l'analisi statica non le vedeva né come dichiarate né come mancanti, e la
    guardia restava verde anche dopo aver tolto la delega da `cellText`.

    ⚠️ Una guardia che non conta una colonna non la sta proteggendo: la sta
    ignorando.
  */
  if (testo.includes('conColonneCondivise(')) {
    for (const id of CONDIVISE) {
      ids.add(id);
    }
    if (!delegaAlCondiviso) {
      difetti += 1;
      console.error(
        `⛔ ${nome}: usa \`conColonneCondivise\` ma nessun componente di ` +
          `${feature.split('/').pop()} chiama \`${CHIAMATA_CONDIVISA}\` — ` +
          `quelle colonne finiscono nel selettore e restano vuote.`,
      );
      continue;
    }
  }

  for (const id of ids) {
    if (STRUTTURALI.has(id)) {
      continue;
    }
    esaminate += 1;
    if (reso.has(id)) {
      continue;
    }
    difetti += 1;
    console.error(
      `⛔ ${nome}: la colonna '${id}' non ha nessun renderer — ` +
        `né un \`case\` né un \`appCell\` in ${feature.split('/').pop()}. ` +
        `Accendendola si ottiene una colonna vuota.`,
    );
  }
}

if (difetti > 0) {
  console.error(
    `\n${difetti} colonne su ${esaminate} sono dichiarate e non rese.\n` +
      `Una colonna senza renderer compila, passa il lint e passa i test: si vede\n` +
      `solo accendendola dal selettore Colonne e guardando la tabella.`,
  );
  process.exit(1);
}

console.log(`check:colonne-rese — ${esaminate} colonne di elenco, tutte con il proprio renderer.`);
