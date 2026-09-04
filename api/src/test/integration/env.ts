/**
 * L'unico punto che risolve la connessione dell'ambiente TEST.
 *
 * ⛔ **Non esiste alcun ripiego su `DATABASE_URL`.** Nessun `??`, nessun `||`,
 *    nessun default. `DATABASE_URL` è la connessione a DEV — un database
 *    CONDIVISO col collega — e una suite che lo raggiungesse ci scriverebbe
 *    sopra dati di prova, o lo azzererebbe.
 *
 * ⛔ **E non esiste alcun `describe.skip` condizionale.** Se la variabile manca
 *    la suite FALLISCE, non salta. Un test saltato che diventa verde
 *    contribuisce alla sensazione che l'integrazione sia verificata mentre non
 *    lo è — ed è, alla lettera, il difetto trovato sei volte nel backend
 *    dall'audit di sede (`docs/21`): una guardia presente nel codice e assente
 *    nell'esecuzione.
 */

/** Il messaggio è un contratto: `docs/21` §7 lo cita per esteso. */
const NON_CONFIGURATO = 'Integration database not configured';

/**
 * ⭐ **Il bersaglio esatto, non una lista di host ammessi.**
 *
 * Non si controlla «è locale»: si controlla che sia **QUEL** database — host,
 * porta e nome insieme. È una lista bianca, e la differenza rispetto a un
 * confronto con DEV è tutta qui: un controllo «diverso da `DATABASE_URL`»
 * protegge solo dal copia-incolla di quella stringa, mentre questo rifiuta
 * qualunque altra destinazione — compresa una che non è DEV, compreso un DEV
 * futuro che oggi non esiste, e compreso **un altro database sulla stessa
 * macchina**.
 *
 * ⚠️ Quest'ultimo caso è il motivo per cui host e porta non bastano: un
 * PostgreSQL di sviluppo personale sulla 5433, o un `vestiflow_dev` locale,
 * sarebbero «locali» e verrebbero cancellati dal troncamento fra un file e
 * l'altro.
 *
 * I tre valori corrispondono a `docker-compose.test.yml`. Cambiarli lì senza
 * cambiarli qui fa fallire la suite, ed è voluto: la destinazione non deve
 * poter cambiare per sbaglio.
 */
const BERSAGLIO = {
  host: new Set(['localhost', '127.0.0.1']),
  porta: '5433',
  database: 'vestiflow_test',
} as const;

export interface AmbienteIntegrazione {
  /** Connessione applicativa: la usa il client Prisma dei test. */
  readonly databaseUrl: string;
  /** Connessione diretta: la usa `prisma migrate deploy`. */
  readonly directUrl: string;
  readonly host: string;
  readonly database: string;
}

/**
 * Verifica una singola stringa di connessione, e dice PERCHÉ la rifiuta.
 *
 * ⚠️ Un rifiuto muto qui sarebbe il difetto peggiore: chi lo incontra
 * penserebbe a un problema di rete e cercherebbe di aggirarlo.
 */
function verifica(nome: string, valore: string | undefined): URL {
  if (!valore || valore.trim() === '') {
    throw new Error(
      `${NON_CONFIGURATO}: ${nome} non è impostata.\n` +
        `  Avvia il database di prova con  npm run db:test:up  (da api/),\n` +
        `  poi dichiara ${nome} in api/.env.\n` +
        `  ⛔ Non usare DATABASE_URL: è DEV, ed è condiviso.`,
    );
  }

  let url: URL;
  try {
    url = new URL(valore);
  } catch {
    throw new Error(`${NON_CONFIGURATO}: ${nome} non è una URL valida.`);
  }

  if (!BERSAGLIO.host.has(url.hostname)) {
    throw new Error(
      `${NON_CONFIGURATO}: ${nome} punta a «${url.hostname}», che non è locale.\n` +
        `  L'ambiente TEST vive in un container su questa macchina. Un host\n` +
        `  remoto è rifiutato SEMPRE — non solo se coincide con DEV.`,
    );
  }

  if (url.port !== BERSAGLIO.porta) {
    throw new Error(
      `${NON_CONFIGURATO}: ${nome} usa la porta ${url.port || '(nessuna)'}, ` +
        `attesa ${BERSAGLIO.porta}.\n` +
        `  ⛔ La 5432 è la porta di un PostgreSQL qualunque su questa macchina:\n` +
        `     locale non vuol dire «di prova». Il container TEST sta sulla ` +
        `${BERSAGLIO.porta}.`,
    );
  }

  const database = url.pathname.replace(/^\//, '');
  if (database !== BERSAGLIO.database) {
    throw new Error(
      `${NON_CONFIGURATO}: ${nome} punta al database «${database}», ` +
        `atteso «${BERSAGLIO.database}».\n` +
        `  ⛔ La suite TRONCA le tabelle: un nome diverso è un altro database,\n` +
        `     e sarebbe cancellato.`,
    );
  }

  return url;
}

/**
 * ⭐ **La barriera che protegge dall'errore realistico.** Le altre proteggono da
 * una configurazione assente; questa dal copia-incolla della stringa di DEV
 * dentro la variabile di TEST, che è il modo in cui un incidente del genere
 * accade davvero.
 *
 * Il confronto è su host + porta + nome del database, non sulla stringa intera:
 * due URL possono differire per parametri o credenziali e puntare allo stesso
 * posto.
 */
function assertNonCoincideConDev(url: URL, nome: string): void {
  /**
   * ⛔ **La copia sotto `VESTIFLOW_DEV_*` ha la PRECEDENZA, e non è un
   *    dettaglio.** Dentro la suite `setup.ts` riscrive `DATABASE_URL` con la
   *    connessione di TEST, per poter avviare l'app Nest vera. Confrontando
   *    ancora quel nome, TEST risulterebbe uguale a «DEV» e la suite si
   *    rifiuterebbe di partire: il confronto va fatto con la connessione DEV
   *    VERA, che vive solo sotto il nome messo da parte.
   *
   * ⚠️ Il ripiego sui nomi originali serve FUORI dalla suite — uno script, una
   *    verifica a mano — dove nessuno ha messo niente da parte.
   */
  const devDatabase = process.env['VESTIFLOW_DEV_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  const devDiretta = process.env['VESTIFLOW_DEV_DIRECT_URL'] ?? process.env['DIRECT_URL'];

  for (const [etichetta, grezza] of [
    ['DATABASE_URL (DEV)', devDatabase],
    ['DIRECT_URL (DEV)', devDiretta],
  ] as const) {
    if (!grezza) {
      continue;
    }
    let urlDev: URL;
    try {
      urlDev = new URL(grezza);
    } catch {
      continue;
    }
    const stessoPosto =
      urlDev.hostname === url.hostname &&
      urlDev.port === url.port &&
      urlDev.pathname === url.pathname;
    if (stessoPosto) {
      throw new Error(
        `${NON_CONFIGURATO}: ${nome} punta allo stesso database di ${etichetta}.\n` +
          `  host ${url.hostname}:${url.port}${url.pathname}\n` +
          `  ⛔ TEST e DEV non possono coincidere: la suite cancella dati.`,
      );
    }
  }
}

/**
 * Risolve l'ambiente TEST, o lancia. Non ritorna mai un valore parziale.
 *
 * ⚠️ Va invocata PRIMA di qualunque operazione distruttiva (il troncamento fra
 * un file e l'altro): è l'operazione che, puntata male, farebbe il danno
 * peggiore.
 */
export function ambienteIntegrazione(): AmbienteIntegrazione {
  const databaseUrl = verifica('DATABASE_URL_TEST', process.env['DATABASE_URL_TEST']);
  const directUrl = verifica('DIRECT_URL_TEST', process.env['DIRECT_URL_TEST']);

  assertNonCoincideConDev(databaseUrl, 'DATABASE_URL_TEST');
  assertNonCoincideConDev(directUrl, 'DIRECT_URL_TEST');

  return {
    databaseUrl: databaseUrl.toString(),
    directUrl: directUrl.toString(),
    host: `${databaseUrl.hostname}:${databaseUrl.port}`,
    database: databaseUrl.pathname.replace(/^\//, ''),
  };
}

export { NON_CONFIGURATO };
