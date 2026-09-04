import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambienteIntegrazione } from './env';

/**
 * Preparazione dell'ambiente per la sola suite di integrazione.
 *
 * ⭐ **L'ordine è la protezione, e non è negoziabile:**
 *
 * ```text
 *   1. leggi api/.env                    (Vitest non lo fa da sé)
 *   2. metti da parte la connessione DEV sotto VESTIFLOW_DEV_*
 *   3. VALIDA DATABASE_URL_TEST / DIRECT_URL_TEST contro il bersaglio esatto
 *          localhost|127.0.0.1 : 5433 / vestiflow_test
 *   4. SOLO ALLORA  DATABASE_URL = DATABASE_URL_TEST
 *                   DIRECT_URL   = DIRECT_URL_TEST
 *   5. neutralizza le credenziali Supabase DEV
 * ```
 *
 * Il passo 4 esiste perché l'app Nest reale va avviata: `PrismaService` non fa
 * override del datasource e legge `DATABASE_URL`. Ma avviene **dopo** il passo
 * 3, quindi la variabile può valere solo il database di prova: se la
 * validazione fallisce, questo file lancia e il passo 4 non viene mai eseguito.
 *
 * ⛔ **Nessun ripiego su DEV in nessun punto.** Se `DATABASE_URL_TEST` manca o
 *    punta altrove, la suite non parte — non «riprova con quella di sviluppo».
 *
 * ⚠️ **Qui c'era un segnaposto irraggiungibile** (`127.0.0.1:1`) al posto di
 *    `DATABASE_URL`. Serviva a far fallire un `new PrismaClient()` distratto, ma
 *    impediva anche il bootstrap dell'app Nest vera. Sostituirlo con la
 *    connessione di TEST **non indebolisce niente**: l'obiettivo non era mai
 *    «nessun client deve funzionare», era «niente deve raggiungere DEV». Un
 *    client nudo ora finisce sul database di prova, che è il posto giusto.
 */

/** Lo stesso caricatore di `scripts/backup/load-env.mjs` — vedi la nota sotto. */
function leggiEnvApi(): Record<string, string> {
  // ⚠️ Duplica di proposito `scripts/backup/load-env.mjs`: quel file è `.mjs`
  //    senza tipi e vive FUORI da `api/`, mentre `api/tsconfig.json` dichiara
  //    `rootDir: ./src`. Quindici righe costano meno di un'eccezione alla
  //    struttura. Niente `import.meta`: l'API compila in CommonJS.
  const candidati = [join(process.cwd(), '.env'), join(process.cwd(), 'api', '.env')];
  const percorso = candidati.find((p) => existsSync(p));
  const valori: Record<string, string> = {};
  if (!percorso) {
    return valori;
  }
  for (const rigaGrezza of readFileSync(percorso, 'utf8').split('\n')) {
    const riga = rigaGrezza.trim();
    if (!riga || riga.startsWith('#')) {
      continue;
    }
    const uguale = riga.indexOf('=');
    if (uguale <= 0) {
      continue;
    }
    const chiave = riga.slice(0, uguale).trim();
    let valore = riga.slice(uguale + 1).trim();
    if (
      (valore.startsWith('"') && valore.endsWith('"')) ||
      (valore.startsWith("'") && valore.endsWith("'"))
    ) {
      valore = valore.slice(1, -1);
    }
    valori[chiave] = valore;
  }
  return valori;
}

// ── 1 · l'ambiente dichiarato in api/.env ───────────────────────────────────
const daFile = leggiEnvApi();

for (const chiave of ['DATABASE_URL_TEST', 'DIRECT_URL_TEST']) {
  const valore = daFile[chiave];
  if (valore && !process.env[chiave]) {
    process.env[chiave] = valore;
  }
}

// ── 2 · la connessione DEV, messa da parte per il solo confronto ────────────
//
// Il nome diverso è ciò che impedisce a Prisma di raccoglierla per errore, e
// serve a `env.ts` per rifiutare un TEST che coincidesse con DEV.
for (const [originale, custodia] of [
  ['DATABASE_URL', 'VESTIFLOW_DEV_DATABASE_URL'],
  ['DIRECT_URL', 'VESTIFLOW_DEV_DIRECT_URL'],
] as const) {
  const valore = process.env[originale] ?? daFile[originale];
  if (valore) {
    process.env[custodia] = valore;
  }
}

// ── 3 · LA VALIDAZIONE, prima di qualunque override ─────────────────────────
//
// ⛔ Lancia se la variabile manca, se host/porta/database non sono ESATTAMENTE
//    quelli del container, o se coincidono con DEV. Da qui in giù non si
//    arriva con una destinazione sbagliata.
const ambiente = ambienteIntegrazione();

// ── 4 · SOLO ORA l'app può essere avviata contro il database di prova ───────
process.env['DATABASE_URL'] = ambiente.databaseUrl;
process.env['DIRECT_URL'] = ambiente.directUrl;

// ── 5 · le credenziali Supabase DEV non servono, e non devono esserci ───────
//
// ⭐ **L'autenticazione resta REALE**: `JwtAuthGuard` verifica il token e carica
//    il profilo dal database, e nella suite fa entrambe le cose per davvero.
//    Cambia solo CHI emette i token — un emittente locale invece del progetto
//    Supabase di sviluppo — così la verifica è HS256 in memoria e non parte
//    nessuna chiamata di rete.
//
// ⚠️ Senza questo, `SupabaseJwtService` ripiegherebbe su JWKS e scaricherebbe
//    le chiavi da `SUPABASE_URL`, cioè dall'infrastruttura DEV.
export const EMITTENTE_INTEGRAZIONE = 'http://integrazione.vestiflow.local';
export const SEGRETO_INTEGRAZIONE = 'segreto-di-prova-solo-per-la-suite-integrazione';

process.env['SUPABASE_URL'] = EMITTENTE_INTEGRAZIONE;
process.env['SUPABASE_JWT_SECRET'] = SEGRETO_INTEGRAZIONE;

/**
 * ⛔ **Vuota, non cancellata — ed è la SECONDA volta che questa distinzione
 *    conta.** Il caricatore `.env` di Prisma gira all'`import` di
 *    `@prisma/client` e reimposta ogni chiave che NON trova già in
 *    `process.env`: una `delete` viene annullata dal primo import. Una stringa
 *    vuota invece è «presente», e sopravvive.
 *
 * ⭐ Vuota è anche ciò che serve: `SupabaseService` costruisce un client solo
 *    se URL **e** service role key sono entrambi valorizzati. Senza chiave non
 *    esiste alcun client, quindi nessuna chiamata all'Admin API è possibile
 *    nemmeno per errore.
 */
process.env['SUPABASE_SERVICE_ROLE_KEY'] = '';
