import type { PrismaClient } from '@prisma/client';

/**
 * Gli attrezzi per osservare una concorrenza VERA su PostgreSQL.
 *
 * ⛔ **Vivono qui, non dentro una spec.** Nati per le prove del cestino, al
 *    secondo file che ne ha bisogno — la cancellazione del tenant — copiarli
 *    avrebbe significato due versioni della stessa meccanica, e la seconda
 *    sarebbe invecchiata da sola.
 *
 * ⭐ **Causale, non a tempo**: si aspetta che qualcuno risulti bloccato PROPRIO
 *    dalla sessione indicata, non che esista un blocco qualunque. Un `sleep`
 *    renderebbe la prova verde o rossa a seconda della macchina.
 */

/** Chi tiene la riga bloccata, e come lo si lascia andare. */
export interface PrimaRichiestaSospesa {
  /** Il pid della sessione che tiene il lock: e' gia' stato ACQUISITO. */
  readonly pid: number;
  /** Lascia proseguire la prima transazione fino al commit. */
  readonly sblocca: () => void;
  /** La transazione stessa, da attendere alla fine. */
  readonly transazione: Promise<unknown>;
  /**
   * Sblocca E attende, senza propagare errori: si chiama in un `finally`.
   *
   * ⛔ **`sblocca()` da solo non basta**, ed e' il difetto che si paga quando la
   *    prova fallisce: la transazione resta in volo tenendo il proprio lock, e
   *    il file successivo trova il database occupato. Chiamata due volte non
   *    fa niente la seconda.
   *
   * ⚠️ **Non rilancia**: dentro un `finally`, l'errore della pulizia
   *    coprirebbe quello vero della prova.
   */
  readonly chiudi: () => Promise<void>;
}

/**
 * Attende che QUALCUNO sia bloccato PROPRIO dalla sessione indicata.
 *
 * ⛔ **Non conta i lock non concessi**: in un database di prova condiviso fra
 *    file di test un lock non concesso puo' appartenere a chiunque, e la prova
 *    diventerebbe verde per un blocco che non ha provocato lei.
 *
 * Restituisce il pid della sessione BLOCCATA, cosi' che chi chiama possa
 * verificare che non sia la bloccante stessa.
 */
export async function attendiBloccoCausatoDa(
  prisma: PrismaClient,
  pidBloccante: number,
  tentativiMassimi = 600,
): Promise<number> {
  for (let tentativo = 0; tentativo < tentativiMassimi; tentativo += 1) {
    const righe = await prisma.$queryRawUnsafe<{ bloccata: number }[]>(
      `SELECT a.pid AS bloccata
         FROM pg_stat_activity a
        WHERE a.datname = current_database()
          AND a.pid <> pg_backend_pid()
          AND $1::int = ANY (pg_blocking_pids(a.pid))
        LIMIT 1`,
      pidBloccante,
    );
    const bloccata = righe[0]?.bloccata;
    if (bloccata != null) {
      return bloccata;
    }
    await new Promise((risolvi) => setTimeout(risolvi, 25));
  }
  throw new Error(
    `nessuna sessione risulta bloccata dalla sessione ${pidBloccante}: ` +
      'la prova non sta misurando la concorrenza che dichiara',
  );
}

/** Una transazione dell'applicazione trattenuta appena prima del commit. */
export interface TransazioneTrattenuta {
  /** Il pid della sessione che la esegue: si risolve a scritture avvenute. */
  readonly pidPronto: Promise<number>;
  /** Lascia che la transazione arrivi al commit. */
  readonly riprendi: () => void;
}

/**
 * Trattiene la PROSSIMA transazione interattiva del client, a scritture
 * avvenute e **prima del commit**.
 *
 * ⭐ **Strumentazione confinata ai test.** Non esiste nessun gancio
 *    nell'applicazione: si sostituisce `$transaction` sul client di prova, e la
 *    sostituzione si toglie da sola alla prima chiamata. Il codice di
 *    produzione non sa di essere osservato, ed e' la ragione per cui la prova
 *    dimostra qualcosa — un gancio operativo proverebbe il gancio.
 *
 * ⭐ **Rende l'incrocio deterministico**: senza, quale delle due richieste
 *    arrivi prima lo decide lo scheduler, e la prova osserva una concorrenza
 *    diversa a ogni esecuzione — cioe' non osserva niente di preciso.
 *
 * ⚠️ `timeoutProva` allunga il timeout della SOLA transazione trattenuta: senza,
 *    i 5 s di default di Prisma scadono mentre la prova osserva il blocco, e il
 *    fallimento sarebbe dell'attrezzo, non del comportamento in esame.
 */
export function trattieniLaProssimaTransazione(
  prisma: PrismaClient,
  daRipristinare: Array<() => void>,
  opzioniProva: { readonly timeoutProva?: number } = {},
): TransazioneTrattenuta {
  let riprendi!: () => void;
  const attesa = new Promise<void>((risolvi) => {
    riprendi = risolvi;
  });
  let dichiaraPid!: (pid: number) => void;
  let pidFallito!: (errore: unknown) => void;
  const pidPronto = new Promise<number>((risolvi, rifiuta) => {
    dichiaraPid = risolvi;
    pidFallito = rifiuta;
  });
  // ⚠️ Chi attende il pid puo' non arrivarci mai (sotto): senza questo, il
  //    rifiuto costruito qui diventerebbe un `unhandledRejection`.
  pidPronto.catch(() => undefined);

  const client = prisma as unknown as {
    $transaction: (...argomenti: unknown[]) => Promise<unknown>;
  };
  const originale = client.$transaction.bind(prisma);
  daRipristinare.push(() => {
    client.$transaction = originale;
  });
  client.$transaction = async (corpo: unknown, opzioni?: unknown) => {
    if (typeof corpo !== 'function') {
      return originale(corpo, opzioni);
    }
    client.$transaction = originale;
    const opzioniEffettive =
      opzioniProva.timeoutProva === undefined
        ? opzioni
        : { ...(opzioni as object), timeout: opzioniProva.timeoutProva };
    // ⛔ **Chi aspetta il pid deve essere liberato ANCHE se il pid non arriva
    //    mai.** Se il corpo fallisce — un rifiuto, un conflitto — `dichiaraPid`
    //    non verrebbe chiamato e `await pidPronto` resterebbe appeso per
    //    sempre: non una prova rossa, una prova che NON FINISCE.
    const transazione = originale(async (tx: Record<string, unknown>) => {
      const esito = await (corpo as (t: unknown) => Promise<unknown>)(tx);
      const righe = await (tx as unknown as PrismaClient).$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      dichiaraPid(righe[0]!.pid);
      // ⛔ Si trattiene DOPO il corpo: le righe sono scritte e i lock presi,
      //    che e' esattamente la finestra in cui il secondo deve incrociarla.
      await attesa;
      return esito;
    }, opzioniEffettive);
    transazione.then(
      () =>
        pidFallito(new Error("la transazione si e' conclusa senza aver dichiarato il proprio pid")),
      (errore: unknown) => pidFallito(errore),
    );
    return transazione;
  };
  return { pidPronto, riprendi };
}

/**
 * Apre una transazione che esegue l'aggiornamento e RESTA APERTA, e ritorna
 * solo quando il lock e' stato davvero acquisito.
 *
 * ⭐ **Ritorna DOPO l'acquisizione, non dopo l'avvio.** Chi chiama non deve
 *    poter far partire la seconda richiesta prima che ci sia qualcosa da cui
 *    essere bloccati: senza questa attesa l'ordine dei due lo decide lo
 *    scheduler.
 */
export async function sospendiLaPrimaRichiesta(
  prisma: PrismaClient,
  aggiornamento: string,
  parametri: unknown[],
): Promise<PrimaRichiestaSospesa> {
  let sblocca!: () => void;
  const attesa = new Promise<void>((risolvi) => {
    sblocca = risolvi;
  });
  let lockPreso!: (pid: number) => void;
  let lockFallito!: (errore: unknown) => void;
  const acquisito = new Promise<number>((risolvi, rifiuta) => {
    lockPreso = risolvi;
    lockFallito = rifiuta;
  });

  const transazione = prisma.$transaction(
    async (tx) => {
      const dentro = tx as unknown as PrismaClient;
      try {
        await dentro.$executeRawUnsafe(aggiornamento, ...parametri);
        const righe = await dentro.$queryRawUnsafe<{ pid: number }[]>(
          'SELECT pg_backend_pid() AS pid',
        );
        lockPreso(righe[0]!.pid);
      } catch (errore) {
        lockFallito(errore);
        throw errore;
      }
      await attesa;
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
  // ⛔ **La transazione CHIUDE l'attesa del pid, comunque sia finita.**
  //    Corretto l'08/09/2026 dopo averlo riprodotto: se non parte affatto —
  //    pool saturo, `maxWait` scaduto — il corpo non gira, `lockPreso` non
  //    viene mai chiamato e `await acquisito` **non si risolve mai**. Non e' un
  //    fallimento: e' un'attesa infinita, cioe' un file di prova che non
  //    termina e trascina con se' il resto della suite.
  //
  // ⚠️ Serve anche il ramo che RIESCE: una transazione conclusa senza aver
  //    dichiarato il pid non porta nessun errore da propagare, e senza un
  //    errore costruito qui l'attesa resterebbe aperta lo stesso.
  transazione.then(
    () =>
      lockFallito(
        new Error(
          'la transazione si e` conclusa senza aver dichiarato il proprio pid: ' +
            'il corpo non e` stato eseguito',
        ),
      ),
    (errore: unknown) => lockFallito(errore),
  );

  let chiusa: Promise<void> | null = null;
  const chiudi = (): Promise<void> => {
    // ⭐ Idempotente: la prima chiamata sblocca e attende, le successive
    //    restituiscono la stessa attesa gia' in corso.
    chiusa ??= (async () => {
      sblocca();
      await transazione.catch(() => undefined);
    })();
    return chiusa;
  };

  let pid: number;
  try {
    pid = await acquisito;
  } catch (errore) {
    await chiudi();
    throw errore;
  }
  return { pid, sblocca, transazione, chiudi };
}
