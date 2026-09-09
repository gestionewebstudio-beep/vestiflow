import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  PlatformAuditActor,
  PlatformAuditOutcome,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuditPrismaClient } from './platform-audit-prisma.client';
import type { DatiOperazione, EsitoOperazione } from './platform-audit.types';

/**
 * Il registro UNICO delle operazioni — `docs/DA-FARE` §10.2-§10.3.
 *
 * ⭐ **Tre modi di scrivere, non uno**, e la differenza fra loro E' la sequenza
 *    canonica. `TenantUserAuditLog` ne ha uno solo — dopo il successo, fuori
 *    transazione, errore ingoiato — e non basta:
 *
 * ```text
 *   1  TENTATIVO   commit proprio, PRIMA dell'operazione. Se fallisce,
 *                  l'operazione NON parte: nessun effetto senza traccia.
 *   2  RIUSCITA    DENTRO la transazione dell'operazione, cosi' che le due
 *                  commettano insieme o non commettano affatto.
 *   3  RIFIUTATA / FALLITA   fuori, e solo dopo un ROLLBACK ACCERTATO.
 * ```
 *
 * ⛔ **Perche' la riuscita sta dentro.** Scritta dopo, in una transazione sua,
 *    resta una finestra: l'operazione committa, il processo muore, e non c'e'
 *    modo di distinguere «fatta» da «mai avvenuta». Dentro, l'invariante e'
 *    «effetto applicato ⇔ riga di riuscita presente».
 *
 * ⛔ **Perche' il rifiuto sta fuori.** Scritto dentro la transazione che ha
 *    rifiutato, il rollback se lo porta via — e i rifiuti sono meta' dei casi
 *    che si vanno a leggere.
 *
 * ⚠️ **«Rollback accertato» non e' una formalita'.** Un client puo' credere di
 *    aver fallito dopo aver commesso: scrivere «fallita» senza verificare
 *    mette a verbale una bugia. Chi chiama fornisce la verifica.
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  /**
   * ⭐ **DUE client, e la divisione non e' arbitraria** (`docs/DA-FARE` §10.3,
   *    rimedio del 09/09/2026):
   *
   * ```text
   *   prisma      il client dell'APPLICAZIONE: le transazioni operative
   *               (`conRegistro`: cestino, cancellazione azienda), le letture
   *               che decidono, la diagnosi sullo stato di una transazione
   *   riservato   SOLO le tre scritture AUTONOME di audit — tentativo,
   *               rifiuto, esito negativo — che non stanno nella transazione
   *               dell'operazione e percio' le contendevano una connessione
   * ```
   *
   * ⛔ **Non si sostituisce il client applicativo**: spostare `conRegistro`
   *    sulla connessione riservata metterebbe le operazioni di cestino e di
   *    cancellazione su UNA sola connessione, cioe' le serializzerebbe tutte.
   *    Quello che si sposta e' solo cio' che prima rubava una connessione a se'
   *    stesso.
   *
   * ⚠️ **Nei test i due client si passano ESPLICITAMENTE**, e vengono dalle
   *    barriere di `creaClientIntegrazione` (host, porta e nome del database):
   *    nessun client ricade su `DATABASE_URL` per conto proprio. Dove il pool
   *    non e' in prova, i due argomenti sono lo stesso client: e' dichiarato, e
   *    non cambia cio' che quelle prove verificano.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly riservato: PlatformAuditPrismaClient,
  ) {}

  /**
   * Passo 1 — il TENTATIVO, in una transazione sua, prima dell'operazione.
   *
   * ⛔ **Non ingoia l'errore.** Se la traccia iniziale non si scrive,
   *    l'operazione non deve partire: e' la sola garanzia che non esistano
   *    effetti senza alcuna traccia.
   *
   * Restituisce la CORRELAZIONE, che lega questa riga al suo esito.
   */
  async registraTentativo(dati: DatiOperazione): Promise<string> {
    const correlationId = randomUUID();
    // ⭐ Connessione RISERVATA: e' una scrittura autonoma, che sta fuori dalla
    //    transazione dell'operazione e non deve contenderle il pool (§10.3).
    await this.riservato.platformAuditLog.create({
      data: { ...righeDa(dati), correlationId, outcome: PlatformAuditOutcome.tentativo },
    });
    return correlationId;
  }

  /**
   * Passo 2 — la RIUSCITA, dentro la transazione del chiamante.
   *
   * ⚠️ **Riceve `tx`, e deve riceverlo.** Scritta sul client esterno girerebbe
   *    fuori dalla transazione, e la finestra che questo metodo esiste per
   *    chiudere tornerebbe ad aprirsi.
   */
  async registraRiuscita(
    tx: Prisma.TransactionClient,
    correlationId: string,
    dati: DatiOperazione,
  ): Promise<void> {
    await tx.platformAuditLog.create({
      data: { ...righeDa(dati), correlationId, outcome: PlatformAuditOutcome.riuscita },
    });
  }

  /**
   * Passo 2-bis — l'operazione ha commesso senza modificare NIENTE.
   *
   * ⭐ **Il caso e' una richiesta concorrente**: due comandi di cestino sullo
   *    stesso articolo, il primo applica e il secondo trova l'effetto gia'
   *    presente. ⛔ Il secondo non e' `riuscita` — attribuirgli la modifica
   *    sarebbe falso — non e' `fallita` e non e' `rifiutata`.
   *
   * ⚠️ Va DENTRO la transazione come la riuscita: e' l'esito di qualcosa che ha
   *    commesso, e serve a non lasciare il `tentativo` senza esito.
   */
  async registraIninfluente(
    tx: Prisma.TransactionClient,
    correlationId: string,
    dati: DatiOperazione,
    detail: string,
  ): Promise<void> {
    await tx.platformAuditLog.create({
      data: {
        ...righeDa(dati),
        correlationId,
        outcome: PlatformAuditOutcome.ininfluente,
        detail,
      },
    });
  }

  /**
   * Un RIFIUTO SECCO: una riga sola, `rifiutata`, senza `tentativo` prima.
   *
   * ⭐ **Il caso e' l'import da Shopify che rifiuta** (B5-B6): l'articolo e'
   *    eliminato definitivamente, gia' collegato ad altro, col collegamento
   *    chiuso. Non c'e' un'operazione in volo da correlare CON QUESTA RIGA — la
   *    valutazione e' conclusa e il suo esito E' la decisione — quindi niente
   *    `tentativo`: un tentativo senza esito deve continuare a significare
   *    «qualcosa e' andato storto», e qui non e' andato storto niente.
   *
   * ⛔ **Si scrive su una CONNESSIONE PROPRIA, non nella transazione del
   *    chiamante** — corretto il 09/09/2026 su rilievo del proprietario. La
   *    prima stesura la scriveva su `tx` e prescriveva che, se l'import fosse
   *    poi caduto, la traccia cadesse con lui. Era il contrario del mandato: il
   *    rifiuto e' un fatto OSSERVATO, e un rollback successivo dell'import non
   *    lo rende non avvenuto. Scritta qui, la riga sopravvive al rollback.
   *
   * ⚠️ **E non e' una dichiarazione sull'import.** La riga dice che cosa e'
   *    stato rifiutato e perche'; non dice che l'import sia riuscito o fallito.
   *    Chi legge il registro lo vede dalla `correlationId`, che e' quella
   *    dell'INGRESSO (un lotto di pull, una consegna webhook) e lega fra loro i
   *    rifiuti dello stesso evento — non un identificativo inventato a riga.
   *
   * ⛔ **Non ingoia l'errore.** Se la riga non si scrive, l'eccezione risale al
   *    chiamante, che sta ancora dentro la propria transazione e NON ha
   *    commesso: l'import cade PRIMA di commettere, e lo dice. Un rifiuto
   *    invisibile e' indistinguibile da un articolo mai arrivato (§10.3).
   *
   * ⚠️ **Costo dichiarato**: per la durata della scrittura il chiamante tiene
   *    due connessioni del pool (la sua transazione e questa). Se il pool e'
   *    esaurito la scrittura fallisce col timeout del pool, e l'import cade
   *    visibilmente — non in silenzio.
   *
   * ⚠️ **`detail` e' la regola che ha deciso, per nome** (il CHECK
   *    `negativo_motivato` lo esige), mai il payload del webhook.
   */
  async registraRifiuto(
    dati: DatiOperazione,
    detail: string,
    correlationId: string,
  ): Promise<void> {
    // ⭐ Connessione RISERVATA. E' la scrittura che ha fatto misurare il
    //    difetto: chiesta dal pool dell'applicazione mentre l'import teneva la
    //    propria transazione, cinque rifiuti simultanei si esaurivano a vicenda
    //    (`registro-pool` P1, 09/09/2026).
    await this.riservato.platformAuditLog.create({
      data: {
        ...righeDa(dati),
        correlationId,
        outcome: PlatformAuditOutcome.rifiutata,
        detail: detail.slice(0, 500),
      },
    });
  }

  /**
   * La SEQUENZA CANONICA di `docs/DA-FARE` §10.2-§10.3, in un posto solo.
   *
   * ```text
   *   1  TENTATIVO      commit proprio, prima. Se non si scrive, non si opera.
   *   2  operazione + RIUSCITA nella STESSA transazione
   *   2b ININFLUENTE    se l'operazione non ha modificato niente
   *   3  RIFIUTATA / FALLITA fuori, e solo se si accerta che non ha commesso
   * ```
   *
   * ⛔ **Vive QUI, non nel servizio che la usa.** Nata dentro `ProductsService`
   *    per il cestino, al secondo consumatore — la cancellazione del tenant —
   *    copiarla avrebbe significato due copie della stessa decisione, che e'
   *    esattamente cio' che `regole-qualita` vieta al secondo punto.
   *
   * ⭐ **L'idempotenza sta PRIMA del tentativo**: una richiesta che non ha
   *    niente da fare non lascia una traccia orfana, e chi chiama la risolve
   *    prima di arrivare qui.
   *
   * ⚠️ **`ininfluente` non e' un fallimento**: e' una richiesta concorrente
   *    arrivata seconda, che ha trovato l'effetto gia' applicato. Attribuirle
   *    la modifica sarebbe falso, e lasciarla senza esito farebbe perdere a
   *    «tentativo senza esito» il suo unico significato.
   */
  async conRegistro(
    dati: DatiOperazione,
    operazione: (tx: Prisma.TransactionClient) => Promise<EsitoOperazione>,
    /**
     * ⛔ **Le opzioni della transazione le decide CHI CHIAMA**, e non è un
     *    dettaglio: senza, un'operazione lunga eredita il default del client —
     *    `timeout: 30_000` — e su un tenant grande la cancellazione andrebbe in
     *    timeout dopo aver cancellato per mezzo minuto. Misurato l'08/09/2026
     *    portando la sequenza qui: `deleteTenant` aveva `300_000` e
     *    `Serializable`, e passando di qua li aveva persi entrambi.
     *
     * ⚠️ Il cestino non ne passa: ha sempre usato il default, e continuare a
     *    usarlo non è una regressione.
     */
    opzioni?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<void> {
    const correlazione = await this.registraTentativo(dati);
    // ⛔ Non e' una variabile di comodo: senza, il passo 3 non puo' sapere se
    //    la transazione sia TERMINATA, e «nessun esito» tornerebbe a essere
    //    letto come «rollback» anche mentre puo' ancora commettere.
    let xidTransazione: string | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        // ⭐ PRIMA di ogni altra cosa dentro la transazione.
        xidTransazione = await this.identificaTransazione(tx);
        const esito = await operazione(tx);
        if (esito === 'applicata') {
          await this.registraRiuscita(tx, correlazione, dati);
          return;
        }
        await this.registraIninfluente(
          tx,
          correlazione,
          dati,
          'richiesta concorrente: l effetto era gia stato applicato da un altra richiesta',
        );
      }, opzioni);
    } catch (errore) {
      const rifiutata = errore instanceof ConflictException;
      const detail = errore instanceof Error ? errore.message : String(errore);
      // ⛔ La prova del rollback e' il REGISTRO piu' lo STATO DELLA TRANSAZIONE,
      //    mai quello dell'entita': quello puo' averlo cambiato un altro utente
      //    fra il commit e qui, e «nessun esito» da solo non distingue una
      //    transazione annullata da una che sta ancora lavorando.
      await this.registraEsitoNegativo(
        correlazione,
        dati,
        rifiutata ? 'rifiutata' : 'fallita',
        detail,
        xidTransazione,
      );
      throw errore;
    }
  }

  /**
   * Identifica la transazione dell'operazione, PRIMA di ogni altra cosa.
   *
   * ⭐ Serve al passo 3: senza, «nessun esito nel registro» non distingue una
   *    transazione rotolata indietro da una che sta ancora lavorando.
   *
   * ⚠️ `pg_current_xact_id()` **assegna** uno xid vero, e va bene: questa
   *    transazione scrive comunque. `::text` perche' `xid8` e' a 64 bit e non
   *    deve passare per un numero JavaScript.
   */
  async identificaTransazione(tx: Prisma.TransactionClient): Promise<string> {
    const righe = await tx.$queryRawUnsafe<{ xid: string }[]>(
      'SELECT pg_current_xact_id()::text AS xid',
    );
    const xid = righe[0]?.xid;
    if (xid == null || xid === '') {
      throw new Error('Registro: la transazione non ha restituito il proprio identificativo');
    }
    return xid;
  }

  /**
   * Chiede a PostgreSQL come sia finita una transazione.
   *
   * ⭐ **`aborted` e' CONCLUSIVO, e per una ragione precisa**: quella risposta
   *    arriva solo quando lo xid non e' piu' nel procarray, cioe' quando la
   *    sorte della transazione e' ormai decisa. Nella finestra fra la scrittura
   *    nella CLOG e l'uscita dal procarray la risposta e' `in progress` — cioe'
   *    l'errore, se c'e', cade sempre dalla parte dell'INCERTEZZA.
   *
   * ⛔ Verificato in croce fra due sessioni sul database di prova (08/09/2026),
   *    invece che dedotto: una transazione viva di un'altra sessione risulta
   *    `in progress`, e dopo la chiusura `committed` o `aborted`.
   */
  private async comeSiaFinita(xid: string): Promise<string | null> {
    const righe = await this.prisma.$queryRawUnsafe<{ stato: string | null }[]>(
      'SELECT pg_xact_status($1::xid8) AS stato',
      xid,
    );
    return righe[0]?.stato ?? null;
  }

  /**
   * Passo 3 — l'esito NEGATIVO, fuori dalla transazione.
   *
   * ⛔ **La prova del rollback e' il REGISTRO e la TRANSAZIONE, non lo stato
   *    dell'entita'.** Corretto l'08/09/2026: prima si rileggeva l'articolo, e
   *    bastava che un ALTRO utente eseguisse l'operazione inversa fra il commit
   *    e la verifica perche' un'operazione RIUSCITA venisse messa a verbale
   *    come `fallita`. Lo stato corrente e' di tutti; l'esito di UNA
   *    correlazione e' solo suo.
   *
   * ⛔ **E l'assenza di esito NON basta da sola** — seconda correzione dello
   *    stesso giorno. La presenza di una riuscita prova il commit; la sua
   *    assenza prova il rollback **soltanto se la transazione e' terminata**.
   *    Una transazione ancora in volo non ha scritto niente e puo' ancora
   *    commettere: dedurne un fallimento e' la stessa deduzione di prima,
   *    spostata di un passo.
   *
   * ```text
   *   registro: esito presente          -> HA COMMESSO            non scrivere
   *   registro: vuoto, xid mancante     -> l'operazione non e' mai partita   scrivi
   *   registro: vuoto, xid 'aborted'    -> ROLLBACK ACCERTATO     scrivi
   *   registro: vuoto, 'in progress'    -> puo' ancora commettere non scrivere
   *   registro: vuoto, 'committed'      -> anomalia               non scrivere
   *   qualunque lettura fallita         -> non si sa              non scrivere
   * ```
   */
  async registraEsitoNegativo(
    correlationId: string,
    dati: DatiOperazione,
    esito: 'rifiutata' | 'fallita',
    detail: string,
    xidTransazione?: string,
  ): Promise<void> {
    /** Registra nel log applicativo perche' l'esito NON e' stato messo a verbale. */
    const taci = (perche: string): void => {
      this.logger.error(
        `Registro: esito «${esito}» NON scritto per ${correlationId} — ${perche} ` +
          `Resta il tentativo senza esito.`,
      );
    };

    let giaChiusa: boolean;
    try {
      giaChiusa =
        (await this.prisma.platformAuditLog.count({
          where: { correlationId, outcome: { not: PlatformAuditOutcome.tentativo } },
        })) > 0;
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      taci(`il registro non e' leggibile (${messaggio}), quindi non si sa se abbia commesso.`);
      return;
    }

    if (giaChiusa) {
      // ⛔ Un esito c'e' gia': la transazione HA commesso, e la risposta si e'
      //    persa dopo. Scrivere un fallimento accanto a una riuscita
      //    metterebbe a verbale due fatti incompatibili.
      //
      // ⚠️ **Nel percorso reale questo controllo e' RIDONDANTE**, e va detto
      //    invece di lasciarlo credere necessario: se un esito c'e', la
      //    transazione ha commesso, e il controllo qui sotto risponderebbe
      //    `committed` e si fermerebbe comunque. Resta per due ragioni — e'
      //    la prova POSITIVA del commit, che non dipende dal privilegio di
      //    eseguire `pg_xact_status`, e distingue nel log «ha commesso» da
      //    «non si sa». La prova che lo tiene falsificabile e' `1f`.
      taci("la correlazione ha gia' un esito: ha commesso e la risposta si e' persa dopo.");
      return;
    }

    // ── Il registro e' vuoto. Ma e' finita, questa transazione? ─────────────
    if (xidTransazione != null) {
      let stato: string | null;
      try {
        stato = await this.comeSiaFinita(xidTransazione);
      } catch (errore) {
        const messaggio = errore instanceof Error ? errore.message : String(errore);
        taci(`non si e' potuto sapere come sia finita la transazione (${messaggio}).`);
        return;
      }

      if (stato !== 'aborted') {
        // ⛔ `in progress` e' il caso che questa guardia esiste per prendere: la
        //    transazione sta ancora lavorando — magari ferma su un lock — e puo'
        //    ancora commettere. `committed` senza riga di esito e' un'anomalia,
        //    e `null` significa troppo vecchia per saperlo: in nessuno dei tre
        //    casi si e' accertato un rollback.
        taci(
          `la transazione risulta «${stato ?? 'non piu` determinabile'}», non «aborted»: ` +
            `nessun rollback accertato.`,
        );
        return;
      }
    }
    // ⭐ `xidTransazione` assente significa che la transazione non e' arrivata
    //    alla propria prima istruzione: l'operazione non e' mai stata eseguita,
    //    e nulla puo' aver commesso. E' l'unico caso in cui l'assenza basta.

    try {
      // ⭐ Connessione RISERVATA: terza e ultima scrittura autonoma. ⚠️ Le due
      //    LETTURE che l'hanno preceduta — il conteggio degli esiti e
      //    `pg_xact_status` — restano sul client dell'applicazione: non sono
      //    scritture, e girano quando la transazione operativa e' gia' conclusa,
      //    quindi non le contendono niente. Il limite resta dichiarato: a pool
      //    esaurito quelle letture possono fallire, e allora l'esito non si
      //    scrive e resta il tentativo senza esito (lo dice `taci`).
      await this.riservato.platformAuditLog.create({
        data: {
          ...righeDa(dati),
          correlationId,
          outcome:
            esito === 'rifiutata' ? PlatformAuditOutcome.rifiutata : PlatformAuditOutcome.fallita,
          detail,
        },
      });
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      this.logger.error(`Registro: esito «${esito}» non scritto per ${correlationId}: ${messaggio}`);
    }
  }
}

/**
 * ⛔ Nessun payload, nessuna credenziale: si copiano solo i campi dichiarati.
 *    Un oggetto passato per intero finirebbe nel registro con dentro tutto.
 */
function righeDa(dati: DatiOperazione) {
  const attore = dati.attore;
  return {
    tenantId: dati.tenantId,
    operation: dati.operation,
    shopGid: dati.shopGid ?? null,
    entityId: dati.entityId ?? null,
    entityLabel: dati.entityLabel ?? null,
    remoteGid: dati.remoteGid ?? null,
    reason: dati.reason ?? null,
    actor: attore.tipo,
    actorUserId: attore.tipo === PlatformAuditActor.utente ? attore.userId : null,
    actorName: attore.tipo === PlatformAuditActor.utente ? attore.name : null,
    actorEmail: attore.tipo === PlatformAuditActor.utente ? attore.email : null,
  };
}
