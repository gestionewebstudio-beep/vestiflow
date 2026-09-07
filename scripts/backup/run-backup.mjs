#!/usr/bin/env node
/**
 * Backup completo VestiFlow in locale:
 * - database Postgres (pg_dump cifrato)
 * - file Supabase Storage (immagini, allegati)
 *
 * Prerequisiti: pg_dump nel PATH, segreti Supabase in api/.env, e un BERSAGLIO
 * indicato esplicitamente (--database-url, --env-file, o BACKUP_DATABASE_URL
 * esportata nell’ambiente).
 *
 * Uso:
 *   npm run backup:full
 *   npm run backup:full -- --db-only
 *   npm run backup:full -- --output-dir D:\Backups\vestiflow
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { backupDatabase } from './backup-database.mjs';
import { assertBackupDatabaseUrl, resolveBackupDatabaseUrl } from './backup-url.mjs';
import { backupStorage, resolveBuckets } from './backup-storage.mjs';
import { leggiFileAmbiente, loadApiEnv, repoRoot } from './load-env.mjs';

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function parseArgs(argv) {
  const args = {
    dbOnly: false,
    storageOnly: false,
    outputDir: null,
    databaseUrl: null,
    envFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db-only') {
      args.dbOnly = true;
    } else if (arg === '--storage-only') {
      args.storageOnly = true;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--database-url') {
      args.databaseUrl = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--env-file') {
      args.envFile = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Backup completo VestiFlow (database + storage Supabase)

Comandi:
  npm run backup:full                  backup database + storage
  npm run backup:db                    solo database
  npm run backup:storage               solo storage

Opzioni:
  --output-dir <path>   cartella di destinazione (default: ./backups/vestiflow-YYYYMMDD-HHmmss)
  --database-url <uri>  BERSAGLIO del dump, indicato a mano
  --env-file <path>     file di ambiente da cui leggerlo (BACKUP_DATABASE_URL o DIRECT_URL)
  --db-only             solo database
  --storage-only        solo storage

Bersaglio del database (in ordine di precedenza, MAI da api/.env):
  --database-url <uri>            indicato a mano
  --env-file <path>               un file di ambiente che indichi tu
  BACKUP_DATABASE_URL             esportata nell’ambiente di QUESTO comando
  DIRECT_URL                      idem, se BACKUP_DATABASE_URL non c’è

Segreti Supabase (api/.env o ambiente):
  SUPABASE_URL                    URL progetto Supabase
  SUPABASE_SERVICE_ROLE_KEY       chiave service role (solo backup storage)
  BACKUP_ENCRYPTION_PASSPHRASE    passphrase cifratura dump (min 16 caratteri)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.dbOnly && args.storageOnly) {
    throw new Error('Usa solo uno tra --db-only e --storage-only.');
  }

  const env = loadApiEnv();
  const timestamp = formatTimestamp();
  const backupDir =
    args.outputDir?.trim() ||
    join(repoRoot, 'backups', `vestiflow-${timestamp}`);

  const includeDb = !args.storageOnly;
  const includeStorage = !args.dbOnly;

  // ⛔ Prima il bersaglio, poi il disco: un backup senza destinazione non deve
  //    lasciare dietro di sé una cartella vuota col timestamp del tentativo.
  /*
    ⛔ **Il bersaglio non si deduce da `api/.env`.** Fino al 07/09/2026
       questa riga era `resolveBackupDatabaseUrl(env)`, dove `env` veniva da
       `loadApiEnv()`: bastava `npm run backup` per puntare al database
       condiviso senza averlo nominato, e il log diceva solo «Connessione:
       DIRECT_URL» — il nome della variabile, non da dove veniva.

    ⭐ Le tre fonti sono tutte dichiarazioni di chi esegue. La terza tiene in
       piedi il backup automatico in CI, che le variabili le inietta nell’
       ambiente del passo: il suo workflow non va toccato.
  */
  const daFile = args.envFile && includeDb ? leggiFileAmbiente(args.envFile) : {};
  const { url: databaseUrl, origine } = resolveBackupDatabaseUrl({
    urlEsplicita: args.databaseUrl,
    daFileIndicato: daFile.BACKUP_DATABASE_URL ?? daFile.DIRECT_URL,
    daAmbiente: process.env.BACKUP_DATABASE_URL ?? process.env.DIRECT_URL,
  });
  assertBackupDatabaseUrl(databaseUrl);
  // ⛔ Si stampa l’ORIGINE, mai l’URL: dentro c’è host, utente e password.
  console.log(`[backup] Bersaglio indicato da: ${origine}.`);

  mkdirSync(backupDir, { recursive: true });


  const manifest = {
    version: 1,
    product: 'vestiflow',
    createdAt: new Date().toISOString(),
    backupDir,
    components: {},
  };

  console.log(`[backup] Destinazione: ${backupDir}`);

  if (includeDb) {
    console.log('[backup] Database Postgres…');
    const dbPath = join(backupDir, 'database.dump.enc');
    const passphrase = env.BACKUP_ENCRYPTION_PASSPHRASE?.trim();
    await backupDatabase({
      directUrl: databaseUrl,
      passphrase: passphrase ?? '',
      outputPath: dbPath,
    });
    manifest.components.database = {
      file: 'database.dump.enc',
      format: 'pg_dump-custom-gzip-aes256gcm',
      encrypted: true,
    };
    console.log('[backup] Database salvato e cifrato.');
  }

  if (includeStorage) {
    console.log('[backup] Supabase Storage…');
    const storageDir = join(backupDir, 'storage');
    const buckets = resolveBuckets(env);
    const storageResult = await backupStorage({
      supabaseUrl: env.SUPABASE_URL ?? '',
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      outputDir: storageDir,
      buckets,
    });
    manifest.components.storage = {
      path: 'storage/',
      buckets: storageResult.summary,
      totalFiles: storageResult.totalFiles,
    };
    console.log(`[backup] Storage: ${storageResult.totalFiles} file scaricati.`);
  }

  const manifestPath = join(backupDir, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('[backup] Completato.');
  console.log(`[backup] Manifest: ${manifestPath}`);
  console.log(
    '[backup] Conserva la passphrase offline. Senza di essa il dump database non è recuperabile.',
  );
}

main().catch((error) => {
  console.error('[backup] Errore:', error instanceof Error ? error.message : error);
  process.exit(1);
});
