import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ambienteIntegrazione } from './env';
import { fotografiaConcorrenza, svuota, TETTO_PULIZIA_MS } from './fixture';
import { creaClientIntegrazione } from './prisma';

/** Lo stesso `hookTimeout` dichiarato in `vitest.integration.config.ts`. */
const HOOK_TIMEOUT_MS = 60_000;

/**
 * §21-bis · **lo stallo della pulizia deve poter essere LETTO.**
 *
 * ⛔ **Il difetto non è che la pulizia possa bloccarsi: è che si bloccava in
 *    silenzio.** Basta un'altra sessione con una transazione aperta su una
 *    tabella che la pulizia tronca — anche solo per averci fatto una `SELECT` —
 *    perché il `TRUNCATE` si metta in coda. Con la transazione a 120 s e l'hook
 *    di vitest a 60, a scadere era sempre l'hook: `Hook timed out in 60000ms`,
 *    senza la fase, senza la relazione, senza il pid di chi la teneva.
 *
 * ⚠️ **A bloccarsi è il TRUNCATE, non lo spegnimento dei trigger**, e la
 *    distinzione è misurata: `ALTER TABLE … DISABLE TRIGGER` prende uno SHARE
 *    ROW EXCLUSIVE, che convive con l'ACCESS SHARE di una `SELECT` altrui —
 *    quello passa. È il `TRUNCATE` a chiedere l'ACCESS EXCLUSIVE.
 *
 * ⭐ **Questa prova riproduce quel meccanismo di proposito** e verifica che
 *    oggi produca un errore diagnostico invece di uno stallo muto.
 *
 * ⛔ **E NON è la causa dell'instabilità di §21-bis**, che è stata poi trovata
 *    altrove: il PostgreSQL di prova si saturava fino a riavviarsi — un solo
 *    fsync di checkpoint misurato a 57,5 s dentro un hook da 60. Questa prova
 *    resta a sorvegliare il caso di contesa, che è reale ma era un'altra cosa.
 */
describe('Pulizia bloccata da una transazione altrui (§21-bis)', () => {
  let prisma: PrismaClient;
  /** La sessione che tiene il lock, e come la si lascia andare. */
  let rilascia: (() => void) | null = null;
  let bloccante: Promise<unknown> | null = null;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterEach(async () => {
    // ⛔ Si libera SEMPRE, anche se la prova è fallita: una sessione lasciata
    //    coi lock in mano, dentro un'indagine su sessioni lasciate coi lock in
    //    mano, avvelenerebbe tutto ciò che viene dopo.
    rilascia?.();
    await bloccante?.catch(() => undefined);
    rilascia = null;
    bloccante = null;
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  /**
   * Attende che l'unica connessione del client risulti davvero impegnata.
   *
   * ⚠️ **Non un `sleep`**: si guarda lo stato vero, o la prova misurerebbe la
   *    velocità della macchina invece della saturazione.
   *
   * ⛔ **E si guarda dal client LIBERO**, non da quello che si sta saturando:
   *    interrogare il client occupato significherebbe mettersi in coda dietro
   *    la transazione che si vuole osservare.
   */
  async function attendiConnessioneOccupata(): Promise<void> {
    for (let tentativo = 0; tentativo < 200; tentativo += 1) {
      const righe = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_stat_activity
          WHERE datname = current_database() AND state = 'idle in transaction'`,
      );
      if ((righe[0]?.n ?? 0) > 0) {
        return;
      }
      await new Promise((risolvi) => setTimeout(risolvi, 25));
    }
    throw new Error('la connessione non risulta occupata: la prova non sta saturando niente');
  }

  /**
   * Apre una transazione che tocca una tabella protetta e la tiene aperta.
   *
   * ⚠️ **Una `SELECT` basta**: prende un ACCESS SHARE, che è incompatibile con
   *    l'ACCESS EXCLUSIVE del `DISABLE TRIGGER`. Non serve nessuna scrittura, e
   *    questo è il punto — il difetto non richiede una prova «cattiva», ne
   *    basta una distratta.
   */
  async function trattieniUnaTabellaProtetta(): Promise<number> {
    let dichiaraPid!: (pid: number) => void;
    let pidFallito!: (errore: unknown) => void;
    const pidPronto = new Promise<number>((risolvi, rifiuta) => {
      dichiaraPid = risolvi;
      pidFallito = rifiuta;
    });
    pidPronto.catch(() => undefined);
    const attesa = new Promise<void>((risolvi) => {
      rilascia = risolvi;
    });

    bloccante = prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT count(*) FROM shopify_product_identities');
        const righe = await tx.$queryRawUnsafe<{ pid: number }[]>('SELECT pg_backend_pid() AS pid');
        dichiaraPid(righe[0]!.pid);
        await attesa;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    bloccante.catch(() => undefined);
    bloccante.then(
      () => pidFallito(new Error('la transazione bloccante si è chiusa da sola')),
      (errore: unknown) => pidFallito(errore),
    );
    return pidPronto;
  }

  it(
    'la pulizia bloccata FALLISCE dicendo la tabella e chi la teneva',
    async () => {
      const pidBloccante = await trattieniUnaTabellaProtetta();

      // ⭐ La spia scatta MENTRE l'attesa è in corso e fotografa la relazione
      //    contesa: si cattura, perché è l'altra metà della diagnosi.
      const avvisi: string[] = [];
      const warnOriginale = console.warn;
      console.warn = (...pezzi: unknown[]) => {
        avvisi.push(pezzi.map(String).join(' '));
      };

      const inizio = Date.now();
      let errore: unknown;
      try {
        await svuota(prisma);
      } catch (caduta) {
        errore = caduta;
      } finally {
        console.warn = warnOriginale;
      }
      const durata = Date.now() - inizio;

      // ⛔ **Deve fallire.** Se riuscisse, vorrebbe dire che il DDL non ha
      //    incontrato il lock, e la prova non starebbe misurando niente.
      expect(errore).toBeDefined();
      const messaggio = String(errore);

      // ⭐ 1 · cede la TRANSAZIONE, non l'hook: ben prima dei 60 s di vitest.
      expect(durata).toBeLessThan(40_000);

      // ⭐ 2 · l'errore nomina il guasto…
      expect(messaggio).toMatch(/lock timeout|lock_not_available|55P03/i);

      // ⭐ 3 · …e la FASE in cui è avvenuto. ⚠️ È il TRUNCATE, non lo
      //        spegnimento dei trigger: `ALTER TABLE … DISABLE TRIGGER` prende
      //        uno SHARE ROW EXCLUSIVE, che convive con l'ACCESS SHARE di una
      //        `SELECT` altrui. Misurato, non dedotto.
      expect(messaggio).toContain('bloccata durante «pulizia (TRUNCATE / DELETE)»');

      // ⭐ 4 · e porta con sé la fotografia, col pid di chi teneva la tabella:
      //        è la riga da cui un'indagine può ripartire.
      expect(messaggio).toContain('concorrenza al momento del fallimento');
      expect(messaggio).toContain(String(pidBloccante));
      expect(messaggio).toContain('idle in transaction');

      // ⭐ 5 · e la spia, scattata a metà dell'attesa, ha visto la RELAZIONE
      //        contesa — il dato che una fotografia presa a fatto compiuto non
      //        può più avere, perché a quel punto il lock non è più in coda.
      const fotografiaInCorso = avvisi.find((a) => a.includes('pulizia ANCORA IN CORSO'));
      expect(fotografiaInCorso).toBeDefined();
      expect(fotografiaInCorso).toMatch(/ATTESA pid=\d+ relazione=\w+/);
      expect(fotografiaInCorso).toContain('AccessExclusiveLock');
    },
    60_000,
  );

  it('il BILANCIO dichiarato sta sotto l hook, con margine per il resto dell hook', () => {
    // ⛔ **Questa è la guardia che mancava**, e la prima stesura non l'aveva:
    //    misuravo il tempo reale contro un tetto **calcolato dalle stesse
    //    costanti**, quindi il tetto si alzava insieme a loro. Rimettendo
    //    `maxWait` a 30 s e la transazione a 45 la prova restava verde — cioè
    //    non sorvegliava niente.
    //
    // ⭐ Qui il confronto è con l'hook, che è un numero **esterno**: se qualcuno
    //    alza una soglia oltre il budget, questa prova diventa rossa.
    //
    // ⚠️ Metà dell'hook, non l'hook intero: `beforeEach` fa `svuota()` **e**
    //    `creaDataset()`, e il margine deve bastare anche al secondo.
    expect(TETTO_PULIZIA_MS).toBeLessThanOrEqual(HOOK_TIMEOUT_MS / 2);
  });

  it(
    'il tempo COMPLESSIVO della preparazione sta sotto il tetto — diagnosi inclusa',
    async () => {
      // ⛔ **Una scala ordinata non dimostra che il totale ci stia.** Rilevato
      //    dal proprietario: `15 < 30 < 45 < 60` sembrava una prova e non lo
      //    era, perché lasciava fuori il primo pezzo — l'attesa `maxWait` di una
      //    connessione dal pool, che valeva 30 s da sola. Il caso peggiore
      //    faceva 30 + 45 = 75 s **prima** della fotografia, contro un hook di
      //    60: lo stallo muto restava possibile per un'altra strada.
      //
      // ⭐ Qui si misura il tempo **reale** dalla prima riga all'ultima, con la
      //    pulizia bloccata e la diagnosi che gira: è la somma, non la scala.
      await trattieniUnaTabellaProtetta();

      const inizio = Date.now();
      await expect(svuota(prisma)).rejects.toThrow();
      const totale = Date.now() - inizio;

      // ⚠️ Il tetto è quello dichiarato dalle costanti, non un numero scritto
      //    qui: se qualcuno alza una soglia, questa prova se ne accorge.
      expect(totale).toBeLessThan(TETTO_PULIZIA_MS);

      // ⭐ E resta un margine vero rispetto all'hook, che deve bastare anche a
      //    `creaDataset()` — `beforeEach` non fa solo la pulizia.
      expect(totale).toBeLessThan(HOOK_TIMEOUT_MS / 2);
    },
    60_000,
  );

  it(
    'la fotografia parte anche col client della pulizia OCCUPATO',
    async () => {
      // ⛔ **Rilevato dal proprietario**: la diagnosi usava lo stesso client
      //    della pulizia. Ma il momento in cui serve è precisamente quello in
      //    cui quel client è occupato — e con il pool esaurito la fotografia si
      //    metteva in coda insieme a tutto il resto, cioè non partiva proprio
      //    quando serviva.
      //
      // ⭐ Qui il client ha **una sola** connessione, e quella connessione è
      //    tenuta da una transazione aperta: è la saturazione, riprodotta.
      const url = new URL(ambienteIntegrazione().databaseUrl);
      url.searchParams.set('connection_limit', '1');
      url.searchParams.set('pool_timeout', '2');
      const occupato = new PrismaClient({ datasources: { db: { url: url.toString() } } });

      let rilasciaOccupato!: () => void;
      const attesa = new Promise<void>((risolvi) => {
        rilasciaOccupato = risolvi;
      });
      const tiene = occupato.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SELECT 1');
          await attesa;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      tiene.catch(() => undefined);

      try {
        // ⚠️ Si dà tempo alla transazione di prendere l'unica connessione.
        await attendiConnessioneOccupata();

        const inizio = Date.now();
        const fotografia = await fotografiaConcorrenza(occupato);
        const durata = Date.now() - inizio;

        // ⛔ Deve essere una fotografia VERA, non il ripiego «non riuscita».
        expect(fotografia).not.toContain('fotografia non riuscita');
        expect(fotografia).toMatch(/sessioni=\d+/);
        // ⭐ E deve costare poco: la diagnosi non può pesare quanto il guasto.
        expect(durata).toBeLessThan(8_000);
      } finally {
        rilasciaOccupato();
        await tiene.catch(() => undefined);
        await occupato.$disconnect().catch(() => undefined);
      }
    },
    45_000,
  );

  it(
    'la SONDA nomina una transazione orfana, e dice dopo quale prova è comparsa',
    async () => {
      // ⭐ **Il salto da «aspettare il sintomo» a «cercare il precursore».**
      //    Una transazione lasciata aperta che non blocca nessuno passa
      //    inosservata e resta lì pronta a bloccare il giro dopo. La sonda la
      //    vede comunque — anche nei giri verdi — e questo è ciò che permette
      //    di identificare il responsabile senza dover attendere un rosso.
      //
      // ⚠️ Qui l'orfana è aperta su una tabella che la pulizia NON tronca, e
      //    con `SELECT 1`: così la sonda ha qualcosa da nominare ma la pulizia
      //    riesce. Il segnale si vede senza il guasto.
      let rilasciaOrfana!: () => void;
      const attesa = new Promise<void>((risolvi) => {
        rilasciaOrfana = risolvi;
      });
      const orfana = prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SELECT 1');
          await attesa;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      orfana.catch(() => undefined);

      const avvisi: string[] = [];
      const warnOriginale = console.warn;
      try {
        // La sonda nomina solo le transazioni più vecchie della sua soglia.
        await new Promise((risolvi) => setTimeout(risolvi, 2_500));
        console.warn = (...pezzi: unknown[]) => {
          avvisi.push(pezzi.map(String).join(' '));
        };
        await svuota(prisma);
      } finally {
        console.warn = warnOriginale;
        rilasciaOrfana();
        await orfana.catch(() => undefined);
      }

      const segnalazione = avvisi.find((a) => a.includes('TRANSAZIONE ORFANA'));
      expect(segnalazione).toBeDefined();
      // ⭐ I tre dati che servono a risalire al responsabile.
      expect(segnalazione).toMatch(/pid=\d+/);
      expect(segnalazione).toMatch(/aperta_da=\d\d:\d\d:\d\d/);
      expect(segnalazione).toContain('la precedente era');
      // ⚠️ E il nome della prova in corso, che il runner deve esporre davvero:
      //    se un giorno smettesse, questa asserzione lo direbbe.
      expect(segnalazione).toContain('la SONDA nomina una transazione orfana');
    },
    45_000,
  );

  it(
    'e senza nessuno che blocchi, la stessa pulizia riesce come sempre',
    async () => {
      // ⛔ Senza questa, la prova sopra sarebbe verde anche con una pulizia
      //    rotta per conto suo: fallire è facile, fallire SOLO quando serve no.
      const inizio = Date.now();
      await expect(svuota(prisma)).resolves.toBeUndefined();
      expect(Date.now() - inizio).toBeLessThan(15_000);
    },
    30_000,
  );
});
