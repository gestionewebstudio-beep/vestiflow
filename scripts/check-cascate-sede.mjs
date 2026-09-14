#!/usr/bin/env node
/**
 * check:cascate-sede — l'elenco dei riferimenti verso `Location` deve restare
 * allineato allo schema, e deve essere COMPLETO.
 *
 * ⛔ **Il difetto che questa guardia impedisce e' un elenco parziale.**
 *    `canDeleteLocation` decide se una sede si puo' cancellare, e per deciderlo
 *    deve sapere che cosa la sede si porterebbe via. Se una relazione manca,
 *    quel dato sparisce in silenzio — oppure il database rifiuta il DELETE e la
 *    sincronizzazione esplode a meta' lavoro.
 *
 * ⚠️ **E' successo TRE volte, con tre elenchi diversi:**
 *
 *      4 su 21   l'originale: giacenze, movimenti, ordini fornitore, conteggi
 *     11 su 21   la prima correzione: aggiunte Cascade e SetNull, escluse le
 *                Restrict con l'argomento «si difendono da sole»
 *     21 su 21   dopo il collaudo contro PostgreSQL vero del 07/09/2026
 *
 * ⭐ **Per questo la guardia non guarda piu' l'AZIONE.** Guardava solo
 *    `Cascade` e `SetNull`, e cosi' facendo APPROVAVA l'elenco da 11: le sei
 *    `Restrict` mancanti non le cercava. Ora pretende che ogni relazione verso
 *    `Location` sia dichiarata, qualunque cosa faccia il database.
 *
 * ⚠️ **E c'e' una ragione in piu', misurata:** lo schema Prisma e il database
 *    DIVERGONO sull'azione. `SalesOrder.locationId` e
 *    `SupplierOrder.destinationLocationId` sono opzionali in Prisma — quindi
 *    `SetNull` per default — e `RESTRICT` nel database vero. Una guardia che
 *    decidesse in base all'azione dedotta dallo schema deciderebbe sul dato
 *    sbagliato.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

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

  // ⚠️ Anche le FK COMPOSITE, che qui sono la forma normale: l'isolamento per
  //    tenant si impone con `fields: [locationId, tenantId]`, e leggendo solo
  //    le chiavi a un campo la guardia le segnalava come «(sconosciuto)» —
  //    cioe' faceva fallire il lint su una relazione dichiarata correttamente.
  //    Il campo che conta e' il PRIMO: e' quello che punta a `locations`.
  const campo = /fields:\s*\[(\w+)(?:\s*,\s*\w+)*\]/.exec(testo);
  const azione = /onDelete:\s*(\w+)/.exec(testo);
  const opzionale = /Location\?/.test(testo);

  dalloSchema.push({
    modello: modello.charAt(0).toLowerCase() + modello.slice(1),
    campo: campo ? campo[1] : '(sconosciuto)',
    // Solo informativa: il database puo' divergere, e diverge.
    azione: azione ? azione[1] : opzionale ? 'SetNull (default)' : 'Restrict (default)',
    riga: i + 1,
  });
}

if (dalloSchema.length === 0) {
  muori('nessuna relazione verso Location trovata nello schema', [
    'La lettura dello schema non ha prodotto niente: o il formato e` cambiato,',
    'o il percorso non e` piu` quello. Una guardia che non trova niente',
    'approverebbe qualunque elenco.',
  ]);
}

// ── 2 · L'elenco dichiarato nel CODICE ─────────────────────────────────────
const testoElenco = fs.readFileSync(ELENCO, 'utf8');
const blocco = /RIFERIMENTI_SEDE[^=]*=\s*\[([\s\S]*?)\n\];/.exec(testoElenco);
if (!blocco) {
  muori('elenco non leggibile', [
    `${ELENCO} non espone piu` + `' RIFERIMENTI_SEDE in forma verificabile.`,
  ]);
}

const dalCodice = [];
const voce = /modello:\s*'(\w+)',\s*campo:\s*'(\w+)'/g;
let trovata;
while ((trovata = voce.exec(blocco[1])) !== null) {
  dalCodice.push({ modello: trovata[1], campo: trovata[2] });
}

// ── 3 · Il confronto: COMPLETO, non selettivo ──────────────────────────────
const chiave = (r) => `${r.modello}.${r.campo}`;
const insiemeCodice = new Set(dalCodice.map(chiave));
const insiemeSchema = new Set(dalloSchema.map(chiave));

const mancanti = dalloSchema.filter((r) => !insiemeCodice.has(chiave(r)));
const inPiu = dalCodice.filter((r) => !insiemeSchema.has(chiave(r)));

if (mancanti.length > 0) {
  muori('una relazione verso Location non e` dichiarata', [
    ...mancanti.map((r) => `${chiave(r)} — onDelete: ${r.azione} — schema riga ${r.riga}`),
    '',
    'Ogni riferimento va dichiarato, qualunque cosa faccia il database:',
    'una Cascade porta via il dato, una SetNull lo scollega, e una Restrict',
    'fa esplodere la sincronizzazione con un errore di chiave esterna.',
    '',
    `Aggiungila a ${ELENCO}, in RIFERIMENTI_SEDE.`,
  ]);
}

if (inPiu.length > 0) {
  muori('l`elenco descrive relazioni che non esistono piu`', [
    ...inPiu.map(chiave),
    '',
    'Una voce di troppo non e` innocua: fa contare un modello che il client',
    'Prisma potrebbe non esporre piu`, e la verifica fallirebbe a runtime.',
  ]);
}

console.log(
  `✅ check:cascate-sede — ${dalloSchema.length} relazioni verso Location, ` +
    `tutte dichiarate in RIFERIMENTI_SEDE.`,
);
