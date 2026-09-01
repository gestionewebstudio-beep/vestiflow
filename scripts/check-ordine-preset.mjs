#!/usr/bin/env node
/**
 * ⭐ **UN PRESET DICE CHI SI VEDE, NON IN CHE ORDINE** — l'ordine a schermo lo
 * detta `resolveVisibleColumns`, che segue le DEFINIZIONI (`*_COLUMN_DEFS`).
 *
 * Questa guardia prende il difetto MUTO che ne discende:
 *
 * ```text
 * ['code', 'vatNumbr', 'name']
 *                ↑ non esiste fra le definizioni
 * ```
 *
 * ⛔ **Per TypeScript è un array di stringhe valido**, quindi non c'è errore.
 * A schermo si vede solo che una colonna attesa non c'è — e chi guarda pensa a
 * una preferenza salvata, non a un refuso. Nessun test lo prende.
 *
 * ⚠️ **L'ORDINE dei preset non è verificato**, ed è una rinuncia dichiarata:
 * oggi non cambia niente a schermo, e nove preset già scritti lo hanno diverso.
 * Trasformarlo in errore avrebbe significato riscrivere elenchi che nessuno ha
 * chiesto di toccare.
 *
 * ⛔ **E non tutte le configurazioni sono verificabili**: dove le definizioni
 * nascono da un aiuto (`conColonneCondivise([…])`) o da uno `...spread` di
 * un'altra lista, gli id non stanno nel testo. Quelle si SALTANO, e il conto
 * dei saltati si stampa: una guardia che tacesse su ciò che non ha guardato
 * direbbe «tutto a posto» di un file che non ha aperto.
 */
import { readFileSync, globSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = globSync('src/app/**/*columns*.config.ts').filter((f) =>
  /_COLUMN_DEFS/.test(readFileSync(f, 'utf8')),
);

if (file.length === 0) {
  console.error('⛔ nessuna configurazione di colonne trovata: la guardia sarebbe cieca.');
  process.exit(1);
}

/**
 * Le coppie definizioni/preset di un file. Un file può averne più d'una — gli
 * elenchi documenti ne hanno sette — e ognuna va letta con la propria.
 */
function coppie(testo) {
  /*
    ⚠️ **Il blocco finisce alla PARENTESI in colonna zero, non alla prima riga
    vuota.** Fermandosi alla riga vuota, la prima stesura leggeva metà array —
    e accusava `sellingPrice` e `status` dei prodotti di non esistere, mentre
    stanno alla riga 69. Una guardia che sbaglia di suo si spegne.
  */
  const defs = [
    // `];` · `]);` · `] as const;` — tre code diverse per lo stesso blocco.
    ...testo.matchAll(/export const (\w+)_COLUMN_DEFS[^=]*=\s*([\s\S]*?)\n\][^;\n]*;/g),
  ];
  /*
    ⚠️ **Solo i preset scritti come OGGETTO letterale**, e la graffa iniziale è
    ciò che lo impone. Senza, `presetsWithoutColumn(…)` — che non è un oggetto —
    faceva match fino alla graffa del blocco SUCCESSIVO, e la guardia accusava
    il preventivo di colonne che stavano nella fattura d'acquisto.
  */
  const presets = new Map(
    [...testo.matchAll(/export const (\w+)_COLUMN_PRESETS[^=]*=\s*\{([\s\S]*?)\n\};/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  return defs
    .filter((m) => presets.has(m[1]))
    .map((m) => ({ nome: m[1], defs: m[2], presets: presets.get(m[1]) }));
}

/**
 * Dove vive un nome importato. `@shared/x` → `src/app/shared/x.ts`; un percorso
 * relativo si risolve sulla cartella del file che importa.
 */
function fileDelNome(nome, testo, percorso) {
  for (const m of testo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const nomi = m[1].split(',').map((n) => n.trim().replace(/^type\s+/, ''));
    if (!nomi.includes(nome)) continue;
    const da = m[2];
    const base = da.startsWith('@')
      ? join('src/app', da.replace(/^@/, '').replace(/^(\w+)\//, '$1/'))
      : join(dirname(percorso), da);
    for (const candidato of [`${base}.ts`, join(base, 'index.ts')]) {
      try {
        return { testo: readFileSync(candidato, 'utf8'), percorso: candidato };
      } catch {
        /* il prossimo */
      }
    }
    return null;
  }
  return null;
}

/** Gli id contenuti in una porzione di sorgente, seguendo i nomi che rimanda. */
function raccogliId(sorgente, testo, percorso, visti = new Set()) {
  const ids = [];
  // `id: 'x'` e ogni aiuto del catalogo — `colonna('x')`, `colonnaRuoloGemello('x')`.
  for (const m of sorgente.matchAll(/\bid: '([\w-]+)'|\bcolonna\w*\('([\w-]+)'/g)) {
    ids.push(m[1] ?? m[2]);
  }
  /*
    ⭐ **Gli spread e i nomi in maiuscolo si SEGUONO**, non si saltano: dal
    01/09/2026 le anagrafiche compongono le proprie colonne dai segmenti
    condivisi di `anagrafica-columns`, e una guardia che si arrendesse davanti a
    `...COLONNE_SOGGETTO_INDIRIZZO` diventerebbe cieca proprio sui due elenchi
    per cui è stata scritta.
  */
  for (const m of sorgente.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) {
    const nome = m[1];
    if (visti.has(nome)) continue;
    visti.add(nome);
    const dove = fileDelNome(nome, testo, percorso) ?? { testo, percorso };
    const decl = new RegExp(`export const ${nome}[^=]*=\\s*([\\s\\S]*?)\\n(?:\\]|\\})[^;\\n]*;`).exec(
      dove.testo,
    );
    const inLinea = new RegExp(`export const ${nome}[^=]*=\\s*(\\{[^;]*\\});`).exec(dove.testo);
    const corpo = decl?.[1] ?? inLinea?.[1];
    if (corpo) {
      ids.push(...raccogliId(corpo, dove.testo, dove.percorso, visti));
    }
  }
  return ids;
}

/** Gli id dichiarati, o `null` se il testo non permette di saperli tutti. */
function idDefiniti(sorgente, testo, percorso) {
  // Un aiuto che avvolge l'array (`conColonneCondivise([…])`) aggiunge colonne
  // che qui non compaiono: indovinare produrrebbe accuse false.
  if (/\w+\(\s*\[/.test(sorgente)) return null;
  const ids = raccogliId(sorgente, testo, percorso);
  return ids.length > 0 ? ids : null;
}

const problemi = [];
let verificati = 0;
const saltati = [];

for (const percorso of file) {
  const testo = readFileSync(percorso, 'utf8');
  for (const coppia of coppie(testo)) {
    const definiti = idDefiniti(coppia.defs, testo, percorso);
    if (definiti === null) {
      saltati.push(`${percorso} · ${coppia.nome}`);
      continue;
    }
    const noti = new Set(definiti);

    for (const m of coppia.presets.matchAll(/PresetId\.(\w+)\]:\s*\[([^\]]*)\]/g)) {
      verificati += 1;
      const ids = [...m[2].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
      const ignoti = ids.filter((id) => !noti.has(id));
      if (ignoti.length > 0) {
        problemi.push(
          `⛔ ${percorso} · ${coppia.nome} preset ${m[1]}: ` +
            `${ignoti.map((i) => `'${i}'`).join(', ')} non esiste fra le definizioni.\n` +
            `   Quella colonna non comparirà, e nulla lo dirà.`,
        );
      }
    }
  }
}

if (verificati === 0) {
  console.error('⛔ nessun preset verificato: la guardia non guarderebbe niente.');
  process.exit(1);
}

if (problemi.length > 0) {
  console.error(problemi.join('\n\n'));
  process.exit(1);
}

const coda = saltati.length > 0 ? ` · ${saltati.length} non verificabili (definizioni composte)` : '';
console.log(`✅ ordine preset: ${verificati} preset con id esistenti${coda}.`);
