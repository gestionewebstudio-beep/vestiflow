/**
 * `prisma migrate deploy` sul database CONDIVISO DI PROVA (Supabase), con la
 * procedura che `regole-qualita` chiede per un intervento manuale: autorizzazione
 * del proprietario, backup verificato, bersaglio dichiarato e confermato.
 *
 *   node scripts/prisma-deploy-prova-condivisa.mjs \
 *     --env-file .env.rilascio.local \
 *     --backup ../backups/<cartella> \
 *     --conferma <host del bersaglio>
 *
 * ⭐ Tre cancelli, e nessuno si salta:
 *    1. il bersaglio viene da un file INDICATO (`--env-file`), mai da `api/.env`,
 *       dove `DIRECT_URL` non deve tornare (`check:bersaglio-condiviso`);
 *    2. `--backup` indica una cartella con `manifest.json` che contiene il
 *       database, fatta da meno di 24 ore: senza un backup recente non si parte;
 *    3. `--conferma` ripete l'host del bersaglio: chi lancia ha letto dove scrive.
 *    Poi `prisma migrate status` (sola lettura) mostra le migration pendenti, e
 *    solo dopo parte `migrate deploy`. Le variabili si sostituiscono nel solo
 *    processo figlio.
 *
 * ⛔ Rifiuta un bersaglio LOCALE: TEST (5433) e COLLAUDO (5434) hanno i loro
 *    script. Questo esiste per il condiviso di prova e va usato con un via
 *    esplicito per QUELLA esecuzione (precisazione del proprietario, 12/09/2026:
 *    l'ambiente è di prova, si può toccare sapendo cosa contiene, con backup
 *    verificato e autorizzazione precisa).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';

const ORE_MASSIME_BACKUP = 24;

function argomento(argv, nome) {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Il bersaglio è remoto e completo; `conferma` ripete il suo host. */
export function verificaBersaglioCondiviso(valore, conferma) {
  let url;
  try {
    url = new URL(valore ?? '');
  } catch {
    return { ok: false, motivo: 'non è una URL valida' };
  }
  if (['localhost', '127.0.0.1'].includes(url.hostname)) {
    return {
      ok: false,
      motivo: `punta a «${url.hostname}»: per TEST e COLLAUDO ci sono prisma:deploy:test e prisma:deploy:collaudo`,
    };
  }
  if (!url.pathname || url.pathname === '/') {
    return { ok: false, motivo: 'non indica un database' };
  }
  if (conferma !== url.hostname) {
    return {
      ok: false,
      motivo: `--conferma deve ripetere l'host del bersaglio («${url.hostname}»), non «${conferma ?? ''}»`,
    };
  }
  return { ok: true, url };
}

/** La cartella di backup ha un manifest con il database ed è recente. */
export function verificaBackup(cartella, adesso = Date.now()) {
  const manifest = join(cartella, 'manifest.json');
  if (!existsSync(manifest)) {
    return { ok: false, motivo: `manca ${manifest}` };
  }
  let dati;
  try {
    dati = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    return { ok: false, motivo: 'manifest.json non leggibile' };
  }
  if (!dati?.components?.database?.file) {
    return { ok: false, motivo: 'il backup non contiene il database (solo storage?)' };
  }
  if (!existsSync(join(cartella, dati.components.database.file))) {
    return { ok: false, motivo: `manca il file ${dati.components.database.file}` };
  }
  const creato = Date.parse(dati.createdAt ?? '');
  if (Number.isNaN(creato)) {
    return { ok: false, motivo: 'createdAt assente o illeggibile nel manifest' };
  }
  const ore = (adesso - creato) / 3_600_000;
  if (ore > ORE_MASSIME_BACKUP) {
    return {
      ok: false,
      motivo: `il backup ha ${ore.toFixed(1)} ore: ne sono ammesse ${ORE_MASSIME_BACKUP}`,
    };
  }
  return { ok: true, ore, createdAt: dati.createdAt };
}

const invocatoDirettamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invocatoDirettamente) {
  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const muori = (m) => {
    console.error(`\n  Fermo: ${m}\n`);
    process.exit(1);
  };
  const fileAmbiente = argomento(process.argv, '--env-file');
  const cartellaBackup = argomento(process.argv, '--backup');
  const conferma = argomento(process.argv, '--conferma');
  if (!fileAmbiente) muori('serve --env-file <file con DATABASE_URL e DIRECT_URL del bersaglio>.');
  if (!cartellaBackup) muori('serve --backup <cartella del backup verificato>.');

  const env = leggiFileAmbiente(resolve(apiRoot, fileAmbiente));
  const database = verificaBersaglioCondiviso(env['DATABASE_URL'], conferma);
  if (!database.ok) muori(`DATABASE_URL ${database.motivo}.`);
  const direct = verificaBersaglioCondiviso(env['DIRECT_URL'], conferma);
  if (!direct.ok) muori(`DIRECT_URL ${direct.motivo}.`);
  const backup = verificaBackup(resolve(apiRoot, cartellaBackup));
  if (!backup.ok) muori(`backup: ${backup.motivo}.`);

  console.log(
    `\n  Bersaglio: ${database.url.hostname}:${database.url.port}${database.url.pathname}`,
  );
  console.log(`  Backup:    ${backup.createdAt} (${backup.ore.toFixed(1)} ore fa)\n`);

  const ambienteFiglio = {
    ...process.env,
    DATABASE_URL: database.url.toString(),
    DIRECT_URL: direct.url.toString(),
  };
  console.log('  Migration pendenti (prisma migrate status, sola lettura):\n');
  const stato = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: ambienteFiglio,
  });
  if (stato.status !== 0 && stato.status !== 1) {
    // status esce 1 quando ci sono pendenti: non è un errore. Altro sì.
    muori(`prisma migrate status è uscito con ${stato.status}.`);
  }
  console.log('\n  Applico le migration al bersaglio.\n');
  const esito = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: ambienteFiglio,
  });
  process.exit(esito.status ?? 1);
}
