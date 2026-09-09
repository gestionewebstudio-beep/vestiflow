import { DocumentStatus, DocumentType, PrismaClient, UserRole } from '@prisma/client';

import { ambienteIntegrazione } from './env';

/** Il client dentro una transazione interattiva: non espone $transaction. */
export type PrismaTransazione = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Il dataset minimo del Passo 5, creato nel SOLO database di prova.
 *
 * ```text
 *   Tenant A ── Location A1  ← l'utente limitato è assegnato qui
 *            └─ Location A2
 *   Tenant B ── Location B1
 * ```
 *
 * ⛔ **Non usa il seed generale** (`prisma/seed.mjs`, 635 righe, tenant
 *    «Sandbox locale»): quello descrive un'azienda verosimile, questo descrive
 *    l'esatta configurazione che le prove interrogano. Un dataset condiviso
 *    farebbe dipendere l'esito da dati che nessuno di questi test dichiara.
 */

export const IDS = {
  tenantA: '0a000000-0000-4000-8000-00000000000a',
  tenantB: '0b000000-0000-4000-8000-00000000000b',
  locA1: '1a100000-0000-4000-8000-00000000a001',
  locA2: '1a200000-0000-4000-8000-00000000a002',
  locB1: '1b100000-0000-4000-8000-00000000b001',
  /** Commesso del Tenant A, assegnato alla SOLA A1. */
  utenteA1: '2a100000-0000-4000-8000-00000000a101',
  authA1: '3a100000-0000-4000-8000-00000000a201',
  /** Stesso tenant, stessa sede, ma con `inventory.view_all_locations`. */
  utenteSupervisore: '2a900000-0000-4000-8000-00000000a901',
  authSupervisore: '3a900000-0000-4000-8000-00000000a902',
  /** Documenti: uno per sede, per interrogarli per ID. */
  docA1: '4a100000-0000-4000-8000-00000000d001',
  docA2: '4a200000-0000-4000-8000-00000000d002',
  docB1: '4b100000-0000-4000-8000-00000000d003',
  /** Un DDT di vendita in A2: serve come RIFERIMENTO passato per ID. */
  ddtA2: '4a200000-0000-4000-8000-00000000d004',
} as const;

/**
 * I trigger che rifiutano DELETE e TRUNCATE sullo storico dei collegamenti.
 *
 * ⛔ **Si nominano UNO PER UNO, e non si usa `DISABLE TRIGGER USER`**: quella
 *    forma spegne TUTTI i trigger utente della tabella — compresi
 *    `…_immutabile` e `…_nasce_agganciata`, che con la pulizia non c'entrano
 *    niente e che resterebbero spenti proprio mentre le fixture scrivono.
 */
const TRIGGER_ANTICANCELLAZIONE = [
  ['shopify_product_identities', 'shopify_product_identities_mai_delete'],
  ['shopify_product_identities', 'shopify_product_identities_mai_truncate'],
  ['shopify_variant_identities', 'shopify_variant_identities_mai_delete'],
  ['shopify_variant_identities', 'shopify_variant_identities_mai_truncate'],
  ['shopify_product_links', 'shopify_product_links_mai_delete'],
  ['shopify_product_links', 'shopify_product_links_mai_truncate'],
  ['shopify_variant_links', 'shopify_variant_links_mai_delete'],
  ['shopify_variant_links', 'shopify_variant_links_mai_truncate'],
  ['shopify_location_links', 'shopify_location_links_mai_delete'],
  ['shopify_location_links', 'shopify_location_links_mai_truncate'],
] as const;

/** Il nome del database di prova, e l'unico su cui questo DDL è ammesso. */
const DATABASE_DI_PROVA = 'vestiflow_test';

/**
 * Prima barriera: l'AMBIENTE dichiarato è quello di prova.
 *
 * ⚠️ **Non basta, e da sola è ingannevole**: dice che `DATABASE_URL_TEST` punta
 *    al posto giusto, non che il client passato ci sia connesso. La seconda
 *    barriera — `esigiConnessioneDiProva` — è quella che conta.
 */
function esigiAmbienteDiProva(): void {
  const ambiente = ambienteIntegrazione();
  if (ambiente.host !== 'localhost:5433' || ambiente.database !== DATABASE_DI_PROVA) {
    throw new Error(
      `⛔ pulizia rifiutata: l'ambiente dichiara ${ambiente.host}/${ambiente.database}, ` +
        `che non è il database di prova.`,
    );
  }
}

/**
 * Seconda barriera, e quella vera: **si chiede alla CONNESSIONE dove si trova**.
 *
 * ⛔ **Controllare `process.env` non dice NIENTE sul client passato**, ed è il
 *    difetto che questa funzione chiude: `conStoricoSbloccato` accetta un
 *    `PrismaClient` qualunque, e il DDL va sulla connessione di QUEL client,
 *    non sull'URL che la barriera ha letto.
 *
 * ⚠️ **La motivazione che avevo scritto qui era SBAGLIATA, e va detto quale**:
 *    «un `new PrismaClient()` nudo legge `DATABASE_URL`, cioè il condiviso».
 *    Dentro la suite di integrazione non è vero — `setup.ts` riscrive
 *    `DATABASE_URL` con la connessione di prova prima che un test parta, e lo
 *    dichiara: «un client nudo ora finisce sul database di prova, che è il
 *    posto giusto».
 *
 * ⭐ **Le due vie per cui la barriera serve davvero sono altre, e sono reali:**
 *
 *    1. un client con `datasources` ESPLICITO e url sbagliata — che è per
 *       giunta l'unica forma ammessa da `check:integration-db` (R3): un
 *       refuso o un copia-incolla, non una distrazione esotica;
 *    2. un chiamante FUORI dalla suite di integrazione, dove `setup.ts` non
 *       è caricato. La suite di CONTRATTO è esattamente quel posto — il suo
 *       config dichiara «nessun `setupFiles` che dirotti il database» — e lì
 *       un client nudo raggiunge il condiviso davvero
 *       (`src/test/contract/shopify-credenziali.ts:131`). Oggi nessuno importa
 *       `conStoricoSbloccato` da lì; la barriera è ciò che rende innocuo il
 *       giorno in cui qualcuno lo farà.
 *
 * ⭐ **Va eseguita sulla STESSA sessione che emetterà il DDL**, cioè sul `tx`,
 *    come primo enunciato della transazione: se rifiuta, il rollback riguarda
 *    una transazione in cui nessun `ALTER TABLE` è mai stato scritto.
 *
 * ⚠️ **Il nome del database è l'unico discriminante buono, ed è misurato su
 *    entrambi i lati**: la connessione di prova risponde `vestiflow_test`, il
 *    condiviso si chiama `postgres` (letto dall'URL, senza connettersi).
 *
 * ⛔ **`inet_server_port()` NON serve, e va detto perché qualcuno lo
 *    aggiungerebbe**: misurato l'08/09/2026, dall'interno del container
 *    risponde **5432**, non 5433 — la 5433 è la porta della mappatura Docker,
 *    che il server non vede. Un controllo sulla porta sarebbe sempre falso.
 */
async function esigiConnessioneDiProva(tx: PrismaTransazione): Promise<void> {
  const righe = await tx.$queryRawUnsafe<{ db: string; utente: string }[]>(
    'SELECT current_database() AS db, current_user AS utente',
  );
  const db = righe[0]?.db;
  if (db !== DATABASE_DI_PROVA) {
    throw new Error(
      `⛔ pulizia rifiutata: il CLIENT è connesso a «${db ?? '(ignoto)'}» ` +
        `come «${righe[0]?.utente ?? '(ignoto)'}», non a «${DATABASE_DI_PROVA}». ` +
        `Nessun DDL è stato emesso.`,
    );
  }
}

/**
 * Esegue `pulizia` con le protezioni anticancellazione spente.
 *
 * ⭐ **Tutto in UNA transazione, sulla STESSA connessione.** In PostgreSQL il
 *    DDL e` transazionale: se qualcosa fallisce — lo spegnimento, la pulizia o
 *    la riaccensione — il rollback rimette i trigger com'erano. Non c'e` un
 *    `finally` che possa a sua volta fallire a meta`, perche` non c'e` un
 *    `finally`: e` il database a garantire il ripristino.
 *
 * ⚠️ **La pulizia riceve `tx` e DEVE usarlo**: eseguita sul client esterno
 *    girerebbe fuori dalla transazione e non vedrebbe i trigger spenti.
 *
 * ⚠️ **Non e` una barriera di privilegi.** Chi si connette come owner puo`
 *    emettere lo stesso DDL da qualunque punto: a tenere questo permesso nei
 *    test e` la guardia statica `check:storico-non-cancellabile`, che fa
 *    fallire il lint — non il database.
 *
 * ⭐ **Due barriere, e la seconda e` quella che protegge davvero**: l'ambiente
 *    dichiarato prima di aprire la transazione, e la CONNESSIONE come primo
 *    enunciato dentro di essa. Un client sbagliato viene rifiutato **prima**
 *    che un solo `ALTER TABLE` sia stato scritto.
 */
/**
 * Fotografia di CHI sta occupando il database, presa mentre qualcosa fallisce.
 *
 * ⛔ **Serve presa SUL MOMENTO, non dopo.** L'instabilita' di `DA-FARE` §21-bis
 *    e' stata osservata due volte e non diagnosticata proprio perche' la
 *    verifica arrivava a fatto compiuto: sessioni e lock erano gia' spariti, e
 *    il dato utile con loro.
 *
 * ⚠️ Non modifica niente e non fallisce mai: un attrezzo di diagnosi che
 *    esplode nasconde l'errore che doveva spiegare.
 */
export async function fotografiaConcorrenza(prisma?: PrismaClient): Promise<string> {
  // ⛔ **La diagnosi non puo' dipendere dal client che sta indagando.**
  //    Rilevato dal proprietario: la fotografia usava lo STESSO client della
  //    pulizia. Ma il momento in cui serve e' precisamente quello in cui quel
  //    client e' occupato — una transazione appesa ne tiene una connessione, e
  //    se il pool e' esaurito la fotografia si mette in coda insieme a tutto il
  //    resto. Cioe' non parte proprio quando serve.
  //
  // ⭐ Client DEDICATO, con una connessione sua (`connection_limit=1`) e
  //    un'attesa di pool cortissima: la diagnosi entra da una porta che nessuno
  //    sta usando. Si apre, guarda e si chiude.
  //
  // ⚠️ **Confinata ai test**: vive in `fixture.ts`, che nessun percorso
  //    applicativo importa.
  const { client, chiudi } = clientDiDiagnosi(prisma);
  try {
    // ⛔ **Con un tetto**: senza, una diagnosi che non riesce a connettersi
    //    resterebbe appesa e diventerebbe essa stessa parte del guasto.
    return await conTetto(fotografiaConDettaglio(client), FOTOGRAFIA_MS);
  } catch (errore) {
    return `fotografia non riuscita: ${errore instanceof Error ? errore.message : String(errore)}`;
  } finally {
    await chiudi();
  }
}

/**
 * Un client con UNA connessione propria, per guardare mentre il resto e' fermo.
 *
 * ⚠️ Se la costruzione fallisce — variabile assente, ambiente non dichiarato —
 *    si ripiega sul client passato: una diagnosi parziale vale piu' di nessuna.
 */
function clientDiDiagnosi(ripiego?: PrismaClient): {
  client: PrismaClient;
  chiudi: () => Promise<void>;
} {
  try {
    const url = new URL(ambienteIntegrazione().databaseUrl);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '2');
    const client = new PrismaClient({
      datasources: { db: { url: url.toString() } },
      log: ['error'],
    });
    return { client, chiudi: () => client.$disconnect().catch(() => undefined) };
  } catch {
    if (!ripiego) {
      throw new Error('nessun client disponibile per la diagnosi');
    }
    return { client: ripiego, chiudi: async () => undefined };
  }
}

/** Il tetto di tempo di un'operazione di diagnosi. */
async function conTetto<T>(operazione: Promise<T>, tetto: number): Promise<T> {
  let sveglia: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operazione,
      new Promise<never>((_, rifiuta) => {
        sveglia = setTimeout(() => rifiuta(new Error(`diagnosi non conclusa entro ${tetto}ms`)), tetto);
        sveglia.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(sveglia);
  }
}

/**
 * La fotografia vera e propria.
 *
 * ⛔ **Senza `try/catch` qui dentro**: un errore deve arrivare a chi ha messo il
 *    tetto, o si perderebbe la differenza fra «non sono riuscito a guardare» e
 *    «ho guardato e non c'era niente».
 */
async function fotografiaConDettaglio(prisma: PrismaClient): Promise<string> {
  {
    const sessioni = await prisma.$queryRawUnsafe<
      {
        pid: number;
        state: string | null;
        attesa: string | null;
        eta_transazione: string | null;
        bloccanti: number[];
        query: string | null;
      }[]
    >(`
      SELECT a.pid,
             a.state,
             a.wait_event_type AS attesa,
             (now() - a.xact_start)::text AS eta_transazione,
             pg_blocking_pids(a.pid) AS bloccanti,
             left(a.query, 120) AS query
        FROM pg_stat_activity a
       WHERE a.datname = current_database() AND a.pid <> pg_backend_pid()
       ORDER BY a.xact_start NULLS LAST
    `);
    // ⭐ **Quali relazioni, non quanti lock.** Un conteggio dice che qualcosa
    //    e' conteso; il nome della relazione dice CHE COSA, ed e' il dato da cui
    //    un'indagine puo' ripartire davvero. Misurato l'08/09/2026: senza
    //    questo, la fotografia dello stallo riportava «lock_non_concessi=1» e
    //    nient'altro.
    const contese = await prisma.$queryRawUnsafe<
      { pid: number; relazione: string | null; modo: string; concesso: boolean }[]
    >(`
      SELECT l.pid,
             CASE WHEN l.relation IS NULL THEN NULL ELSE l.relation::regclass::text END AS relazione,
             l.mode AS modo,
             l.granted AS concesso
        FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid
       WHERE a.datname = current_database() AND NOT l.granted
       ORDER BY l.pid
    `);
    const righeContese = contese.length
      ? contese
          .map((c) => `  ATTESA pid=${c.pid} relazione=${c.relazione ?? '-'} modo=${c.modo}`)
          .join('\n')
      : '  (nessun lock in attesa in questo istante)';
    return (
      `sessioni=${sessioni.length} lock_non_concessi=${contese.length}\n` +
      `${righeContese}\n` +
      sessioni
        .map(
          (s) =>
            `  pid=${s.pid} stato=${s.state ?? '-'} attesa=${s.attesa ?? '-'} ` +
            `eta_tx=${s.eta_transazione ?? '-'} bloccanti=[${s.bloccanti.join(',')}] ${s.query ?? ''}`,
        )
        .join('\n')
    );
  }
}

/**
 * ⚠️ **Oltre questa soglia la pulizia viene segnalata anche se riesce.**
 *
 * ⛔ Non e' un timeout: e' una spia. `vitest` interrompe l'hook a **60 s**
 *    (`hookTimeout`) mentre questa transazione ne ha **120** — cioe' una pulizia
 *    lenta puo' essere abbandonata da vitest e restare APERTA nel database,
 *    coi lock esclusivi del `DISABLE TRIGGER` in mano, per un altro minuto.
 *    E' il candidato principale di §21-bis, e va **misurato** prima di
 *    correggerlo: se la pulizia normale dura un secondo, quella spiegazione ha
 *    bisogno a sua volta di una causa.
 */
const PULIZIA_LENTA_MS = 5_000;

/**
 * Quando la spia INDIPENDENTE fotografa la concorrenza.
 *
 * ⛔ **Sotto `lock_timeout`, non sopra** — corretto l'08/09/2026 dopo averlo
 *    misurato. A 15 s la spia scattava insieme alla rinuncia del lock, cioe'
 *    quando la contesa era gia' finita: la fotografia riportava
 *    «lock_non_concessi=0», che e' il contrario di quello che serve. A 8 s
 *    scatta **mentre** l'attesa e' in corso, e vede la relazione contesa.
 */
const SPIA_PULIZIA_MS = 8_000;

/**
 * Il bilancio dei tempi della pulizia — e cio' che conta e' la SOMMA.
 *
 * ⛔ **Una scala ordinata non dimostra che il totale stia dentro l'hook**, ed e'
 *    l'errore che avevo fatto: `15 < 30 < 45 < 60` sembrava una prova, e non lo
 *    era. Ogni pulizia e' fatta di **quattro** pezzi in sequenza, e il primo non
 *    era nella scala:
 *
 * ```text
 *   1. maxWait      attesa di una connessione dal pool, PRIMA di iniziare
 *   2. transazione  esecuzione, e il rollback che la chiude
 *   3. diagnosi     la fotografia della concorrenza
 *   ────────────────────────────────────────────────────────────────────
 *      il totale deve stare sotto `hookTimeout`, con margine
 * ```
 *
 * ⛔ **Col bilancio precedente il totale sforava**: `maxWait` 30 s + transazione
 *    45 s = **75 s** prima ancora della fotografia, contro un hook di 60. La
 *    scala era ordinata e la somma no — cioe' lo stallo muto restava possibile
 *    esattamente come prima, solo per un'altra strada.
 *
 * ⚠️ **E l'hook non copre solo la pulizia**: `beforeEach` fa `svuota()` **e**
 *    `creaDataset()`. Il margine serve anche a quello.
 *
 * ⭐ I numeri, e ognuno con la sua ragione:
 *
 * | soglia               | valore | perche'                                                     |
 * | -------------------- | ------ | ----------------------------------------------------------- |
 * | `maxWait`            |  5 s   | se il pool non da' una connessione in 5 s, il problema e' il pool: fallire subito lo dice, aspettare 30 s lo nasconde |
 * | `lock_timeout`       | 10 s   | sei volte la pulizia piu' lenta mai misurata (1 639 ms)      |
 * | `statement_timeout`  | 15 s   | una singola istruzione impantanata cede comunque             |
 * | timeout transazione  | 20 s   | dodici volte la pulizia piu' lenta                           |
 * | fotografia           |  5 s   | la diagnosi non puo' costare piu' del guasto che descrive    |
 *
 * ```text
 *   caso peggiore   5 + 20 + 5 = 30 s      hookTimeout 60 s      margine 30 s
 * ```
 *
 * ⭐ La somma non e' lasciata a un commento: la verifica la prova
 *    `pulizia-bloccata`, che misura il tempo REALE di una pulizia bloccata —
 *    diagnosi compresa — e lo pretende sotto meta' dell'hook.
 */
const MAX_WAIT_MS = 5_000;
const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 15_000;
const TRANSAZIONE_PULIZIA_MS = 20_000;
const FOTOGRAFIA_MS = 5_000;

/** Il tetto che la pulizia, diagnosi compresa, non deve superare. */
export const TETTO_PULIZIA_MS = MAX_WAIT_MS + TRANSAZIONE_PULIZIA_MS + FOTOGRAFIA_MS;

/**
 * Da quanto una transazione altrui deve essere aperta perche' valga la pena
 * nominarla.
 *
 * ⚠️ Le prove di concorrenza ne aprono apposta, e durano meno di questo: sotto
 *    i 2 s si avrebbe rumore invece di segnale.
 */
const TRANSAZIONE_ORFANA_MS = 2_000;

/**
 * Il ritardo dell'EVENT LOOP di questo processo, misurato di continuo.
 *
 * ⭐ **Il dato che ha ribaltato la diagnosi dell'08/09/2026.** Un giro rosso ha
 *    riportato, nella stessa esecuzione:
 *
 * ```text
 *   The timeout for this transaction was 20000 ms,
 *   however 101339 ms passed since the start of the transaction
 *   TRUNCATE …  stato=active  attesa=-  bloccanti=[]   ← da 8 secondi
 *   fotografia non riuscita: diagnosi non conclusa entro 5000ms
 * ```
 *
 *    Cioe': **nessuna contesa**. Nessun lock in attesa, nessun bloccante — e
 *    centouno secondi fra due query della stessa transazione. Quel tempo non si
 *    perde nel database: si perde **qui**, in un processo che non gira.
 *
 * ⚠️ **Separa le due famiglie di causa**, che i log non distinguevano: contesa
 *    sui lock (il database aspetta) contro fame di CPU o di I/O (il client non
 *    chiede). Vogliono rimedi opposti, e finora si era guardata solo la prima.
 */
const ritardoEventLoop = { massimoMs: 0, ultimaMisuraMs: 0 };
{
  const PASSO_MS = 1_000;
  let atteso = Date.now() + PASSO_MS;
  const battito = setInterval(() => {
    const ora = Date.now();
    const ritardo = ora - atteso;
    atteso = ora + PASSO_MS;
    ritardoEventLoop.ultimaMisuraMs = Math.max(0, ritardo);
    if (ritardo > ritardoEventLoop.massimoMs) {
      ritardoEventLoop.massimoMs = ritardo;
    }
  }, PASSO_MS);
  // ⚠️ `unref`: un battito che tiene vivo il processo impedirebbe alla suite di
  //    terminare — un difetto introdotto dalla diagnosi.
  battito.unref?.();
}

/**
 * Lo stato del PROCESSO, accanto a quello del database.
 *
 * ⭐ **Le due metà della stessa domanda.** La fotografia dice se il database
 *    aspetta qualcuno; questa dice se è il processo a non girare. Senza la
 *    seconda, un ritardo del client si legge come una contesa che non c'è — ed
 *    è esattamente l'errore in cui questa indagine è caduta per mezza giornata.
 */
function statoDelProcesso(): string {
  const memoria = process.memoryUsage();
  const mb = (byte: number) => Math.round(byte / 1024 / 1024);
  return (
    `  ritardo event loop: ultimo=${ritardoEventLoop.ultimaMisuraMs}ms ` +
    `massimo=${ritardoEventLoop.massimoMs}ms · ` +
    `heap=${mb(memoria.heapUsed)}/${mb(memoria.heapTotal)}MB rss=${mb(memoria.rss)}MB · ` +
    `attivo da ${Math.round(process.uptime())}s`
  );
}

/** Il nome della prova che ha chiamato la pulizia la volta PRECEDENTE. */
let provaPrecedente = '(nessuna: prima pulizia del file)';

/**
 * Il nome della prova in corso, se il runner lo espone.
 *
 * ⚠️ **Difensiva di proposito**: `fixture.ts` gira sotto vitest, ma una sonda di
 *    diagnosi non deve poter far cadere la suite che sorveglia per un'API del
 *    runner cambiata sotto i piedi. Se il nome non c'e', si dice che non c'e'.
 */
function nomeProvaCorrente(): string {
  try {
    const stato = (globalThis as { expect?: { getState?: () => { currentTestName?: string } } })
      .expect?.getState?.();
    return stato?.currentTestName ?? '(prova non dichiarata dal runner)';
  } catch {
    return '(prova non dichiarata dal runner)';
  }
}

/**
 * Cerca transazioni altrui gia' aperte PRIMA di iniziare, e le nomina.
 *
 * ⭐ **E' il salto da «aspettare il sintomo» a «cercare il precursore».** Lo
 *    stallo di §21-bis si vede solo quando qualcuno blocca davvero la pulizia:
 *    una transazione lasciata aperta che NON blocca nessuno passa inosservata,
 *    e resta li' pronta a bloccare il giro dopo. Questa sonda la vede comunque.
 *
 * ⭐ **E dice DOPO QUALE PROVA e' comparsa**, che e' il dato che mancava: chi
 *    legge il log non trova «c'era una transazione aperta», trova «dopo la
 *    prova X c'era una transazione aperta da 3 s, e la sua ultima query era
 *    questa».
 *
 * ⚠️ **Non fallisce mai e non rallenta**: una query sola, con un tetto di un
 *    secondo. Una sonda che rompe la suite che sorveglia non serve a nessuno.
 */
async function sondaTransazioniOrfane(prisma: PrismaClient, provaCorrente: string): Promise<void> {
  try {
    const orfane = await conTetto(
      prisma.$queryRawUnsafe<{ pid: number; eta: string; query: string | null }[]>(
        `SELECT a.pid,
                (now() - a.xact_start)::text AS eta,
                left(a.query, 160) AS query
           FROM pg_stat_activity a
          WHERE a.datname = current_database()
            AND a.pid <> pg_backend_pid()
            AND a.state = 'idle in transaction'
            AND a.xact_start < now() - ($1 || ' milliseconds')::interval`,
        String(TRANSAZIONE_ORFANA_MS),
      ),
      1_000,
    );
    if (orfane.length > 0) {
      console.warn(
        `[diagnosi §21-bis] TRANSAZIONE ORFANA prima di «${provaCorrente}» ` +
          `(la precedente era «${provaPrecedente}»):\n` +
          orfane
            .map((o) => `  pid=${o.pid} aperta_da=${o.eta} ultima_query=${o.query ?? '-'}`)
            .join('\n'),
      );
    }
  } catch {
    // Una sonda muta e' meglio di una sonda che fa cadere la pulizia.
  }
}

export async function conStoricoSbloccato(
  prisma: PrismaClient,
  pulizia: (tx: PrismaTransazione) => Promise<void>,
): Promise<void> {
  esigiAmbienteDiProva();
  const inizio = Date.now();

  // ⭐ Si guarda PRIMA di iniziare: chi ha lasciato aperta una transazione lo
  //    ha fatto nel test precedente, non in questo.
  const provaCorrente = nomeProvaCorrente();
  await sondaTransazioniOrfane(prisma, provaCorrente);
  provaPrecedente = provaCorrente;

  // ⛔ **La spia scatta MENTRE la pulizia e` ancora appesa**, e questo e` il
  //    punto: `vitest` abbandona l'hook a 60 s senza sollevare dentro questa
  //    funzione, quindi ne` il `catch` ne` il `finally` vengono raggiunti in
  //    tempo utile. Misurato l'08/09/2026: la fotografia presa nel `catch` non
  //    e` mai stata scattata, perche` il `catch` non c'e` mai arrivato.
  const spia = setTimeout(() => {
    void fotografiaConcorrenza(prisma).then((fotografia) => {
      console.warn(
        `[diagnosi §21-bis] pulizia ANCORA IN CORSO dopo ${SPIA_PULIZIA_MS}ms ` +
          `(durata normale misurata: 104-1639ms)\n${statoDelProcesso()}\n${fotografia}`,
      );
    });
  }, SPIA_PULIZIA_MS);
  spia.unref?.();
  let errore: unknown;
  try {
    await conStoricoSbloccatoInterno(prisma, pulizia);
  } catch (caduta) {
    errore = caduta;
  } finally {
    // ⛔ **Nel `finally`, non nel solo ramo d'errore.** Riprodotto l'08/09/2026:
    //    cancellata solo in caso di errore, la spia restava armata dopo OGNI
    //    pulizia riuscita — cioe` dopo ognuno dei ~660 `beforeEach` di una
    //    suite. Ogni timer superstite avrebbe poi aperto una connessione per
    //    fotografare una concorrenza che non serviva piu`.
    //
    // ⚠️ **Questo NON e' la causa dell'instabilita' di §21-bis**, e non va
    //    presentato come tale: quel difetto e' stato osservato ai giri 3 e 4,
    //    quando la spia non esisteva ancora. E` un difetto in piu', introdotto
    //    dalla strumentazione stessa.
    clearTimeout(spia);
  }
  if (errore !== undefined) {
    // ⛔ La fotografia si prende PRIMA di rilanciare: un istante dopo, chi
    //    teneva il lock puo' essere gia' sparito — ed e' esattamente quello
    //    che e' successo le due volte in cui il difetto si e' visto.
    const fotografia = await fotografiaConcorrenza(prisma);
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    throw new Error(
      `conStoricoSbloccato fallita dopo ${Date.now() - inizio}ms: ${messaggio}\n` +
        `── stato del processo ──\n${statoDelProcesso()}\n` +
        `── concorrenza al momento del fallimento ──\n${fotografia}`,
    );
  }
  const durata = Date.now() - inizio;
  if (durata > PULIZIA_LENTA_MS) {
    console.warn(
      `[diagnosi §21-bis] pulizia riuscita ma LENTA: ${durata}ms ` +
        `(hookTimeout vitest = 60000ms, timeout transazione = 120000ms)\n` +
        (await fotografiaConcorrenza(prisma)),
    );
  }
}

/**
 * Esegue un passo della pulizia dichiarando a quale FASE appartiene.
 *
 * ⭐ **Il nome della fase e` meta` della diagnosi.** «Lock timeout» da solo non
 *    dice se a fermarsi sia stato lo spegnimento dei trigger, il TRUNCATE o la
 *    riaccensione — e sono tre contese diverse, con tre colpevoli diversi.
 */
async function inFase(fase: string, passo: () => Promise<void>): Promise<void> {
  try {
    await passo();
  } catch (caduta: unknown) {
    const messaggio = caduta instanceof Error ? caduta.message : String(caduta);
    throw new Error(`bloccata durante «${fase}»: ${messaggio}`, { cause: caduta });
  }
}

async function conStoricoSbloccatoInterno(
  prisma: PrismaClient,
  pulizia: (tx: PrismaTransazione) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // ⛔ PRIMO enunciato, prima di qualunque DDL: chi mi ha passato questo
      //    client puo` averlo costruito altrove.
      await esigiConnessioneDiProva(tx);

      // ── §21-bis · lo stallo deve DIRE da che cosa e` bloccato ────────────
      //
      // ⛔ **`ALTER TABLE … DISABLE TRIGGER` chiede un ACCESS EXCLUSIVE.**
      //    Basta che un'altra sessione tenga un lock qualunque su quella
      //    tabella — anche il solo ACCESS SHARE di una `SELECT` dentro una
      //    transazione rimasta aperta — perche` questo DDL si metta in coda. E
      //    in coda ci resta: fino al timeout della transazione.
      //
      // ⛔ **Non e` «alzare i timeout»: e` il contrario.** Con l'attesa a 120 s
      //    e l'hook di vitest a 60, il primo a scadere e` sempre l'hook — che
      //    abbandona senza sollevare qui dentro. Il risultato e` `Hook timed
      //    out in 60000ms`, che non nomina ne` la tabella ne` chi la teneva:
      //    e` esattamente il difetto muto di `DA-FARE` §21-bis, osservato due
      //    volte e mai diagnosticato.
      //
      // ⭐ Con `lock_timeout`, chi non ottiene il lock riceve **55P03
      //    lock_not_available** dopo 15 s, con il nome della relazione. L'errore
      //    risale, il `catch` viene raggiunto davvero, e la fotografia della
      //    concorrenza — che esiste gia` — viene scattata e allegata.
      //
      // ⚠️ **`SET LOCAL`**: vale fino al commit o al rollback di QUESTA
      //    transazione, e non tocca nessun'altra sessione.
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);

      // ⛔ **PostgreSQL non dice QUALE istruzione ha rinunciato.** Il suo
      //    messaggio e` «canceling statement due to lock timeout», e basta —
      //    misurato l'08/09/2026. La FASE la conosce solo questa funzione, ed
      //    e` il primo dato che serve a chi indaga: senza, si sa che qualcosa
      //    era bloccato ma non su che cosa.
      //
      // ⚠️ **E la fase bloccata NON e` quella che sembrava.** `ALTER TABLE …
      //    DISABLE TRIGGER` prende un SHARE ROW EXCLUSIVE, che convive con
      //    l'ACCESS SHARE di una `SELECT` altrui: passa. A fermarsi e` il
      //    **TRUNCATE**, che l'ACCESS EXCLUSIVE lo chiede davvero. Misurato
      //    riproducendo lo stallo, non dedotto.
      await inFase('spegnimento delle protezioni', async () => {
        for (const [tabella, trigger] of TRIGGER_ANTICANCELLAZIONE) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${tabella}" DISABLE TRIGGER "${trigger}"`);
        }
      });
      await inFase('pulizia (TRUNCATE / DELETE)', () => pulizia(tx));
      await inFase('riaccensione delle protezioni', async () => {
        for (const [tabella, trigger] of TRIGGER_ANTICANCELLAZIONE) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${tabella}" ENABLE TRIGGER "${trigger}"`);
        }
      });
    },
    // ⛔ **Il timeout della transazione sta SOTTO l'hook di vitest**, e questa
    //    e` la meta` che mancava: a 120 s scadeva sempre prima l'hook (60 s), e
    //    l'errore che arrivava a chi guardava non era quello del database ma un
    //    anonimo `Hook timed out`. Ora e` la transazione a cedere per prima, e
    //    cede dicendo perche`.
    //
    // ⚠️ Il TRUNCATE del collaudo distruttivo tocca tutte le tabelle: il
    //    default di 5 secondi resta insufficiente — 45 s sono nove volte
    //    tanto, e ventisette volte la pulizia piu` lenta mai misurata.
    { timeout: TRANSAZIONE_PULIZIA_MS, maxWait: MAX_WAIT_MS },
  );
}

export async function svuota(prisma: PrismaClient): Promise<void> {
  // ⭐ La barriera su host e database vive in `conStoricoSbloccato`: una sola
  //    volta, per tutti i chiamanti.

  /*
    ⛔ **Lo storico dei collegamenti Shopify rifiuta DELETE e TRUNCATE**, ed e'
       voluto: un GID cancellato tornerebbe riassegnabile a un altro articolo
       (misurato il 07/09/2026). Il `CASCADE` qui sotto ci arriva partendo da
       `tenants`, quindi la pulizia va sbloccata esplicitamente.

    ⛔ **E il DDL NON e' precluso all'app.** Qui c'era scritto che «richiede
       l'ownership, quindi non e' un percorso che un servizio possa imboccare»:
       e' falso, perche' l'API si connette proprio come OWNER del database — e'
       la stessa scelta che le fa scavalcare la RLS (`regole-sicurezza`). Con
       quel ruolo, `ALTER TABLE … DISABLE TRIGGER` da un servizio riesce.

    ⭐ **A tenere questo permesso nei test e' quindi una guardia STATICA**, non
       un privilegio: `check:storico-non-cancellabile` fa fallire il lint se un
       `DISABLE TRIGGER` compare fuori da `api/src/test/`. Ferma chi lo scrive,
       non chi lo esegue — che e' tutto cio' che una guardia puo' fare, e va
       detto invece che lasciato intendere.

    ⚠️ E la barriera su host e database e' gia' passata sopra: senza,
       questo blocco spegnerebbe le protezioni di un database qualunque.
  */
  await conStoricoSbloccato(prisma, async (tx) => {
    // Solo le tabelle che queste prove toccano, in ordine di dipendenza.
    // `CASCADE` copre le righe figlie senza doverle elencare tutte.
    await tx.$executeRawUnsafe(
      'TRUNCATE TABLE "invoice_sales_ddt_links", "document_lines", "documents", ' +
        '"user_locations", "users", "locations", "tenants" RESTART IDENTITY CASCADE',
    );
  });
}

/** Crea il dataset. Idempotente: svuota prima di scrivere. */
export async function creaDataset(prisma: PrismaClient): Promise<void> {
  await svuota(prisma);

  await prisma.tenant.createMany({
    data: [
      { id: IDS.tenantA, name: 'Tenant A — integrazione' },
      { id: IDS.tenantB, name: 'Tenant B — integrazione' },
    ],
  });

  await prisma.location.createMany({
    data: [
      { id: IDS.locA1, tenantId: IDS.tenantA, name: 'A1 — sede assegnata', licensedInVf: true },
      { id: IDS.locA2, tenantId: IDS.tenantA, name: 'A2 — sede NON assegnata', licensedInVf: true },
      { id: IDS.locB1, tenantId: IDS.tenantB, name: 'B1 — altro tenant', licensedInVf: true },
    ],
  });

  // ⚠️ I permessi sono quelli REALI del ruolo: il gate di sezione deve passare,
  //    altrimenti si misurerebbe un 403 di permesso invece che di sede — e la
  //    prova direbbe la cosa giusta per la ragione sbagliata.
  // ⚠️ I nomi sono quelli generati da `docViewPermission`/`docManagePermission`
  //    sulle famiglie di `DOCUMENT_PERMISSION_FAMILIES`: la famiglia della
  //    fattura si chiama `invoice`, non `sales_invoice`.
  const permessiDocumenti = [
    'section.documents',
    'section.inventory',
    'section.sales',
    'doc.invoice.view',
    'doc.invoice.manage',
    'doc.sales_ddt.view',
    'doc.sales_ddt.manage',
    'inventory.manage',
    'retail.register',
  ];

  await prisma.user.createMany({
    data: [
      {
        id: IDS.utenteA1,
        tenantId: IDS.tenantA,
        authUserId: IDS.authA1,
        email: 'commesso.a1@integrazione.local',
        displayName: 'Commesso A1',
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: false,
        permissions: permessiDocumenti,
      },
      {
        id: IDS.utenteSupervisore,
        tenantId: IDS.tenantA,
        authUserId: IDS.authSupervisore,
        email: 'supervisore@integrazione.local',
        displayName: 'Supervisore multi-sede',
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: false,
        // ⭐ È il permesso che distingue LETTURA da SCRITTURA: la prima lo
        //    onora, la seconda no. Serve a dimostrare che restano due cose.
        permissions: [...permessiDocumenti, 'inventory.view_all_locations'],
      },
    ],
  });

  // Entrambi assegnati alla SOLA A1: la differenza fra i due è il permesso.
  await prisma.userLocation.createMany({
    data: [
      { userId: IDS.utenteA1, locationId: IDS.locA1, tenantId: IDS.tenantA },
      { userId: IDS.utenteSupervisore, locationId: IDS.locA1, tenantId: IDS.tenantA },
    ],
  });

  const documento = (id: string, tenantId: string, locationId: string, numero: number) => ({
    id,
    tenantId,
    locationId,
    type: DocumentType.invoice,
    status: DocumentStatus.draft,
    year: 2026,
    number: numero,
    documentDate: new Date('2026-08-01'),
    // Obbligatorio nello schema: e lo snapshot di chi ha creato il
    // documento, che resta anche se l’utente viene poi rimosso.
    createdByName: 'Fixture integrazione',
  });

  await prisma.document.createMany({
    data: [
      documento(IDS.docA1, IDS.tenantA, IDS.locA1, 1),
      documento(IDS.docA2, IDS.tenantA, IDS.locA2, 2),
      documento(IDS.docB1, IDS.tenantB, IDS.locB1, 3),
      {
        ...documento(IDS.ddtA2, IDS.tenantA, IDS.locA2, 4),
        type: DocumentType.sales_ddt,
      },
    ],
  });
}
