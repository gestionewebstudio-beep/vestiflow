import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

/**
 * Quante ripubblicazioni si ritentano per passata.
 *
 * L'Admin API Shopify è a quota, e una coda lunga svuotata tutta insieme se la
 * mangia — penalizzando le sincronizzazioni che l'operatore sta aspettando. Il
 * resto si riprende alla passata dopo, e quante ne restano viene DETTO: un tetto
 * silenzioso si legge come «ho finito», che è la conclusione sbagliata.
 */
const REPUBLISH_BATCH_LIMIT = 50;

/**
 * Quante righe si ESAMINANO al massimo per passata.
 *
 * ⛔ **Non è un secondo tetto per prudenza: è il rimedio a un blocco misurato.**
 *    Il lotto prende le righe più vecchie per `updatedAt`, ma diversi rami di
 *    uscita **non scrivono sulla riga** — verificato nel codice: `base_assente`
 *    (`push:450`), `collegamento_escluso` (`push:359`), `rinvio_attivo`
 *    (`push:1334`). Quelle righe conservano il loro `updatedAt`, quindi
 *    restano **per sempre** le più vecchie: con cinquanta davanti, la
 *    cinquantunesima non veniva tentata mai.
 *
 * ⚠️ **`base_assente` è il caso reale, non teorico**: è una riga che non ha mai
 *    avuto un valore confermato, quindi la coda non può risolverla — e resta in
 *    testa a bloccare tutte le altre.
 *
 * ⭐ **Il tetto che conta resta quello dei tentativi CONCLUSIVI**
 *    (`REPUBLISH_BATCH_LIMIT`): sono quelli che consumano la quota. Le righe che
 *    escono senza inviare costano una lettura locale, e non devono comprare il
 *    diritto di fermare la coda.
 *
 * ⚠️ **Il limite di questa misura, dichiarato**: `tentativo_incerto` conta fra
 *    le «senza invio» pur avendo toccato il canale, quindi nel caso peggiore la
 *    passata può fare più chiamate di `REPUBLISH_BATCH_LIMIT`. È il motivo per
 *    cui questo tetto esiste ed è basso: limita il caso peggiore.
 */
const REPUBLISH_SCAN_LIMIT = 200;

/**
 * L'esito di una passata di ripubblicazione, in classi che NON si confondono.
 *
 * ⛔ **Qui c'era `succeeded`, e contava ogni chiamata che non aveva sollevato.**
 *    `pushLevel` non solleva mai — cattura l'errore e restituisce un esito —
 *    quindi contava come riuscite anche le righe per cui non era partito
 *    niente, quelle rifiutate e quelle fallite. E siccome l'arretrato si
 *    calcolava per sottrazione, il difetto andava nella direzione peggiore per
 *    una misura: «sembra meglio di com'è».
 *
 * ⭐ **Una riuscita è un INVIO CONFERMATO.** Le altre tre classi esistono perché
 *    hanno rimedi diversi: `unchanged` è il push che non aveva niente da
 *    mandare, `refused` è ciò che **non si risolve ritentando**, `failed` è un
 *    guasto che ritentare può risolvere.
 *
 * ⚠️ **La linea che separa `refused` da `failed` è il RIMEDIO, non chi ha
 *    detto no.** È la ragione per cui la divergenza accertata sta con lo
 *    storico e non con i guasti: in entrambi i casi ripresentare la stessa
 *    operazione produce lo stesso esito, e contarla fra i guasti direbbe a chi
 *    legge «riprova più tardi» — cioè esattamente l'insistenza che quel caso
 *    non risolve.
 */
export interface InventoryRepublishResult {
  /** Disallineamenti in coda all'inizio della passata. */
  readonly pending: number;
  /** Righe prese in questa passata (tetto compreso). */
  readonly attempted: number;
  /** ⭐ Invio CONFERMATO: la quantità è partita e Shopify l'ha accettata. */
  readonly republished: number;
  /**
   * Nessun invio: il push non aveva niente da mandare, mancava un requisito, o
   * un **rinvio** in corso lo ha trattenuto.
   *
   * ⚠️ **Il rinvio non ha una classe sua, ed è una scelta dichiarata.** Sarebbe
   *    la quinta, e cambierebbe il contratto fino alla schermata: qui il
   *    perimetro è il ritentativo. Il motivo preciso resta nel `reason` del push
   *    (`rinvio_attivo`) e nel log; a schermo si legge «senza invio», che è
   *    vero. Se un giorno il rinvio dovrà distinguersi, è una decisione a sé.
   */
  readonly unchanged: number;
  /**
   * Rifiutato, e **ritentare non lo risolve**. Due origini, un solo rimedio:
   *
   * - lo **storico** vieta quel collegamento (26.8): la quantità non parte;
   * - il **canale** ha rifiutato la quantità (`divergenza_accertata`): è
   *   partita, Shopify ha confrontato la base e ha detto no;
   * - il **canale** ha rifiutato la richiesta (`richiesta_rifiutata`): un
   *   identificativo, un riferimento o un permesso — non le quantità.
   *
   * ⚠️ **Le ultime due hanno un seguito che questa classe non porta**, e sono
   *    seguiti opposti: la divergenza chiede di riconciliare le quantità — un
   *    blocco a sé, non ancora implementato (`docs/DA-FARE.md` §29.6) — la
   *    richiesta rifiutata chiede di riguardare il collegamento. In entrambi i
   *    casi la riga resta disallineata e conta in `remaining`; a dire quale dei
   *    due sia è la **nota** sulla riga.
   *
   * ⛔ **Che cosa NON è qui.** Un `userError` che dice «l'operazione è ancora in
   *    corso» non è un rifiuto: quella riga esce come `tentativo_in_corso` e
   *    cade in `unchanged`, perché per questa passata non è successo niente e
   *    il tentativo è ancora vivo.
   */
  readonly refused: number;
  /** Guasto: il canale non ha risposto, o la chiamata è saltata. Ritentabile. */
  readonly failed: number;
  /**
   * Ancora da risolvere dopo la passata.
   *
   * ⭐ **Si RICONTA, non si sottrae.** Il marcatore si spegne solo per un invio
   *    riuscito o per un'eco riconosciuta, e ricontarlo è l'unico modo di dire
   *    ciò che resta davvero — comprese le righe che nessuno ha toccato.
   *
   * ⭐ **Ed è falsificata da una prova, dal 09/09/2026.** In una passata
   *    sequenziale ricontato e sottratto coincidono, e per questo il difetto era
   *    rimasto scoperto: la differenza esiste solo quando qualcosa spegne un
   *    marcatore **fuori** da questa passata. `V10` riproduce quella concorrenza
   *    invece di aspettarla — intercetta la chiamata al canale e risolve un
   *    altro pendente mentre la passata è in corso — e sostituire la riconta con
   *    una sottrazione la fa diventare rossa.
   *
   * ⛔ **Qui c'era scritto che nessuna prova la distingueva**, e chi lo avesse
   *    letto avrebbe potuto sostituirla con una sottrazione «equivalente»
   *    convinto che niente lo fermasse.
   */
  readonly remaining: number;
}

/**
 * Ripubblicazione dei disallineamenti inventario rimasti in sospeso.
 *
 * Quando il webhook `inventory_levels/update` porta un valore che VestiFlow non
 * sa giustificare («Caso D»), VestiFlow resta fonte di verità e riprogramma la
 * pubblicazione del proprio. Quella pubblicazione però è **un tentativo solo**,
 * lanciato senza attenderne l'esito: se fallisce resta un warning nel log e il
 * flag `mismatchDetected` acceso — che finora **non leggeva nessuno**, e che
 * nessun meccanismo riprovava. La divergenza restava lì per sempre, in silenzio.
 *
 * Qui la coda si svuota, e lo fa in coda allo scarico inventario: quello è il
 * momento in cui l'operatore sta già aspettando Shopify, e nell'applicazione non
 * esiste nessuno scheduler a cui appendere un ritentativo automatico.
 *
 * Non c'è bisogno di cancellare il flag a mano: lo spegne la registrazione
 * dell'invio riuscito (`recordSuccessfulPush`), nella stessa scrittura con cui
 * annota l'ultimo inviato. ⭐ **È la ragione per cui una seconda passata senza
 * nuove divergenze non ripete niente**: la riga esce dalla coda subito, senza
 * dover aspettare che l'eco del proprio push torni indietro come webhook.
 *
 * ⛔ **Qui c'era scritto che a spegnerlo era l'eco (Caso B).** Non è vero, ed è
 *    una differenza che conta: i webhook possono essere spenti, e in quel caso
 *    la coda non si sarebbe svuotata mai.
 */
/**
 * CHE COSA sta in coda — scritto UNA volta sola.
 *
 * ⛔ **Erano due `where` gemelli**, uno in `retryPending` e uno in `contaInCoda`.
 *    Aggiungendo un criterio a uno solo, la coda conterebbe una cosa e ne
 *    esaminerebbe un'altra — e quando il conteggio dice zero il ciclo **non
 *    parte affatto**. È lo stesso difetto già pagato con le due letture dello
 *    stato sync, dove il ramo composto non si accendeva mai.
 *
 * I tre motivi per cui una riga è in coda, e restano DISTINGUIBILI:
 *
 * ```text
 *   mismatchDetected   il canale porta un numero diverso dall'atteso
 *                      → lo si sa GUARDANDO il canale
 *   localPushPending   c'e' un aggiornamento locale non trasmesso
 *                      → non si e' guardato niente: non si e' proprio scritto
 *   pendingKey         un tentativo e' partito e l'esito e' IGNOTO
 *                      → il canale e' stato toccato, e non sappiamo con che effetto
 * ```
 *
 * ⛔ **Il terzo non si fonde con gli altri due.** Un tentativo aperto non si
 *    rimanda: si **ripete con la sua chiave**, i suoi parametri e la sua
 *    destinazione — o non si tocca affatto. Confuso con `localPushPending`,
 *    nessuno saprebbe più, leggendo la riga, se il canale sia già stato scritto.
 */
function righeInCoda(tenantId: string) {
  return {
    tenantId,
    OR: [{ mismatchDetected: true }, { localPushPending: true }, { pendingKey: { not: null } }],
  };
}

@Injectable()
export class ShopifyInventoryRepublishService {
  private readonly logger = new Logger(ShopifyInventoryRepublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  async retryPending(tenantId: string): Promise<InventoryRepublishResult> {
    const pending = await this.contaInCoda(tenantId);
    if (pending === 0) {
      return {
        pending: 0,
        attempted: 0,
        republished: 0,
        unchanged: 0,
        refused: 0,
        failed: 0,
        remaining: 0,
      };
    }

    // ⭐ **Due lavori diversi nella stessa coda**, e restano distinguibili:
    //
    //      mismatchDetected   il canale porta un numero diverso dall'atteso
    //      localPushPending   non si è scritto, e non si sa cosa porti il canale
    //
    // ⛔ **Non si fondono in una colonna sola.** Dopo, nessuno potrebbe più
    //    dire, guardando una riga in coda, se il canale sia stato interrogato —
    //    e i due rimedi sono diversi.
    let republished = 0;
    let unchanged = 0;
    let refused = 0;
    let failed = 0;
    let esaminate = 0;

    // ⭐ **Si SCANDISCE, non si prende un lotto solo.** Una riga che esce senza
    //    inviare non consuma il tetto dei tentativi, quindi non può impedire di
    //    arrivare a quelle dietro — che è il difetto che questo ciclo corregge.
    //
    // ⛔ **Qui c'era `orderBy: updatedAt` con uno `skip`, e NON bastava.** Le
    //    righe che escono senza scrivere conservano `updatedAt`, quindi restano
    //    in testa **anche alla passata dopo**: con duecento davanti, la
    //    duecentunesima non veniva raggiunta mai. Alzare il tetto sposta il
    //    blocco più avanti, non lo toglie.
    //
    // ⭐ **Si ordina per `lastAttemptAt`, che si scrive PRIMA di ogni tentativo.**
    //    Una riga guardata scende in fondo qualunque sia l'esito, quindi la
    //    passata dopo prosegue da quelle dietro e la coda ruota. Le mai
    //    esaminate (`null`) stanno in testa.
    //
    // ⚠️ **Niente `skip`**: marcando mentre si scorre, l'ordine cambia sotto la
    //    query e uno scostamento salterebbe righe. Si rilegge dalla testa, e le
    //    già viste sono scese da sole.
    const viste = new Set<string>();
    while (
      republished + refused + failed < REPUBLISH_BATCH_LIMIT &&
      esaminate < REPUBLISH_SCAN_LIMIT
    ) {
      const batch = await this.prisma.shopifyInventorySyncState.findMany({
        where: righeInCoda(tenantId),
        select: { variantId: true, locationId: true, mismatchDetected: true },
        // ⛔ **Il secondo criterio non è ornamentale.** Le righe mai esaminate
        //    hanno `last_attempt_at` NULL **tutte quante**, e con una chiave di
        //    ordinamento uguale SQL non promette nessun ordine: quale parte
        //    prima lo decide il piano di esecuzione, e cambia da un'esecuzione
        //    all'altra. Trovato il 10/09/2026 da una prova diventata
        //    intermittente — verde da sola, rossa dentro la suite.
        //
        // ⭐ `createdAt` è il criterio giusto anche nel merito: fra righe mai
        //    esaminate parte per prima quella che aspetta da più tempo.
        //
        // ⛔ **E nemmeno `createdAt` è unico**: due righe create nella stessa
        //    transazione — un import, una migrazione, un collegamento massivo —
        //    portano lo stesso istante, e il pareggio tornerebbe identico un
        //    gradino più sotto. L'ordine si chiude su `id`, che è la chiave
        //    primaria: lì un pareggio non può esistere per costruzione.
        //
        // ⚠️ **`id` non ordina per NIENTE di significativo** — è un uuid, non
        //    una sequenza — e non deve: serve solo a rendere l'ordine TOTALE.
        //    A decidere chi parte prima restano i due criteri sopra.
        orderBy: [
          { lastAttemptAt: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: Math.min(REPUBLISH_BATCH_LIMIT, REPUBLISH_SCAN_LIMIT - esaminate),
      });
      // ⚠️ Con una coda più corta del tetto la rilettura riporta le stesse
      //    righe: senza questa guardia il ciclo le ritenterebbe all'infinito.
      const nuove = batch.filter((r) => !viste.has(`${r.variantId}@${r.locationId}`));
      if (nuove.length === 0) {
        break;
      }

      for (const row of nuove) {
        if (republished + refused + failed >= REPUBLISH_BATCH_LIMIT) {
          // Il tetto dei tentativi conclusivi è pieno: le righe restanti si
          // riprendono alla passata dopo, e `remaining` lo dice.
          break;
        }
        viste.add(`${row.variantId}@${row.locationId}`);
        esaminate += 1;
        // ⭐ **Si marca PRIMA di tentare, e la scrittura è la sola cosa che
        //    fa ruotare la coda.** Dopo sarebbe peggio: un guasto a metà
        //    lascerebbe la riga in testa per sempre, che è il difetto di prima.
        await this.prisma.shopifyInventorySyncState.updateMany({
          where: { tenantId, variantId: row.variantId, locationId: row.locationId },
          data: { lastAttemptAt: new Date() },
        });
        try {
          // ⭐ **La porta dipende da CHE COSA c'è da fare**, e non è un dettaglio.
          //
          //    `mismatchDetected` → porta di **RECUPERO**: è l'unica che supera il
          //    confronto con l'ultimo inviato — che nel caso canonico del
          //    disallineamento è proprio il valore da mettere in dubbio — e
          //    l'unica che, prima di farlo, rivaluta se il disallineamento esiste
          //    ancora e se nel frattempo è sopravvenuto un rinvio.
          //
          //    solo `localPushPending` → porta **ORDINARIA**. ⛔ E non per
          //    simmetria: quel valore è per definizione **diverso** dall'ultimo
          //    confermato — è un aggiornamento non trasmesso — quindi la
          //    scorciatoia dell'«invariata» non lo ferma, e non c'è niente da
          //    superare. Mandarlo dalla porta di recupero gli darebbe privilegi
          //    che non gli servono, su un caso che non è un disallineamento.
          const esito = row.mismatchDetected
            ? await this.inventoryPush.ripubblicaDisallineamento(
                tenantId,
                row.variantId,
                row.locationId,
              )
            : await this.inventoryPush.pushLevel(tenantId, row.variantId, row.locationId);
          // ⛔ **Si guarda l'ESITO, non il fatto che non abbia sollevato.**
          //    `pushLevel` cattura i propri errori e li restituisce: contare la
          //    chiamata invece dell'esito è ciò che rendeva la misura falsa.
          if (esito.pushed) {
            republished += 1;
          } else if (
            esito.reason === 'collegamento_escluso' ||
            esito.reason === 'divergenza_accertata' ||
            esito.reason === 'richiesta_rifiutata'
          ) {
            // ⛔ **La divergenza accertata sta QUI, non fra i guasti.** Il canale
            //    ha risposto, e la risposta è no: ripresentare la stessa
            //    operazione produrrà lo stesso rifiuto. Contarla come guasto
            //    prometterebbe che ritentando si risolve.
            //
            // ⭐ **E con lei la richiesta rifiutata**, che ha la stessa proprietà
            //    per una ragione diversa: un identificativo che non esiste o un
            //    riferimento malformato non diventano validi ripetendoli. Il
            //    rimedio però sta altrove, e a dirlo è la nota sulla riga.
            refused += 1;
          } else if (esito.reason === 'shopify_error') {
            failed += 1;
          } else {
            // `unchanged`, `rinvio_attivo`, `not_connected`, `sync_disabled`,
            // `variant_not_linked`, `location_not_linked`, `level_not_found`,
            // `tentativo_in_corso`, `tentativo_incerto`, `base_assente`,
            // `stato_cambiato`, scope mancante: nessun invio CONCLUSO, e nessuno
            // di questi è una riuscita.
            //
            // ⚠️ **`stato_cambiato` non è un guasto**: la coppia si è mossa sotto
            //    la lettura, non si è scritto niente, e a mandare quel valore
            //    sarà il push dell'operazione che l'ha mossa. Contarlo fra le
            //    fallite direbbe «riprova», quando non c'è niente da riprovare.
            //
            // ⚠️ **`tentativo_in_corso` ha due strade per arrivare qui, ed è lo
            //    stesso fatto**: un altro esecutore ha preso la prenotazione, o il
            //    canale ha risposto che quella chiave è ancora in lavorazione. In
            //    entrambi i casi «c'è un tentativo vivo su questa coppia, non se
            //    ne apre un altro» — e per la passata corrente non è successo
            //    niente.
            //
            // ⚠️ **`tentativo_incerto` e `base_assente` non hanno una classe
            //    propria, ed è la stessa scelta dichiarata sopra per il rinvio**:
            //    qui il perimetro è il ritentativo, e per entrambi «nessun invio»
            //    è vero. Il lavoro non risolto non sparisce — resta nel `reason`,
            //    nel log e nel conteggio di `remaining`, che si riconta.
            unchanged += 1;
          }
        } catch (error: unknown) {
          // Un fallimento non ferma gli altri: sono righe indipendenti, e
          // recuperarne nove su dieci è meglio che nessuna.
          failed += 1;
          const message = error instanceof Error ? error.message : 'Errore sconosciuto';
          this.logger.warn(
            `Ripubblicazione non riuscita (${tenantId}) variante ${row.variantId} @ ${row.locationId}: ${message}`,
          );
        }
      }
    }

    // ⭐ Ricontato, non dedotto: è l'unico numero che corrisponde a ciò che
    //    resta davvero da risolvere.
    const remaining = await this.contaInCoda(tenantId);
    const conclusivi = republished + refused + failed;
    this.logger.log(
      `Ripubblicazione disallineamenti (${tenantId}): ${republished} ripubblicate, ` +
        `${unchanged} senza invio, ${refused} rifiutate, ${failed} fallite ` +
        `su ${esaminate} esaminate (${conclusivi} tentativi conclusivi); ` +
        `${remaining} ancora da risolvere.`,
    );

    return {
      pending,
      attempted: esaminate,
      republished,
      unchanged,
      refused,
      failed,
      remaining,
    };
  }

  /**
   * ⚠️ **Deve contare le STESSE righe che il lotto prende.** Se il conteggio
   *    guardasse il solo `mismatchDetected`, una coda fatta di soli
   *    aggiornamenti pendenti risulterebbe **vuota** e la passata uscirebbe
   *    subito: il lavoro esisterebbe e nessuno lo vedrebbe. È lo stesso
   *    disallineamento fra due letture che `P9` ha già pagato una volta.
   */
  private contaInCoda(tenantId: string): Promise<number> {
    return this.prisma.shopifyInventorySyncState.count({ where: righeInCoda(tenantId) });
  }
}
