#!/usr/bin/env node
/**
 * **Una colonna `range` o `date` senza estrattore mostra i campi e non filtra.**
 *
 * ⛔ **Il difetto è muto, e l'ho prodotto io.** Su Arrivi merce la colonna
 * «Righe» (`lineCount`) mostrava i due campi da–a e non restringeva niente:
 * `applicaFiltriDiColonna` senza `numeroDi` per quella colonna **lascia passare
 * tutto**, di proposito — meglio non restringere che restringere per un
 * confronto che non si sa fare. Il risultato a schermo è un comando che finge.
 *
 * Trovato dal proprietario il 01/09/2026: «i filtri non funzionano». Gli
 * estrattori li avevo scritti a memoria invece di enumerare le colonne.
 *
 * ## Come decide
 *
 * 1. legge il **catalogo colonne**: `numeric` e `filter` per id;
 * 2. legge i **modelli colonne** degli elenchi, dove `colonna('x', …)` eredita
 *    dal catalogo e un `filter:` locale lo scavalca;
 * 3. per ogni componente che chiama `createColumnFilters`, controlla che gli id
 *    `range` e `date` **che quel componente nomina** siano coperti dal rispettivo
 *    estrattore.
 *
 * ⚠️ **«Che nomina» è il legame**: un componente rende una colonna solo se la
 * cita — nel suo `cellText`, nei totali o in un template di cella. È un criterio
 * largo, quindi può chiedere un estrattore di troppo: ogni segnalazione è una
 * domanda vera, e coprire una colonna che non si rende non fa danno.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function file(dir, filtro, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) file(p, filtro, acc);
    else if (filtro(voce)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

const leggi = (p) => readFileSync(p, 'utf8');

/** Catalogo: id → { numeric, filter }. */
function catalogo() {
  const sorgente = leggi('src/app/shared/table-columns/column-catalog.ts');
  const corpo = sorgente.slice(
    sorgente.indexOf('export const CATALOGO_COLONNE'),
    sorgente.indexOf('} as const satisfies'),
  );
  const voci = new Map();
  for (const m of corpo.matchAll(/^\s{2}([a-zA-Z]\w*):\s*\{([^}]*)\}/gm)) {
    voci.set(m[1], {
      numeric: /numeric:\s*true/.test(m[2]),
      filter: m[2].match(/filter:\s*'(\w+)'/)?.[1] ?? null,
    });
  }
  return voci;
}

/**
 * La forma di filtro effettiva, con la stessa deduzione di
 * `resolveColumnFilterKind`: `filter` dichiarato vince, poi `numeric` → range,
 * poi `display` → text, altrimenti values.
 */
function forma({ filter, numeric, display }) {
  if (filter === 'false') return null;
  if (filter) return filter;
  if (numeric) return 'range';
  // ⚠️  NON decide più la forma (01/09/2026): il controllo è uno solo,
  //    e la presentazione non sceglie come si filtra.
  return 'values';
}

/** id → forma richiesta, letta da tutti i modelli colonne degli ELENCHI. */
function colonneDegliElenchi(cat) {
  const richieste = new Map();
  const ricorda = (id, kind) => {
    if (kind === 'range' || kind === 'date') richieste.set(id, kind);
  };

  for (const config of file(
    'src/app/features',
    (n) => n.includes('columns') && n.endsWith('.config.ts') && !n.includes('line-columns'),
  )) {
    const sorgente = leggi(config);

    // `colonna('id', { … })` — eredita dal catalogo, il `filter` locale scavalca.
    for (const m of sorgente.matchAll(/colonna\('(\w+)'(?:,\s*\{([^}]*)\})?\)/g)) {
      const voce = cat.get(m[1]) ?? {};
      const opts = m[2] ?? '';
      ricorda(
        m[1],
        forma({
          filter: opts.match(/filter:\s*'?(\w+)'?/)?.[1] ?? voce.filter,
          numeric: voce.numeric || /numeric:\s*true/.test(opts),
          display: /display:\s*'/.test(opts),
        }),
      );
    }

    // Definizioni scritte a mano: `{ id: 'x', … }`.
    for (const m of sorgente.matchAll(/\{\s*id:\s*'(\w+)'([^}]*)\}/g)) {
      const corpo = m[2];
      ricorda(
        m[1],
        forma({
          filter: corpo.match(/filter:\s*'?(\w+)'?/)?.[1] ?? null,
          numeric: /numeric:\s*true/.test(corpo),
          display: /display:\s*'/.test(corpo),
        }),
      );
    }
  }
  return richieste;
}

/** Il corpo di una chiave dell'oggetto passato a `createColumnFilters`. */
/**
 * ⭐ **L'estrattore può essere un METODO, e la guardia lo segue** — aggiunto il
 * 01/09/2026, quando `numeroDi` è diventato una funzione condivisa fra il filtro
 * e l'ordinamento delle colonne.
 *
 * ⛔ **Senza, la guardia gridava al lupo su codice giusto**: `numeroDi: (row,
 * columnId) => this.numeroDiColonna(row, columnId)` non contiene nessun `case`,
 * quindi cinque colonne di Giacenze risultavano scoperte mentre l'estrattore
 * c'era, venti righe più sotto. Una guardia che accusa il refactoring corretto
 * è una guardia che si impara ad aggirare.
 */
function seguiRimando(sorgente, corpo) {
  const rimando = /this\.(\w+)\s*\(/.exec(corpo);
  if (!rimando) return corpo;
  const metodo = sorgente.indexOf(`${rimando[1]}(`, sorgente.indexOf('class '));
  if (metodo < 0) return corpo;
  // Dal nome del metodo alla sua chiusura: basta il testo, non serve un parser.
  const apertura = sorgente.indexOf('{', metodo);
  if (apertura < 0) return corpo;
  let profondita = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') profondita += 1;
    else if (sorgente[i] === '}') {
      profondita -= 1;
      if (profondita === 0) return corpo + sorgente.slice(apertura, i);
    }
  }
  return corpo;
}

function corpoChiave(sorgente, chiave) {
  const inizio = sorgente.indexOf(`${chiave}:`);
  if (inizio < 0) return '';
  let profondita = 0;
  for (let i = inizio; i < sorgente.length; i += 1) {
    const c = sorgente[i];
    if (c === '(' || c === '{' || c === '[') profondita += 1;
    else if (c === ')' || c === '}' || c === ']') {
      profondita -= 1;
      if (profondita < 0) return sorgente.slice(inizio, i);
    } else if (c === ',' && profondita === 0) {
      return sorgente.slice(inizio, i);
    }
  }
  return sorgente.slice(inizio);
}

const cat = catalogo();
const richieste = colonneDegliElenchi(cat);

let difetti = 0;
let controllati = 0;

for (const ts of file('src/app', (n) => n.endsWith('.component.ts'))) {
  const sorgente = leggi(ts);
  const chiamata = sorgente.indexOf('createColumnFilters({');
  if (chiamata < 0) continue;

  controllati += 1;
  const blocco = sorgente.slice(chiamata);
  const coperte = {
    range: seguiRimando(sorgente, corpoChiave(blocco, 'numeroDi')),
    date: seguiRimando(sorgente, corpoChiave(blocco, 'dataDi')),
  };

  for (const [id, kind] of richieste) {
    // Il componente rende questa colonna? La nomina da qualche parte.
    if (!new RegExp(`'${id}'`).test(sorgente)) continue;
    if (new RegExp(`'${id}'`).test(coperte[kind])) continue;

    const estrattore = kind === 'range' ? 'numeroDi' : 'dataDi';
    console.error(
      `⛔ ${ts}\n   rende «${id}» (filtro ${kind}) ma non la copre in \`${estrattore}\`: i campi compaiono e non restringono niente.`,
    );
    difetti += 1;
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} colonne con un filtro che finge di funzionare.`);
  process.exit(1);
}

console.log(
  `check:estrattori-filtro — ${controllati} elenchi filtrano, e ogni colonna a intervallo ha il suo estrattore.`,
);
