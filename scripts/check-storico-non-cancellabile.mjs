#!/usr/bin/env node
/**
 * check:storico-non-cancellabile — la storia dei collegamenti Shopify non si
 * cancella, e il permesso di spegnere quella protezione resta nei test.
 *
 * ⛔ **Il contratto**: `shopify_product_identities`, `shopify_variant_identities`
 * e i loro periodi, piu' `shopify_location_links`, hanno trigger `BEFORE DELETE`
 * e `BEFORE TRUNCATE` che rifiutano. Senza, un GID cancellato torna
 * riassegnabile a un altro articolo — misurato il 07/09/2026: cancellato il
 * periodo, poi l'identita', lo stesso `gid://shopify/Product/900002` rinasceva
 * su un altro prodotto.
 *
 * ⭐ **Ma le fixture di integrazione devono poter pulire**, e per farlo spengono
 * i trigger uno per uno (`conStoricoSbloccato` in `api/src/test/integration/
 * fixture.ts`), dentro una transazione sola sul solo database di prova.
 *
 * ⛔ **Questa guardia NON e' una barriera di privilegi**, e presentarla come
 * tale sarebbe peggio di non averla. Qui c'era scritto che il DDL «richiede
 * l'ownership e nessun endpoint lo emette, quindi non e' un percorso
 * applicativo»: e' falso — l'API si connette proprio come OWNER del database
 * (la stessa scelta per cui scavalca la RLS), quindi da un servizio quel DDL
 * riuscirebbe. Cio' che manca e' il codice che lo scriva, non il permesso.
 *
 * ⚠️ **Perche' una guardia e non un test**: un test prova che oggi l'app non
 * spegne niente. Questa fa fallire la build il giorno in cui qualcuno lo scrive
 * in un servizio — che e' il momento in cui la decisione va ridiscussa invece
 * che presa per inerzia. Ferma chi lo scrive, non chi lo esegue. E' la stessa
 * forma di `check:cassa-append-only`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROSSO = '[31m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const RADICE_API = 'api/src';
/** L'unico posto in cui spegnere le protezioni e' ammesso. */
const AMMESSO = join('api', 'src', 'test') + sep;

/** Le tabelle il cui storico non si cancella. Devono avere i due trigger. */
const PROTETTE = [
  'shopify_product_identities',
  'shopify_variant_identities',
  'shopify_product_links',
  'shopify_variant_links',
  'shopify_location_links',
];

const MIGRATION = 'api/prisma/migrations/20260907000000_shopify_link_history/migration.sql';

function* fileTypeScript(cartella) {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === 'node_modules' || voce === 'dist') continue;
      yield* fileTypeScript(percorso);
      continue;
    }
    if (percorso.endsWith('.ts')) yield percorso;
  }
}

const problemi = [];

// ── 1 · Nessuno spegne i trigger fuori dai test ────────────────────────────
for (const percorso of fileTypeScript(RADICE_API)) {
  const relativo = relative('.', percorso);
  if (relativo.startsWith(AMMESSO)) continue;
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  righe.forEach((riga, indice) => {
    if (/DISABLE\s+TRIGGER/i.test(riga) || /ALTER\s+TABLE[^;]*DISABLE/i.test(riga)) {
      problemi.push({
        tipo: 'spegnimento fuori dai test',
        dove: `${relativo}:${indice + 1}`,
        testo: riga.trim().slice(0, 90),
      });
    }
  });
}

// ── 2 · I trigger esistono davvero nella migration ─────────────────────────
let sql = '';
try {
  sql = readFileSync(MIGRATION, 'utf8');
} catch {
  problemi.push({ tipo: 'migration non leggibile', dove: MIGRATION, testo: '' });
}

for (const tabella of PROTETTE) {
  for (const evento of ['DELETE', 'TRUNCATE']) {
    const atteso = new RegExp(
      `BEFORE ${evento} ON "${tabella}"`.replace(/[.*+?^${}()|[\]\\]/g, (c) =>
        c === '"' ? c : `\\${c}`,
      ),
      'i',
    );
    if (!atteso.test(sql)) {
      problemi.push({
        tipo: `manca il trigger BEFORE ${evento}`,
        dove: tabella,
        testo: 'la storia di questa tabella sarebbe cancellabile',
      });
    }
  }
}

// ── 3 · La coppia di sede NON deve averli: e` la correzione iniziale ───────
if (/BEFORE (DELETE|TRUNCATE) ON "shopify_location_pairs"/i.test(sql)) {
  problemi.push({
    tipo: 'protezione di troppo',
    dove: 'shopify_location_pairs',
    testo:
      'una coppia SENZA periodi deve restare cancellabile: e` la correzione ' +
      'dell`abbinamento iniziale errato (docs/24 §1.13.6)',
  });
}

if (problemi.length > 0) {
  console.error(
    `\n${ROSSO}${GRASSETTO}⛔ check:storico-non-cancellabile — ${problemi.length} problema/i${FINE}\n`,
  );
  for (const p of problemi) {
    console.error(`   ${GRASSETTO}${p.tipo}${FINE}`);
    console.error(`     ${p.dove}`);
    if (p.testo) console.error(`     ${p.testo}`);
    console.error('');
  }
  console.error(
    '   La storia dei collegamenti remoti non si cancella: un GID cancellato\n' +
      '   tornerebbe riassegnabile a un altro articolo. Spegnere i trigger e`\n' +
      "   ammesso soltanto nelle fixture di integrazione, sotto 'api/src/test/'.\n",
  );
  process.exit(1);
}

console.log(
  `${VERDE}✅ check:storico-non-cancellabile — ${PROTETTE.length} tabelle protette da DELETE e TRUNCATE, ` +
    `nessuno spegnimento fuori dai test, la coppia di sede resta correggibile.${FINE}`,
);
