#!/usr/bin/env node
/**
 * Restore database da backup cifrato VestiFlow.
 *
 * ATTENZIONE: sovrascrive dati nel database di destinazione.
 *
 * ⛔ **Il bersaglio è OBBLIGATORIO e non ha un valore predefinito.** Fino al
 *    07/09/2026 ripiegava su `DIRECT_URL` di `api/.env`, cioè sul database
 *    condiviso: un restore è distruttivo, e il suo bersaglio era l’unico a
 *    potersi indovinare da solo. Ora va nominato.
 *
 * Uso:
 *   npm run backup:restore -- --backup-dir backups/vestiflow-20260702-120000 \
 *     --confirm --direct-url "$URL_DEL_BERSAGLIO"
 */
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

import { createDecryptStream } from './crypto.mjs';
import { loadApiEnv, repoRoot } from './load-env.mjs';
import { mascheraUrl } from './backup-url.mjs';
import { perDocker, probePgTool } from './pg-tools.mjs';

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
  --direct-url <uri>    BERSAGLIO del restore — OBBLIGATORIO, nessun default
  --confirm             obbligatorio: conferma restore distruttivo

Variabili:
  (il bersaglio NON si legge da api/.env: va indicato con --direct-url)
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
  /*
    ⛔ **Nessun ripiego su `env.DIRECT_URL`.** Era la riga che rendeva il
       database condiviso il bersaglio PREDEFINITO di un comando che
       sovrascrive i dati: `--confirm` confermava di voler distruggere
       qualcosa, non QUALE cosa.
  */
  const directUrl = args.directUrl?.trim();
  const passphrase = env.BACKUP_ENCRYPTION_PASSPHRASE?.trim();

  if (!directUrl) {
    throw new Error(
      'Bersaglio del restore non indicato: usa --direct-url <uri>.\n' +
        'Non viene MAI dedotto da api/.env — un restore sovrascrive i dati del\n' +
        'database su cui atterra, e quale sia deve dirlo chi lo lancia.',
    );
  }
  if (!passphrase || passphrase.length < 16) {
    throw new Error('BACKUP_ENCRYPTION_PASSPHRASE mancante o troppo corta.');
  }

  await assertPgRestoreAvailable();

  console.log('[restore] Decifratura e pg_restore in corso…');
  // ⛔ Nemmeno l'host: il nome del progetto Supabase ci sta dentro.
  console.warn('[restore] Target database:', mascheraUrl(directUrl));

  const strumento = await probePgTool('pg_restore');
  /*
    ⭐ Con Docker il bersaglio va riscritto: dentro il container `localhost` e'
    il container, non la macchina. Il ripristino punta quasi sempre a un
    database usa-e-getta su `localhost:5433`, quindi e' proprio il caso comune.
  */
  const bersaglio = strumento.viaDocker ? perDocker(directUrl) : directUrl;
  if (strumento.viaDocker) {
    console.log('[restore] pg_restore da container postgres:17 (nessuna installazione locale).');
  }
  const pgRestore = spawn(
    strumento.comando,
    [
      ...strumento.prefisso,
      '--dbname',
      bersaglio,
      '--verbose',
      '--no-owner',
      '--no-acl',
      '--clean',
      '--if-exists',
      /*
        ⛔ **QUI C`ERA `'-'`, e pg_restore non lo intende come standard input.**

        A differenza di `psql`, `pg_restore` tratta `'-'` come un NOME DI FILE, e
        falliva con «could not open input file "-": No such file or directory».
        Per leggere dallo standard input il nome del file si OMETTE.

        ⚠️ Il difetto era li` da sempre e non se n`era accorto nessuno perche`
        il ripristino non era MAI stato eseguito: la casella «Restore di prova
        completato» di `docs/BACKUP-DISASTER-RECOVERY.md` era ancora vuota. Un
        backup mai ripristinato non e` una rete: e` un file.
      */
    ],
    { stdio: ['pipe', 'inherit', 'pipe'] },
  );

  const decrypt = createDecryptStream(passphrase);
  const gunzip = createGunzip();

  /*
    ⭐ **UN DUMP SUPABASE IN UN POSTGRES SEMPLICE LASCIA SEMPRE TRE ERRORI**,
    e non sono un guasto: `supabase_vault` e` un`estensione che esiste solo
    sull`infrastruttura Supabase. Misurato il 06/09/2026 su un ripristino in
    schema vuoto: TRE errori, tutti e tre di quell`estensione, e 75 tabelle su
    75 con i conteggi identici al database di origine.

    ⛔ `pg_restore` esce comunque con codice 1, e prima lo script lo trattava
    come fallimento: il ripristino RIUSCITO risultava fallito. Questa e` la
    ragione per cui la procedura sembrava non funzionare.

    ⚠️ **Non si ignora il codice di uscita**: si guardano gli errori uno per
    uno. Se anche uno solo non appartiene agli oggetti di sola infrastruttura,
    il ripristino fallisce come prima.
  */
  const SOLO_INFRASTRUTTURA_SUPABASE =
    /supabase_vault|vault\.secrets|extension "supabase_[a-z_]+" (?:is not available|does not exist)/;

  let stderr = '';
  pgRestore.stderr.on('data', (chunk) => {
    const testo = chunk.toString();
    stderr += testo;
    process.stderr.write(testo);
  });

  const restoreDone = new Promise((resolve, reject) => {
    pgRestore.on('error', reject);
    pgRestore.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      const errori = stderr
        .split(/\r?\n/)
        .filter((riga) => riga.startsWith('pg_restore: error'));
      const estranei = errori.filter((riga) => !SOLO_INFRASTRUTTURA_SUPABASE.test(riga));
      if (errori.length > 0 && estranei.length === 0) {
        console.warn(
          `[restore] ${errori.length} errori IGNORATI, tutti su oggetti di sola ` +
            'infrastruttura Supabase (supabase_vault): non riguardano i dati.',
        );
        resolve(undefined);
        return;
      }
      reject(
        new Error(
          `pg_restore terminato con codice ${code}, ${estranei.length} errori NON ` +
            `riconducibili all'infrastruttura Supabase:\n${mascheraUrl(estranei.slice(0, 10).join('\\n'))}`,
        ),
      );
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
