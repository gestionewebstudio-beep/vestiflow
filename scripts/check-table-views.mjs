#!/usr/bin/env node
/**
 * Viste tabella: la lista del frontend e quella dell'API devono coincidere.
 *
 * Il `viewId` non e' un enum a database, e' una stringa: l'unico controllo e'
 * la lista bianca lato server. Quando il frontend introduce una vista e
 * nessuno aggiorna quella lista, il backend risponde 400 sia alla lettura sia
 * al salvataggio — e il difetto non si vede, perche' il frontend ingoia
 * l'errore e mostra le colonne di default. L'operatore riordina le colonne,
 * ricarica, e le ritrova come prima senza sapere perche'.
 *
 * E' successo: dodici viste su ventitre (preventivi, proforma, DDT, scarico
 * manuale, fatture, vendite al banco, ordini) non salvavano nulla.
 */
import { readFileSync } from 'node:fs';

const FE = 'src/app/shared/table-columns/table-column.model.ts';
const API = 'api/src/user-preferences/table-view.constants.ts';

/** Gli id nel blocco che inizia con `marker` e finisce alla prima `] as const` / `} as const`. */
function idsIn(file, marker) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(marker);
  if (start === -1) {
    console.error(`✖ ${file}: non trovo \`${marker}\`. Il controllo va aggiornato.`);
    process.exit(1);
  }
  const end = text.indexOf('as const', start);
  const block = text.slice(start, end);
  return new Set([...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

const frontend = idsIn(FE, 'export const TableViewId = {');
const api = idsIn(API, 'export const TABLE_VIEW_IDS = [');

const missingInApi = [...frontend].filter((id) => !api.has(id));
const missingInFrontend = [...api].filter((id) => !frontend.has(id));

if (missingInApi.length > 0 || missingInFrontend.length > 0) {
  console.error('\n✖ viste tabella disallineate fra frontend e API:\n');
  for (const id of missingInApi) {
    console.error(`  ${id} — manca in ${API}: l'API risponde 400 e la preferenza non si salva`);
  }
  for (const id of missingInFrontend) {
    console.error(`  ${id} — manca in ${FE}: nessuno la usa piu', va tolta anche dall'API`);
  }
  console.error('');
  process.exit(1);
}

console.log(`✓ viste tabella: ${frontend.size} id, frontend e API allineati.`);
