#!/usr/bin/env node
/**
 * Backup completo VestiFlow in locale:
 * - database Postgres (pg_dump cifrato)
 * - file Supabase Storage (immagini, allegati)
 *
 * Prerequisiti: pg_dump nel PATH, api/.env con DIRECT_URL e segreti Supabase.
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
import { loadApiEnv, repoRoot } from './load-env.mjs';

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function parseArgs(argv) {
  const args = { dbOnly: false, storageOnly: false, outputDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db-only') {
      args.dbOnly = true;
    } else if (arg === '--storage-only') {
      args.storageOnly = true;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[i + 1] ?? null;
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
  --db-only             solo database
  --storage-only        solo storage

Variabili (api/.env o ambiente):
  BACKUP_DATABASE_URL             session pooler :5432 (consigliato backup su Windows)
  DIRECT_URL                      fallback se BACKUP_DATABASE_URL assente
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

  mkdirSync(backupDir, { recursive: true });

  const includeDb = !args.storageOnly;
  const includeStorage = !args.dbOnly;

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
    const databaseUrl = resolveBackupDatabaseUrl(env);
    assertBackupDatabaseUrl(databaseUrl);
    if (env.BACKUP_DATABASE_URL?.trim()) {
      console.log('[backup] Connessione: BACKUP_DATABASE_URL (session pooler).');
    } else {
      console.log('[backup] Connessione: DIRECT_URL.');
    }
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
