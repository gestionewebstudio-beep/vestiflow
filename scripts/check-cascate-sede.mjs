#!/usr/bin/env node
/**
 * check:cascate-sede — l'elenco delle relazioni verso `Location` che non
 * bloccano la cancellazione deve restare allineato allo schema.
 *
 * ⛔ **Il difetto che questa guardia impedisce e' un elenco che invecchia.**
 *    `canDeleteLocation` decide se una sede si puo' cancellare, e per deciderlo
 *    deve sapere che cosa la sede si porterebbe via. Se domani qualcuno aggiunge
 *    un modello con una FK verso `Location` in `onDelete: Cascade`, quella
 *    entita' comincia a sparire in silenzio — e nulla, in nessun test, fallisce.
 *
 * ⚠️ **E' esattamente cosi' che il difetto e' esistito.** L'elenco controllato
 *    erano quattro entita' di inventario; le quattro `Cascade` non c'erano mai
 *    state. Nessuno le aveva tolte: non erano mai state aggiunte, e nessuno se
 *    n'era accorto perche' l'allineamento non era verificato da niente.
 *
 * ⭐ **Che cosa controlla, esattamente.** Legge `schema.prisma`, trova OGNI
 *    relazione verso `Location`, e ne classifica l'azione:
 *
 *      Cascade / SetNull   non blocca  ⇒  DEVE stare nell'elenco
 *      Restrict            blocca      ⇒  NON deve starci
 *
 *    Poi confronta con `RIFERIMENTI_SEDE_NON_PROTETTIVI`. Fallisce se manca una
 *    voce (protezione incompleta) o se ce n'e' una di troppo (l'elenco descrive
 *    qualcosa che non esiste piu').
 *
 * ⚠️ **L'azione NON dichiarata non e' un caso da ignorare**: il default di
 *    Prisma dipende dall'opzionalita' della relazione — `Restrict` se
 *    obbligatoria, `SetNull` se opzionale. Quindici delle ventuno relazioni
 *    verso `Location` non dichiarano nulla, e cinque di quelle sono `SetNull`
 *    silenziose. Una guardia che leggesse solo `onDelete: Cascade` ne
 *    perderebbe sette su undici.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const SCHEMA = path.join('api', 'prisma', 'schema.prisma');
const ELENCO = path.join('api', 'src', 'shopify', 'location-delete-safety.util.ts');

function muori(titolo, righe) {
  console.error(`\n${ROSSO}${GRASSETTO}⛔ check:cascate-sede — ${titolo}${FINE}\n`);
  for (const r of righe) console.error(`   ${r}`);
  console.error('');
  process.exit(1);
}

if (!fs.existsSync(SCHEMA) || !fs.existsSync(ELENCO)) {
  muori('file mancanti', [`schema: ${SCHEMA}`, `elenco: ${ELENCO}`]);
}

// ── 1 · Le relazioni verso Location, dallo SCHEMA ──────────────────────────
const righeSchema = fs.readFileSync(SCHEMA, 'utf8').split(/\r?\n/);
const dalloSchema = [];
let modello = null;

for (let i = 0; i < righeSchema.length; i += 1) {
  const riga = righeSchema[i];
  const apre = /^model\s+(\w+)\s*\{/.exec(riga);
  if (apre) {
    modello = apre[1];
    continue;
  }
  if (/^\}/.test(riga)) {
    modello = null;
    continue;
  }
  if (!modello || !/\bLocation\b/.test(riga) || !/@relation\(/.test(riga)) continue;

  // La dichiarazione puo' proseguire su piu' righe.
  let testo = riga;
  let j = i;
  while (!testo.slice(testo.indexOf('@relation')).includes(')') && j < righeSchema.length - 1) {
    j += 1;
    testo += ` ${righeSchema[j].trim()}`;
  }

  const campo = /fields:\s*\[(\w+)\]/.exec(testo);
  const azione = /onDelete:\s*(\w+)/.exec(testo);
  const opzionale = /Location\?/.test(testo);

  // Default Prisma quando l'azione non e' dichiarata.
  const effettiva = azione ? azione[1] : opzionale ? 'SetNull' : 'Restrict';

  dalloSchema.push({
    modello: modello.charAt(0).toLowerCase() + modello.slice(1),
    campo: campo ? campo[1] : '(sconosciuto)',
    azione: effettiva,
    dichiarata: Boolean(azione),
    riga: i + 1,
  });
}

const nonProtettiveSchema = dalloSchema.filter(
  (r) => r.azione === 'Cascade' || r.azione === 'SetNull',
);

// ── 2 · L'elenco dichiarato nel CODICE ─────────────────────────────────────
const testoElenco = fs.readFileSync(ELENCO, 'utf8');
const blocco = /RIFERIMENTI_SEDE_NON_PROTETTIVI[^=]*=\s*\[([\s\S]*?)\n\];/.exec(testoElenco);
if (!blocco) {
  muori('elenco non leggibile', [
    `${ELENCO} non espone piu` + `' RIFERIMENTI_SEDE_NON_PROTETTIVI in forma verificabile.`,
  ]);
}

const dalCodice = [];
const voce = /modello:\s*'(\w+)',\s*campo:\s*'(\w+)'/g;
let trovata;
while ((trovata = voce.exec(blocco[1])) !== null) {
  dalCodice.push({ modello: trovata[1], campo: trovata[2] });
}

// ── 3 · Il confronto ───────────────────────────────────────────────────────
const chiave = (r) => `${r.modello}.${r.campo}`;
const insiemeCodice = new Set(dalCodice.map(chiave));
const insiemeSchema = new Set(nonProtettiveSchema.map(chiave));

const mancanti = nonProtettiveSchema.filter((r) => !insiemeCodice.has(chiave(r)));
const inPiu = dalCodice.filter((r) => !insiemeSchema.has(chiave(r)));

if (mancanti.length > 0) {
  muori('una relazione verso Location non e` protetta', [
    ...mancanti.map(
      (r) =>
        `${chiave(r)} — onDelete: ${r.azione}${r.dichiarata ? '' : ' (default Prisma, non dichiarata)'} — schema riga ${r.riga}`,
    ),
    '',
    'Cancellare una sede porterebbe via questa entita` (o il suo riferimento)',
    'senza che `canDeleteLocation` se ne accorga. Aggiungila a',
    `${ELENCO}, in RIFERIMENTI_SEDE_NON_PROTETTIVI.`,
  ]);
}

if (inPiu.length > 0) {
  muori('l`elenco descrive relazioni che non esistono piu`', [
    ...inPiu.map((r) => chiave(r)),
    '',
    'Una voce di troppo non e` innocua: fa contare un modello che il client',
    'Prisma potrebbe non esporre piu`, e la verifica fallirebbe a runtime.',
  ]);
}

console.log(
  `✅ check:cascate-sede — ${dalloSchema.length} relazioni verso Location: ` +
    `${nonProtettiveSchema.length} non bloccano la cancellazione e sono tutte dichiarate ` +
    `(${dalloSchema.length - nonProtettiveSchema.length} sono Restrict e si difendono da sole).`,
);
