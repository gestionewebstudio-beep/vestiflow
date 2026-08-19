#!/usr/bin/env node
/**
 * ⚠️ **Nella catena dei controlli di VestiFlow niente accende l'API.**
 *
 * Misurato il 17/08/2026, e il difetto di quel giorno lo dimostra: `tsc` pulito,
 * 1645 prove verdi, dieci guardie verdi — e il backend non partiva. Nessuno dei
 * controlli esistenti fa partire il processo:
 *
 * | Controllo                    | Cosa prova                                   |
 * | ---------------------------- | -------------------------------------------- |
 * | `npm run build --prefix api` | che i tipi tornano — è l'UNICO type-check    |
 * | `npm run test:api`           | i moduli **uno per uno**, istanziati a mano  |
 * | le nove guardie `.mjs`       | testo e coerenza fra file, mai un processo   |
 *
 * Il buco è nel mezzo: i test API costruiscono i service con `new`, quindi un
 * grafo di moduli Nest che non si risolve — un provider mancante, una
 * dipendenza circolare, un `@Module` non importato — non fa arrossare niente.
 * Compila, passa i test, e muore al primo avvio.
 *
 * ── COSA PROVA QUESTO CONTROLLO ─────────────────────────────────────────────
 * Che `bootstrap()` **arriva in fondo**: grafo dei moduli risolto, `ValidationPipe`
 * e filtri montati, connessione al database aperta (`PrismaService.onModuleInit`
 * fa `$connect()`), server in ascolto e capace di rispondere.
 *
 * Non prova che l'applicazione funzioni: prova che esiste. È il gradino sotto ai
 * test, non uno sopra.
 *
 * ── COSA NON TOCCA ──────────────────────────────────────────────────────────
 * Una sola richiesta, `GET /api/v1/health`, che esegue `SELECT 1`. Nessuna
 * scrittura, nessuna migration, nessun seed — il seed dei Codici IVA e delle
 * Nature è pigro e scatta sulle rotte del catalogo, non al boot. Sul database
 * CONDIVISO col ramo del collega questo controllo è innocuo per costruzione.
 *
 * ── COME SI CHIUDE, SEMPRE ──────────────────────────────────────────────────
 * Il processo figlio si spawna senza shell (`process.execPath dist/main.js`),
 * quindi è UN processo solo e ammazzabile. La chiusura sta in un `finally`:
 * riuscita, fallita, in timeout o interrotta con Ctrl-C, il figlio muore.
 * Prima SIGTERM (gli shutdown hook di Nest sono attivi), poi SIGKILL dopo la
 * grazia. ⚠️ Su Windows SIGTERM non è un segnale vero: Node lo traduce in
 * `TerminateProcess`, quindi gli hook non girano. Non è un problema qui —
 * questo controllo non scrive niente che vada chiuso con garbo.
 *
 * ── PERCHÉ UNA PORTA EFFIMERA ───────────────────────────────────────────────
 * Su 3000 c'è quasi sempre il `nest start --watch` di chi sta lavorando: il
 * controllo fallirebbe con `EADDRINUSE` accusando il codice di un difetto che
 * non ha. Si chiede al sistema una porta libera e la si passa in `PORT`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');
const ENTRY = join(API_DIR, 'dist', 'main.js');

/** Quanto si aspetta che l'API risponda prima di dichiararla non avviata. */
const BOOT_TIMEOUT_MS = 90_000;
/** Ogni quanto si richiede `/health` mentre l'API sta salendo. */
const POLL_INTERVAL_MS = 250;
/** Grazia fra SIGTERM e SIGKILL. */
const KILL_GRACE_MS = 5_000;

function fallisci(messaggio, dettaglio = '') {
  console.error(`\n✖ Avvio API non riuscito: ${messaggio}\n`);
  if (dettaglio.trim()) {
    console.error('  Output del processo:\n');
    for (const riga of dettaglio.trimEnd().split(/\r?\n/)) {
      console.error(`    ${riga}`);
    }
    console.error('');
  }
  process.exit(1);
}

/** Una porta che il sistema dichiara libera adesso. */
function portaLibera() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const attendi = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!existsSync(ENTRY)) {
    fallisci(
      `manca ${ENTRY.replace(ROOT, '.')}.\n  Compila prima il backend: npm run build --prefix api`,
    );
  }
  if (!process.env.DATABASE_URL && !existsSync(join(API_DIR, '.env'))) {
    // È l'unica variabile senza default nella classe `EnvironmentVariables`:
    // senza, `validateEnv` lancia e il boot muore prima di ascoltare.
    fallisci(
      'DATABASE_URL non è configurata e api/.env non esiste.\n' +
        "  L'API non può avviarsi: è l'unica variabile obbligatoria al bootstrap.",
    );
  }

  const port = await portaLibera();
  const url = `http://127.0.0.1:${port}/api/v1/health`;

  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: API_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Niente shell: un processo solo, senza figli orfani da rincorrere.
    shell: false,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  let uscito = null;
  child.on('exit', (code, signal) => {
    uscito = { code, signal };
  });

  // ⚠️ Il `finally` è il punto di questo controllo: qualunque cosa succeda
  // sotto — esito, eccezione, timeout — qui il processo figlio muore. Senza,
  // un fallimento lascerebbe un'API in ascolto e la prossima esecuzione
  // fallirebbe per una ragione diversa da quella vera.
  try {
    const scadenza = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < scadenza) {
      if (uscito) {
        fallisci(
          `il processo è uscito prima di rispondere (codice ${uscito.code}, segnale ${uscito.signal}).`,
          output,
        );
      }
      try {
        const risposta = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (risposta.ok) {
          const corpo = await risposta.json();
          if (corpo?.status !== 'ok') {
            fallisci(`/health ha risposto ${risposta.status} con un corpo inatteso.`, output);
          }
          console.log(
            `✓ avvio API: bootstrap completato su :${port}, /api/v1/health risponde ` +
              `(database ${corpo.database}).`,
          );
          return;
        }
      } catch {
        // Non ancora in ascolto: è lo stato normale finché Nest costruisce il
        // grafo. Si riprova, e a decidere è la scadenza.
      }
      await attendi(POLL_INTERVAL_MS);
    }
    fallisci(`l'API non ha risposto entro ${BOOT_TIMEOUT_MS / 1000}s su ${url}.`, output);
  } finally {
    if (!uscito) {
      child.kill('SIGTERM');
      const limite = Date.now() + KILL_GRACE_MS;
      while (!uscito && Date.now() < limite) {
        await attendi(50);
      }
      if (!uscito) {
        child.kill('SIGKILL');
      }
    }
  }
}

await main();
