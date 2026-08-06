#!/usr/bin/env node
/**
 * Restore database da backup cifrato VestiFlow.
 *
 * ATTENZIONE: sovrascrive dati nel database di destinazione.
 *
 * Uso (staging consigliato):
 *   npm run backup:restore -- --backup-dir backups/vestiflow-20260702-120000 --confirm
 *
 * Override URL (es. progetto Supabase staging):
 *   npm run backup:restore -- --backup-dir ... --confirm --direct-url "$STAGING_DIRECT_URL"
 */
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

import { createDecryptStream } from './crypto.mjs';
import { loadApiEnv, repoRoot } from './load-env.mjs';
import { probePgTool } from './pg-tools.mjs';

function parseArgs(argv) {
  const args = { confirm: false, backupDir: null, directUrl: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm') {
      args.confirm = true;
    } else if (arg === '--backup-dir') {
      args.backupDir = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--direct-url') {
      args.directUrl = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Restore database VestiFlow da backup locale

  npm run backup:restore -- --backup-dir backups/vestiflow-YYYYMMDD-HHmmss --confirm

Opzioni:
  --backup-dir <path>   cartella backup (deve contenere database.dump.enc)
  --direct-url <uri>    override DIRECT_URL (usa progetto staging!)
  --confirm             obbligatorio: conferma restore distruttivo

Variabili:
  DIRECT_URL                      target restore (default da api/.env)
  BACKUP_ENCRYPTION_PASSPHRASE    passphrase usata al backup

Nota: il restore storage (file) va ricaricato manualmente sui bucket Supabase
      oppure con script dedicato (futuro). Il manifest elenca i file in storage/.
`);
}

function assertPgRestoreAvailable() {
  return probePgTool('pg_restore');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.confirm) {
    throw new Error('Restore bloccato: aggiungi --confirm (operazione distruttiva sul DB target).');
  }
  if (!args.backupDir?.trim()) {
    throw new Error('Specifica --backup-dir con la cartella del backup.');
  }

  const backupDir = args.backupDir.startsWith('/') || /^[A-Za-z]:/.test(args.backupDir)
    ? args.backupDir
    : join(repoRoot, args.backupDir);

  const dumpPath = join(backupDir, 'database.dump.enc');
  if (!existsSync(dumpPath)) {
    throw new Error(`File non trovato: ${dumpPath}`);
  }

  const manifestPath = join(backupDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    console.log(`[restore] Backup del ${manifest.createdAt ?? 'data sconosciuta'}`);
  }

  const env = loadApiEnv();
  const directUrl = args.directUrl?.trim() || env.DIRECT_URL?.trim();
  const passphrase = env.BACKUP_ENCRYPTION_PASSPHRASE?.trim();

  if (!directUrl) {
    throw new Error('DIRECT_URL mancante. Usa --direct-url per un database staging.');
  }
  if (!passphrase || passphrase.length < 16) {
    throw new Error('BACKUP_ENCRYPTION_PASSPHRASE mancante o troppo corta.');
  }

  await assertPgRestoreAvailable();

  console.log('[restore] Decifratura e pg_restore in corso…');
  console.warn('[restore] Target database:', directUrl.replace(/:[^:@/]+@/, ':***@'));

  const pgRestorePath = await probePgTool('pg_restore');
  const pgRestore = spawn(
    pgRestorePath,
    ['--dbname', directUrl, '--verbose', '--no-owner', '--no-acl', '--clean', '--if-exists', '-'],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );

  const decrypt = createDecryptStream(passphrase);
  const gunzip = createGunzip();

  const restoreDone = new Promise((resolve, reject) => {
    pgRestore.on('error', reject);
    pgRestore.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`pg_restore terminato con codice ${code}.`));
      }
    });
  });

  await pipeline(createReadStream(dumpPath), decrypt, gunzip, pgRestore.stdin);
  await restoreDone;

  console.log('[restore] Database ripristinato.');
  console.log('[restore] Esegui in api/: npx prisma migrate deploy && npm run check:rls');
}

main().catch((error) => {
  console.error('[restore] Errore:', error instanceof Error ? error.message : error);
  process.exit(1);
});
