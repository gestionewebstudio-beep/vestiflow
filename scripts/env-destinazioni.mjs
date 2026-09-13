#!/usr/bin/env node
/**
 * **Le DESTINAZIONI di un file di ambiente, senza segreti.**
 *
 *   node scripts/env-destinazioni.mjs                 → api/.env
 *   node scripts/env-destinazioni.mjs api/.env.collaudo
 *
 * ⭐ Serve a dire dove un'istanza dell'API scriverebbe e chi ascolterebbe —
 *    database, Supabase, Shopify, frontend — PRIMA di avviarla: le destinazioni
 *    si misurano dal file, non si deducono dal nome della variabile.
 *
 * ⛔ **Qui non c'è una lista di parole da oscurare.** Il 12/09/2026 uno strumento
 *    usa-e-getta oscurava per nome (`SECRET|KEY|TOKEN|PASSWORD|PASS\b`) e ha
 *    stampato in chiaro `BACKUP_ENCRYPTION_PASSPHRASE`: «PASSPHRASE» non era
 *    nella lista. Una lista di negazioni è completa solo finché nessuno
 *    aggiunge una variabile. Qui vale il contrario: **si mostra solo ciò che è
 *    dichiarato mostrabile**, con la sua forma; ogni altra chiave esce come
 *    nome e lunghezza, mai come valore. Una variabile nuova nasce nascosta.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente, repoRoot } from './backup/load-env.mjs';

/**
 * Le chiavi mostrabili, con COME si mostrano:
 * - `url`       → protocollo, host, porta, percorso; MAI utente, password, query
 * - `testo`     → il valore com'è (non è un segreto: ambiti, versioni, indirizzi pubblici)
 * - `elenco`    → il valore diviso sulle virgole
 */
export const MOSTRABILI = Object.freeze({
  DATABASE_URL: 'url',
  DIRECT_URL: 'url',
  DATABASE_URL_TEST: 'url',
  DIRECT_URL_TEST: 'url',
  DATABASE_URL_COLLAUDO: 'url',
  DIRECT_URL_COLLAUDO: 'url',
  BACKUP_DATABASE_URL: 'url',
  SUPABASE_URL: 'url',
  SHOPIFY_APP_URL: 'url',
  FRONTEND_URL: 'url',
  CORS_ORIGINS: 'elenco',
  SHOPIFY_API_VERSION: 'testo',
  SHOPIFY_SCOPES: 'elenco',
  PORT: 'testo',
  SUPABASE_PRODUCT_MEDIA_BUCKET: 'testo',
  SUPABASE_USER_AVATARS_BUCKET: 'testo',
  SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET: 'testo',
  SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET: 'testo',
});

/** Solo la destinazione di una URL: niente credenziali, niente query. */
export function destinazioneDiUrl(valore) {
  if (!valore) {
    return '(vuota)';
  }
  try {
    const u = new URL(valore);
    const porta = u.port ? `:${u.port}` : '';
    const percorso = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return `${u.protocol}//${u.hostname}${porta}${percorso}`;
  } catch {
    return `(non è una URL: ${valore.length} caratteri, non mostrata)`;
  }
}

/**
 * Le righe da stampare per un insieme di variabili. Pura: si prova senza file.
 * @param {Record<string, string>} valori
 * @returns {Array<{ chiave: string, mostrata: boolean, testo: string }>}
 */
export function righeDestinazioni(valori) {
  return Object.entries(valori).map(([chiave, valore]) => {
    const forma = MOSTRABILI[chiave];
    if (!forma) {
      return {
        chiave,
        mostrata: false,
        testo: valore ? `(non mostrata, ${valore.length} caratteri)` : '(vuota)',
      };
    }
    if (forma === 'url') {
      return { chiave, mostrata: true, testo: destinazioneDiUrl(valore) };
    }
    if (forma === 'elenco') {
      return {
        chiave,
        mostrata: true,
        testo: valore
          ? valore
              .split(',')
              .map((v) => v.trim())
              .join(' · ')
          : '(vuota)',
      };
    }
    return { chiave, mostrata: true, testo: valore || '(vuota)' };
  });
}

function stampa(percorsoFile) {
  const valori = leggiFileAmbiente(percorsoFile);
  const righe = righeDestinazioni(valori);
  console.log(`Destinazioni di ${percorsoFile}\n`);
  for (const r of righe) {
    console.log(`${r.chiave.padEnd(38)} ${r.testo}`);
  }
  const nascoste = righe.filter((r) => !r.mostrata).length;
  console.log(
    `\n${righe.length} variabili · ${nascoste} non mostrate (nessun valore segreto è stato stampato)`,
  );
}

const invocatoDirettamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocatoDirettamente) {
  const argomento = process.argv[2];
  stampa(argomento ? resolve(argomento) : resolve(repoRoot, 'api', '.env'));
}
