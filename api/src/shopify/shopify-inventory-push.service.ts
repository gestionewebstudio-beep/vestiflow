import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformAuditActor,
  PlatformAuditOperation,
  ShopifyConnectionStatus,
} from '@prisma/client';

import { PlatformAuditService } from '../common/audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import {
  gidArticoloInventario,
  gidVariante,
  ShopifyLinkHistoryService,
} from './shopify-link-history.service';
import {
  ClasseRifiutoInventario,
  classificaRifiutiInventario,
  motiviDi,
} from './shopify-inventory-user-error.util';
import { gidSede, isSameShopifyLocationId } from './shopify-location-id.util';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';
import { SHOPIFY_WRITE_INVENTORY_SCOPE, shopifyHasScope } from './shopify-scopes.util';

/**
 * Per quanto Shopify garantisce che la stessa chiave non riapplichi l'effetto.
 *
 * ⛔ **Ventiquattro ore, e non è una scelta nostra**: è la finestra dichiarata
 *    dalla documentazione Shopify per la conservazione delle chiavi di
 *    idempotenza. Oltre quella, ripetere la stessa chiave **non garantisce più
 *    la deduplicazione** — e un tentativo ancora incerto non si può reinviare
 *    automaticamente fingendo il contrario.
 *
 * ⚠️ **La versione dell'Admin API di questo progetto è `2026-07`**, quella in
 *    cui `@idempotent(key:)` è richiesta. La finestra non è verificabile da qui:
 *    servirebbe una prova contro il negozio, che è un'autorizzazione a sé.
 */
const FINESTRA_IDEMPOTENZA_MS = 24 * 60 * 60 * 1000;

/**
 * Quante volte si riprova la presa quando la coppia si muove sotto la lettura.
 *
 * ⭐ **Tre, e non è un numero magico da tarare**: ogni giro è una lettura e una
 *    scrittura condizionata, entrambe brevissime. Perché falliscano tre giri di
 *    fila serve che tre operazioni locali cadano dentro quella finestra — e in
 *    quel caso ognuna di loro ha il proprio push, quindi il valore parte
 *    comunque. Il tetto non serve a farcela: serve a **non ciclare**.
 */
const GIRI_PRESA = 3;

/** L'operazione presa: chiave, valore, confronto e destinazione di ALLORA. */
interface TentativoPrenotato {
  readonly chiave: string;
  readonly valore: number;
  readonly base: number;
  readonly inventoryItemId: string;
  readonly locationRef: string;
}

/** I campi dello stato sync che il push legge, in un posto solo. */
const STATO_SYNC = {
  lastPushedAvailable: true,
  lastObservedShopifyAvailable: true,
  lastPushedAt: true,
  lastObservedAt: true,
  mismatchDetected: true,
  localPushPending: true,
  // ⛔ **Ci sono DUE letture dello stato**, e vanno tenute allineate: questa e
  //    la `$queryRaw` di `leggiCoppia`. Aggiungendo le colonne solo alla seconda,
  //    il ramo composto non è mai partito e l'invio è tornato in silenzio al
  //    valore assoluto — verde nei tipi, sbagliato nel comportamento.
  localPendingDelta: true,
  channelAcquiredDelta: true,
  pendingKey: true,
  pendingAvailable: true,
  pendingBase: true,
  pendingShopDomain: true,
  pendingItemId: true,
  pendingLocationRef: true,
  pendingAt: true,
} as const;

/**
 * Il valore ATTESO del confronto: ciò che VestiFlow crede che il canale porti.
 *
 * ⛔ **Non è una lettura fresca di Shopify, ed è la differenza che decide.** Una
 *    lettura dice il numero e non dice se lo si è capito: nel controesempio del
 *    proprietario — negozio a 8 per due ordini, VestiFlow che ne ha acquisito
 *    uno solo e crede 9 — leggere 8 e scrivere 9 «se sei ancora a 8» **riesce**,
 *    perché fra la lettura e la scrittura non cambia niente. Confrontando invece
 *    con la propria convinzione (10, mai aggiornata) la scrittura viene
 *    **rifiutata**, ed è l'esito giusto: significa «non so cosa è successo là».
 *
 * ⭐ **È SOLO l'ultimo valore CONFERMATO da noi.** `null` quando non ne esiste
 *    nessuno, e in quel caso non c'è una base — vedi il ramo del primo invio.
 *
 * ⛔ **L'ULTIMO OSSERVATO NON È UNA BASE, e provarlo è costato due volte lo
 *    stesso errore.** Una notifica dice che cosa il canale MOSTRA; non dice che
 *    VestiFlow abbia acquisito gli effetti che l'hanno prodotta. Usandola come
 *    base si riapre il controesempio da un'altra porta:
 *
 *      confermato 10 · remoto 8 · notifica 8 arrivata DOPO la conferma
 *      Disponibile locale 9, perché manca un ordine
 *      base = osservato 8, remoto 8  →  il confronto PASSA  →  si scrive 9
 *
 *    Un pezzo venduto torna in vendita, e il confronto non se n'è accorto —
 *    esattamente come leggendo Shopify un istante prima. Prova `B1`.
 *
 * ⚠️ **E nemmeno la convinzione confermata è a prova di tutto**: se coincide con
 *    il remoto per caso — due effetti che si compensano, un ordine che non ha
 *    ancora toccato l'inventario — il confronto passa e non protegge. La
 *    separazione delle origini resta un blocco successivo (`DA-FARE` §29).
 */
function baseDiConfronto(
  stato: { readonly lastPushedAvailable: number | null } | null,
): number | null {
  return stato?.lastPushedAvailable ?? null;
}

/**
 * Lo SCARICO dell'invio ordinario: `L -= T − R` e `C -= R − P`.
 *
 * ⭐ **Sono gli stessi numeri che la conferma calcolava da sé**, portati dove la
 *    decisione avviene. Il riallineamento ne produce di diversi — `L -= L_w −
 *    (A_w − T)` e `C -= C_w` — e la conferma non ha modo di distinguerli.
 *
 * ⚠️ **Fotografare `P` è sicuro**: il tentativo è unico per riga, quindi fra la
 *    presa e la conferma nessun altro invio può muoverlo.
 */
function scarichiInvioOrdinario(
  valore: number,
  base: number,
  stato:
    | { readonly lastPushedAvailable: number | null; readonly localPendingDelta: number | null }
    | null
    | undefined,
): { readonly scaricoLocale: number | null; readonly scaricoCanale: number | null } {
  // ⛔ **Su una riga SENZA base non si fotografa niente, ed è la guardia che
  //    impedisce l'inizializzazione nascosta.** La conferma tratta la
  //    fotografia come il segnale che la riga sta nel regime nuovo: se l'invio
  //    ordinario la scrivesse anche dove `L` è `NULL`, il primo push
  //    qualunque porterebbe quella riga dentro il regime composto — che è
  //    esattamente ciò che la partenza controllata esiste per non fare.
  if (stato?.localPendingDelta === null || stato?.localPendingDelta === undefined) {
    return { scaricoLocale: null, scaricoCanale: null };
  }
  return {
    scaricoLocale: valore - base,
    scaricoCanale: base - (stato.lastPushedAvailable ?? base),
  };
}

export type ShopifyInventoryPushSkipReason =
  | 'not_connected'
  | 'missing_write_inventory_scope'
  | 'sync_disabled'
  | 'variant_not_linked'
  | 'location_not_linked'
  | 'level_not_found'
  | 'unchanged'
  /** 26.8 · lo storico vieta di usare quel collegamento: nessuna quantità parte. */
  | 'collegamento_escluso'
  /**
   * Caso C · la riconciliazione RINVIA questa coppia, e il recupero non la
   * scavalca. Solo il percorso interno di recupero può restituirlo.
   */
  | 'rinvio_attivo'
  /**
   * Un altro esecutore ha già preso il tentativo su questa coppia: non se ne
   * crea un secondo, e non si scrive niente.
   */
  | 'tentativo_in_corso'
  /**
   * ⛔ Un tentativo è rimasto INCERTO oltre la finestra di idempotenza:
   * ripeterlo non è più deduplicato, e reinviarlo alla cieca potrebbe
   * applicarlo una seconda volta. Richiede riconciliazione, e nel frattempo le
   * modifiche locali successive restano pendenti — non si perdono.
   */
  | 'tentativo_incerto'
  /**
   * ⛔ Manca una base CONFERMATA da cui confrontare: è il primo invio su quella
   * coppia. Non si invia, e l'esito lo dice.
   *
   * ⚠️ **Protezione PROVVISORIA, autorizzata il 09/09/2026.** Non è la regola
   * definitiva: quale sia il valore di partenza di una coppia mai pubblicata
   * dipende dalla scelta delle **quantità iniziali per sede**, che è aperta
   * (`docs/24` §12.0, §12.9). Finché non è decisa, l'unica cosa sicura è **non
   * scrivere**: zero, l'ultimo osservato e l'esclusione del confronto sarebbero
   * tre modi diversi di decidere al posto del proprietario.
   */
  | 'base_assente'
  /**
   * ⛔ Il canale ha **rifiutato** la scrittura: la quantità là non è quella che
   * VestiFlow credeva. È una **divergenza accertata**, non un guasto — la
   * scrittura non è avvenuta e non avverrà insistendo.
   *
   * ⚠️ Il tentativo si chiude (l'esito è definito), il valore confermato **non**
   * avanza, e l'aggiornamento locale resta pendente: il lavoro non risolto
   * resta visibile. ⏸ Stabilire quale quantità sia corretta è la
   * **riconciliazione**, che è un blocco a sé.
   */
  | 'divergenza_accertata'
  /**
   * ⛔ Il canale ha rifiutato la **richiesta**, non la quantità: un
   * identificativo che non esiste, un riferimento malformato, un permesso, o
   * una chiave riusata con parametri diversi.
   *
   * ⭐ **Distinto da `divergenza_accertata` apposta.** I due chiedono di
   * guardare in due posti opposti: la divergenza chiede di riconciliare le
   * quantità, questo chiede di riguardare il collegamento o la richiesta.
   * Sotto un'unica etichetta, il secondo si legge come il primo e nessuno va a
   * controllare la mappatura.
   */
  | 'richiesta_rifiutata'
  /**
   * ⛔ La coppia (Disponibile, ultimo confermato) è cambiata fra la lettura e
   * la presa, per più giri di fila: **non si è scritto niente**.
   *
   * ⭐ **Non è «invariata» e non è un guasto.** A muoverla è stata un'altra
   * operazione locale sulla stessa coppia, e quell'operazione ha il proprio
   * push post-commit: il valore parte di lì. Dirlo con una parola sua evita di
   * affermare «niente da fare» quando invece c'è, e da un'altra parte.
   */
  | 'stato_cambiato';

export interface ShopifyInventoryPushResult {
  readonly pushed: boolean;
  readonly reason?: ShopifyInventoryPushSkipReason | 'shopify_error';
  readonly publishableAvailable?: number;
}

/**
 * Push inventario VestiFlow → Shopify (post-commit, best-effort).
 *
 * Pubblica `max(0, available)` sul campo REST `available` (NON `on_hand`) e
 * registra l'ultimo inviato per l'anti-loop.
 *
 * ⛔ **Qui c'era `max(0, onHand - committed - safetyStock)`**, cioè una formula
 *    che il codice non usa più da 26.9: il Disponibile è la colonna, e la scorta
 *    di sicurezza è stata rimossa. Corretto il 09/09/2026 — un commento che
 *    descrive un calcolo diverso da quello eseguito è peggio di nessun commento,
 *    perché chiude la domanda invece di lasciarla aperta.
 */
@Injectable()
export class ShopifyInventoryPushService {
  private readonly logger = new Logger(ShopifyInventoryPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly reconciliation: ShopifyInventoryReconciliationService,
    private readonly storico: ShopifyLinkHistoryService,
    private readonly registro: PlatformAuditService,
  ) {}

  /**
   * Il push ORDINARIO: una variazione locale che si porta al canale.
   *
   * ⛔ **Conserva la scorciatoia dell'«invariata»**, e deve conservarla: qui la
   *    domanda è «è cambiato qualcosa da mandare?», e la risposta è l'ultimo
   *    inviato. Lo chiamano documenti, movimenti, riconciliazione e la porta
   *    unica dei canali: nessuno di loro può chiedere una ripubblicazione.
   */
  async pushLevel(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    return this.esegui(tenantId, variantId, locationId, 'ordinario');
  }

  /**
   * Il percorso INTERNO di recupero di un disallineamento (`mismatchDetected`).
   *
   * ⭐ **Supera un confronto solo**, quello con l'ultimo inviato — che nel caso
   *    canonico del disallineamento è proprio il valore messo in dubbio: Shopify
   *    mostra un numero diverso, VestiFlow non ha cambiato il proprio, e il push
   *    ordinario si ferma prima di partire. Tutto il resto resta in piedi.
   *
   * ⛔ **Non è un invio forzato, e non c'è nessun modo di chiederne uno.** Non
   *    esiste parametro, campo di richiesta o rotta che accenda questo percorso:
   *    lo raggiunge soltanto il ritentativo delle quantità, e prima di inviare
   *    rivaluta — non eredita — le condizioni che lo autorizzano.
   *
   * ⚠️ **Una selezione precedente non è un'autorizzazione permanente**: fra il
   *    momento in cui la coda è stata letta e questo invio possono essere
   *    passate decine di righe, e nel frattempo il disallineamento può essere
   *    stato risolto o può essere sopravvenuto un rinvio.
   */
  async ripubblicaDisallineamento(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    return this.esegui(tenantId, variantId, locationId, 'recupero');
  }

  /**
   * Il RIALLINEAMENTO esplicito di una coppia — VestiFlow → Shopify.
   *
   * ⭐ **È l'operazione che una persona ASSERISCE**: «la verità è questa,
   *    scrivila». Non deduce e non calcola una base — crea le condizioni in cui
   *    è vera, e per questo è legittima dove indovinare non lo sarebbe.
   *
   * ⭐ **E l'inizializzazione delle righe esistenti non è una migrazione: è il
   *    primo uso di questo comando** (§31.12). Una riga senza base la riceve
   *    qui, alla conferma di una NOSTRA scrittura — mai al primo push ordinario.
   *
   * ⛔ **Tutte le guardie restano quelle del push**: connessione, scope,
   *    interruttore di sincronizzazione, sede mappata, storico dei
   *    collegamenti, tentativo aperto, confronto remoto. Questo modo non ne
   *    scavalca nessuna — cambia solo QUALE valore si asserisce e come si
   *    scaricano i contatori.
   *
   * ⚠️ **Non acquisisce ordini, e non deve** (§31.-1): Allinea corregge le
   *    disponibilità, gli ordini arrivano per la loro strada.
   */
  async riallineaCoppia(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    return this.esegui(tenantId, variantId, locationId, 'riallineamento');
  }

  private async esegui(
    tenantId: string,
    variantId: string,
    locationId: string,
    modo: 'ordinario' | 'recupero' | 'riallineamento',
  ): Promise<ShopifyInventoryPushResult> {
    // ⭐ I due booleani restano, perché il resto del percorso li usa come prima:
    //    il modo nuovo si aggiunge, non riscrive le decisioni già collaudate.
    const recupero = modo === 'recupero';
    const riallineamento = modo === 'riallineamento';
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { pushed: false, reason: 'not_connected' };
    }

    if (!shopifyHasScope(connection.scopes, SHOPIFY_WRITE_INVENTORY_SCOPE)) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): scope ${SHOPIFY_WRITE_INVENTORY_SCOPE} assente`,
      );
      return { pushed: false, reason: 'missing_write_inventory_scope' };
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, tenantId },
      select: {
        id: true,
        sku: true,
        shopifyInventoryItemId: true,
        shopifyVariantId: true,
        product: { select: { shopifySyncEnabled: true } },
      },
    });
    if (!variant) {
      return { pushed: false, reason: 'variant_not_linked' };
    }
    // ⛔ «Sincronizza con Shopify» spento ferma TUTTI i flussi, inventario
    //    compreso (docs/24 §1.8). Qui il flag non veniva letto: il catalogo si
    //    congelava e lo stock continuava a partire — l'interruttore prometteva
    //    una cosa e ne faceva un'altra.
    if (!variant.product.shopifySyncEnabled) {
      return { pushed: false, reason: 'sync_disabled' };
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { shopifyLocationId: true, name: true },
    });
    if (!location?.shopifyLocationId) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): location ${locationId} senza shopifyLocationId`,
      );
      return { pushed: false, reason: 'location_not_linked' };
    }

    // ⭐ **Disponibile e stato sync in UNA lettura**, non due: vedi `leggiCoppia`.
    //    ⚠️ `available` è il numero, non un ingrediente: Giacenza e Impegnata si
    //    leggono solo per il log — dicono da dove viene il Disponibile, non lo
    //    ricalcolano.
    let coppia = await this.leggiCoppia(tenantId, variantId, locationId);
    if (!coppia) {
      return { pushed: false, reason: 'level_not_found' };
    }
    let level = coppia;

    // ⛔ **Qui si RICALCOLAVA `onHand - committed`**, cioè un secondo Disponibile
    //    accanto a quello che il gestionale mantiene e che l'operatore legge a
    //    schermo. Sostituito il 09/09/2026 con la lettura della colonna, dopo
    //    aver verificato che l'invariante è mantenuto da tutti i percorsi di
    //    scrittura. Verso il canale resta il solo clamp a zero.
    let publishable = computeShopifyPublishableAvailable(level.available);

    // ── 26.8 · lo STORICO, prima di usare qualunque identificativo remoto ───
    //
    // ⛔ **Sta PRIMA del controllo «invariata», e non è un dettaglio.** La
    //    risposta a «posso usare questo collegamento?» non deve dipendere dal
    //    fatto che il numero sia per caso uguale all'ultimo inviato: altrimenti
    //    lo stesso collegamento vietato risponde `unchanged` o
    //    `collegamento_escluso` secondo la storia dei push precedenti. È la
    //    stessa ragione per cui in 26.7 la sicurezza non dipende dall'essere
    //    passati dal ripristino.
    //
    // ⚠️ **Costo dichiarato**: due letture in più (il negozio e l'identità) su
    //    ogni livello, compresi i moltissimi che finiscono in `unchanged`. È il
    //    moltiplicatore per riga che la pipeline C4 vuole togliere; toglierlo
    //    qui, a scapito della verifica, sarebbe il baratto sbagliato.
    const escluso = await this.collegamentoDellaVarianteEscluso(tenantId, variant, locationId);
    if (escluso) {
      // ⛔ **Nessun invio, e NESSUNO ZERO al posto del rifiuto**: mandare zero
      //    sarebbe una scrittura remota attraverso il collegamento vietato, e
      //    per giunta toglierebbe dalla vendita un prodotto che nessuno ha
      //    chiesto di ritirare.
      return { pushed: false, reason: 'collegamento_escluso', publishableAvailable: publishable };
    }

    const syncState = coppia.stato;

    // ── il TENTATIVO in sospeso si risolve PRIMA di ogni altra decisione ────
    //
    // ⛔ **Prima anche dell'«invariata», e non è un dettaglio d'ordine.**
    //    Confermato 10, inviato 9 con risposta persa, poi una modifica locale
    //    che riporta il Disponibile a 10: il valore da mandare coincide con
    //    l'ultimo confermato, e la scorciatoia risponderebbe «invariata»
    //    lasciando il tentativo aperto per sempre — mentre il canale è a 9.
    //    Prova `B2`.
    //
    // ⛔ **La prenotazione NON è l'ultimo confermato.** Usare `lastPushedAvailable`
    //    come lucchetto lo farebbe avanzare prima dell'invio: un processo che
    //    morisse fra la presa e la chiamata avrebbe segnato come trasmesso ciò
    //    che non è mai partito. Sono due colonne diverse perché sono due fatti
    //    diversi — «sto provando» e «il canale ha confermato».
    let stato = syncState;
    if (stato?.pendingKey) {
      const fermata = await this.risolviTentativoAperto(tenantId, variantId, locationId, stato, {
        // ⭐ La destinazione ATTUALE, per confrontarla con quella memorizzata.
        //    Sono gli stessi identificativi che le guardie qui sopra — storico
        //    compreso — hanno appena autorizzato.
        itemId: variant.shopifyInventoryItemId,
        locationRef: location.shopifyLocationId,
      });
      if (fermata) {
        return { ...fermata, publishableAvailable: publishable };
      }
      // ⛔ **Si rilegge la COPPIA, non il solo stato.** Qui c'era
      //    `leggiStato`, e fra la lettura del Disponibile e questo punto c'è
      //    passata una **chiamata di rete a Shopify**: la finestra più larga di
      //    tutte. Una modifica locale arrivata nel frattempo restava fuori dal
      //    `publishable`, e il push rispondeva «invariata» confrontando un
      //    valore vecchio con un confermato nuovo. Prova `P9-bis`.
      const riletta = await this.leggiCoppia(tenantId, variantId, locationId);
      if (!riletta) {
        return { pushed: false, reason: 'level_not_found' };
      }
      coppia = riletta;
      level = riletta;
      stato = riletta.stato;
      publishable = computeShopifyPublishableAvailable(riletta.available);
    }

    // ⛔ **La scorciatoia dell'«invariata» guarda il DISPONIBILE, e nel regime
    //    composto e' la domanda sbagliata.** Un carico locale +1 e un ordine
    //    online −1 acquisito lasciano il Disponibile dov'era: la scorciatoia
    //    direbbe «niente da fare» mentre `L` vale +1 e va trasmesso.
    //
    // ⭐ Con una base, a dire se c'e' lavoro e' `L`, e lo decide il valore
    //    composto piu' avanti — che spegne anche il pendente quando serve.
    const haBase = stato?.localPendingDelta !== null && stato?.localPendingDelta !== undefined;
    // ⛔ **Il RIALLINEAMENTO non passa da nessuna delle due scorciatoie.** Non
    //    da questa, perché «l'ultimo confermato è uguale al Disponibile» non
    //    dice niente su che cosa porti il canale — ed è proprio la divergenza
    //    fra i due che il comando corregge. E non da `recuperoDaFermare`, che
    //    rivaluta un disallineamento OSSERVATO: qui si asserisce, non si
    //    rimedia a un'osservazione.
    if (riallineamento) {
      // nessuna scorciatoia: si legge il canale e si decide sui numeri veri
    } else if (!recupero) {
      if (!haBase && stato?.lastPushedAvailable === publishable) {
        // ⭐ **Se c'era un pendente, qui si spegne.** Non c'è più niente da
        //    trasmettere: il canale ha già quel valore. ⚠️ La scrittura avviene
        //    SOLO se il pendente è acceso — lo dice la lettura coerente che
        //    abbiamo già in mano — così i moltissimi push che finiscono in
        //    «invariata» non pagano una query in più.
        if (stato.localPushPending) {
          await this.spegniInvioLocalePendente(tenantId, variantId, locationId, publishable);
        }
        return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
      }
    } else {
      const trattenuto = await this.recuperoDaFermare(
        tenantId,
        variantId,
        locationId,
        stato,
        publishable,
        variant.sku ?? variant.id,
      );
      if (trattenuto) {
        return trattenuto;
      }
    }

    // ── senza una base CONFERMATA non si scrive ─────────────────────────────
    //
    // ⛔ **Protezione provvisoria e dichiarata.** Sulla prima pubblicazione di
    //    una coppia non esiste un valore da confrontare, e le tre scorciatoie
    //    disponibili sono tutte decisioni travestite: mandare zero, usare
    //    l'ultimo osservato — che non prova l'acquisizione — o omettere il
    //    confronto e scrivere alla cieca. Quale sia il valore di partenza è la
    //    scelta delle quantità iniziali per sede, che resta del proprietario.
    //
    // ⚠️ **Non tocca niente in locale**: il Disponibile resta quello che è, e
    //    l'operazione si ripresenterà appena la base esisterà.
    let base = baseDiConfronto(stato);
    // ⭐ **Il RIALLINEAMENTO non ha bisogno dell'ultimo confermato, ed è la
    //    ragione per cui esiste.** Questa guardia ferma la PRIMA pubblicazione
    //    perché non c'è un valore da confrontare — e la risposta non è
    //    inventarlo, è leggerlo dal canale: il confronto del riallineamento è
    //    `R`, letto fresco, non `P`.
    //
    // ⛔ **Per gli altri due percorsi la guardia resta intatta**: senza base non
    //    si scrive, e la coppia si ripresenterà quando la base esisterà — cioè
    //    dopo che qualcuno avrà premuto Allinea.
    if (base === null && !riallineamento) {
      this.logger.warn(
        `Push inventario non inviato (${tenantId}): variante ${variantId} @ ${locationId} ` +
          'non ha un ultimo valore confermato da cui confrontare. Serve la scelta delle ' +
          'quantità iniziali per sede prima di poter pubblicare la prima volta.',
      );
      return { pushed: false, reason: 'base_assente', publishableAvailable: publishable };
    }

    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      const inventoryItemId = await this.resolveInventoryItemId(variant, shopDomain, accessToken);
      if (!inventoryItemId) {
        this.logger.debug(
          // Lo SKU è il nome con cui si riconosce una variante, ma può mancare:
          // Shopify non lo garantisce, e in import arrivano varianti senza. La
          // riga diceva «variante null» e non permetteva di risalire a quale,
          // cioè era una segnalazione che non si poteva seguire. L'id c'è
          // sempre, e vale come ripiego.
          `Push inventario saltato (${tenantId}): variante ${variant.sku || variant.id} non collegata a Shopify`,
        );
        return { pushed: false, reason: 'variant_not_linked' };
      }

      // ── il VALORE COMPOSTO, per le righe che hanno una base ──────────────
      //
      // ⭐ **`T = max(0, R + L)`**: si legge che cosa porta il canale ADESSO e ci
      //    si applica sopra il solo lavoro LOCALE. Un ordine online già
      //    applicato da Shopify sta in `C` e non entra in `T`, quindi non gli
      //    viene rimandato indietro — che è il difetto da cui è partito tutto.
      //
      // ⛔ **Solo se la base esiste.** Con `L` a NULL la riga resta nel regime
      //    di prima, valore assoluto e confronto sull'ultimo confermato: la base
      //    la crea la PARTENZA CONTROLLATA (§31.-1), e nessun invio ordinario la
      //    inventa di nascosto.
      //
      // ⚠️ **Qui il CONFRONTO cambia**, e va detto: passa dall'ultimo confermato
      //    al remoto appena letto. È la protezione giusta per una scrittura
      //    composta — garantisce che fra la lettura e la scrittura il canale non
      //    si sia mosso — ma è un cambio di regime, non un dettaglio. `B1`
      //    fotografa quello vecchio e va riesaminata.
      // ⛔ **La GUARDIA della presa e il CONFRONTO da inviare sono due cose
      //    diverse, e confonderle rompe tutto.** La guardia dice «la riga non si
      //    e' mossa da quando l'ho letta» e si misura sull'ultimo confermato; il
      //    confronto e' cio' che si manda a Shopify, e nel regime composto e' il
      //    remoto appena letto. Tenerle uguali faceva fallire la presa a ogni
      //    giro, e l'invio tornava in silenzio al valore assoluto.
      let baseAttesa = base;
      /**
       * Lo scarico del RIALLINEAMENTO, deciso insieme al valore da asserire.
       *
       * ⭐ `null` finché il modo non è quello: la presa usa allora la forma
       *    ordinaria, e la conferma la sua formula.
       */
      let scarichiRiallineamento: {
        readonly scaricoLocale: number;
        readonly scaricoCanale: number;
      } | null = null;
      /** ⭐ Il canale porta già il valore: si prende e si conferma, senza scrivere. */
      let soloBase = false;

      /**
       * Il valore che il RIALLINEAMENTO asserisce, letto il canale.
       *
       * ⭐ **Non compone: asserisce.** `T = max(0, A_w)` è il Disponibile di
       *    VestiFlow, e il confronto è `R` letto fresco — non l'ultimo
       *    confermato, che su una riga alla prima pubblicazione non esiste.
       *
       * ⭐ **E lo scarico si decide qui**, sui valori fotografati in questa
       *    stessa lettura coerente:
       *
       * ```text
       *    L -= L_w − (A_w − T)      il residuo che il clamp non ha trasmesso
       *    C -= C_w                  gli effetti di canale acquisiti: spiegati
       * ```
       *
       * ⚠️ Su una riga SENZA base `L_w` e `C_w` valgono zero, e la conferma fa
       *    partire i contatori da zero: è così che la base nasce, alla conferma
       *    di una nostra scrittura.
       */
      const asserisci = async (): Promise<
        { valore: number; confronto: number } | 'solo_base' | 'canale_muto'
      > => {
        if (!location.shopifyLocationId) {
          return 'canale_muto';
        }
        const remoto = await this.shopifyGraphql.getRemoteLevelAtLocation(
          shopDomain,
          accessToken,
          inventoryItemId,
          location.shopifyLocationId,
        );
        if (!remoto.found) {
          this.logger.debug(
            `Riallineamento senza lettura remota (${tenantId}): ${variant.sku ?? variantId} @ ` +
              `${locationId} — ${remoto.reason}`,
          );
          return 'canale_muto';
        }
        const R = remoto.available;
        const Aw = level.available;
        const T = publishable;
        const Lw = stato?.localPendingDelta ?? 0;
        const Cw = stato?.channelAcquiredDelta ?? 0;
        scarichiRiallineamento = {
          scaricoLocale: Lw - (Aw - T),
          scaricoCanale: Cw,
        };
        // ⭐ **«Si aggiorna solo ciò che differisce»** (§31.12): se il canale
        //    porta già quel numero non si scrive, e non si consuma quota.
        //
        // ⛔ **Ma la BASE si stabilisce lo stesso, e non è un dettaglio.**
        //    VestiFlow 10 e Shopify 10 è il caso normale dopo un import
        //    iniziale: uscire di qui senza base lascerebbe la coppia fuori
        //    dalla sincronizzazione continua per sempre, e ripremere non
        //    cambierebbe niente. L'operatore dovrebbe cambiare una quantità per
        //    finta per farla entrare — che è assurdo.
        //
        // ⭐ **E non stiamo indovinando**: `R` è una lettura FRESCA, e dice che
        //    il canale porta esattamente il valore di VestiFlow. Per fissare la
        //    base serve sapere quanto vale il canale, non averlo scritto noi.
        if (T === R) {
          return 'solo_base';
        }
        return { valore: T, confronto: R };
      };

      /** Compone il valore da inviare. `null` se non c'e' niente da mandare. */
      const componi = async (): Promise<
        { valore: number; confronto: number } | 'nessun_invio' | 'canale_muto' | null
      > => {
        // ⛔ **Qui c'era `!recupero`, e rimandava il ritentativo al vecchio
        //    totale assoluto anche sulle righe inizializzate.** Ritentare non e'
        //    premere Allinea: il recupero deve trasmettere lo stesso valore che
        //    trasmetterebbe l'invio ordinario, non asserire un totale.
        //
        // ⚠️ Ne discende che un disallineamento OSSERVATO con `L = 0` non produce
        //    nessuna scrittura, ed e' giusto: una quantita' cambiata a mano sul
        //    canale non e' un problema nostro (§31.-1), e a correggerla e' il
        //    comando Allinea — non un ritentativo che la sovrascrive di nascosto.
        const L = stato?.localPendingDelta ?? null;
        // ⚠️ Senza sede remota non c'è niente da leggere: la coppia non è
        //    collegata, e il percorso di prima la gestisce già.
        if (L === null || !location.shopifyLocationId) {
          return null;
        }
        const remoto = await this.shopifyGraphql.getRemoteLevelAtLocation(
          shopDomain,
          accessToken,
          inventoryItemId,
          location.shopifyLocationId,
        );
        if (!remoto.found) {
          // ⛔ Un'assenza non e' uno zero: non si compone su un valore inventato.
          this.logger.warn(
            `Push inventario non inviato (${tenantId}): ${variantId} @ ${locationId} — ` +
              `lettura del canale senza valore (${remoto.reason}). Nessuna composizione.`,
          );
          return 'canale_muto';
        }
        const R = remoto.available;
        const T = computeShopifyPublishableAvailable(R + L);

        // ⛔ **DUE termini, e servono tutti e due.** `L !== 0` è il divieto di
        //    normalizzazione: senza lavoro locale non si tocca il canale, nemmeno
        //    se porta un numero che non ci piace. `T !== R` toglie la scrittura
        //    che non cambia niente — che con un residuo negativo permanente
        //    sarebbe a ogni giro, per sempre.
        if (L === 0 || T === R) {
          return 'nessun_invio';
        }
        return { valore: T, confronto: R };
      };

      // ⭐ **Il riallineamento asserisce, gli altri due compongono.** È l'unica
      //    differenza nel calcolo del valore: tutto ciò che viene dopo — presa,
      //    scrittura, conferma, classificazione dei rifiuti — è lo stesso.
      const composto = riallineamento ? await asserisci() : await componi();
      if (composto === 'canale_muto') {
        return { pushed: false, reason: 'level_not_found', publishableAvailable: publishable };
      }
      // ⭐ **Il canale porta GIÀ il valore di VestiFlow**: non si scrive, ma la
      //    base si stabilisce lo stesso. Da qui la coppia entra nel regime
      //    continuo, e senza consumare una sola chiamata al canale.
      if (composto === 'solo_base') {
        base = publishable;
        soloBase = true;
      }
      if (composto === 'nessun_invio') {
        if (stato?.localPushPending) {
          await this.spegniInvioLocalePendente(tenantId, variantId, locationId, publishable);
        }
        return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
      }
      if (composto && composto !== 'solo_base') {
        publishable = composto.valore;
        base = composto.confronto;
        // ⭐ **L'avviso del recupero, sui numeri VERI**: `confronto` è `R` letto
        //    fresco, `valore` è `T`. Sono i due che viaggiano verso Shopify.
        if (recupero) {
          this.avvisaSeAlza(
            tenantId,
            variant.sku ?? variant.id,
            locationId,
            composto.confronto,
            composto.valore,
            'lettura fresca del canale',
          );
        }
      }

      // ⭐ **Si registra PRIMA di chiamare**, e la presa è atomica: due
      //    esecutori non creano due operazioni indipendenti — il secondo
      //    riconosce quella in corso e si ferma.
      // ⭐ **Ciclo ottimistico, non un lucchetto.** Se fra la lettura coerente e
      //    la presa la coppia si è mossa, la presa fallisce: si rilegge, si
      //    rivalutano «invariata» e la base sui valori NUOVI, e si riprova. Non
      //    si tiene niente bloccato, e non si scrive niente basato su un valore
      //    che non c'è più.
      //
      // ⛔ **Il fallimento ha DUE cause e non vanno confuse**: un altro
      //    esecutore ha la presa (`tentativo_in_corso`, ci si ferma) oppure i
      //    valori sono cambiati (si riprova). Dirlo in un modo solo direbbe il
      //    falso metà delle volte.
      // ⛔ **Non si scrive senza un confronto, in nessuno dei tre modi.** Per
      //    l'ordinario e il recupero la guardia `base_assente` l'ha già
      //    garantito; per il riallineamento il confronto è `R`, appena assegnato
      //    da `asserisci()`. Questa riga non è una formalità di tipi: se un
      //    domani un percorso arrivasse qui senza confronto, la scrittura
      //    partirebbe alla cieca invece di fermarsi.
      if (base === null) {
        this.logger.warn(
          `Push inventario non inviato (${tenantId}): variante ${variantId} @ ${locationId} ` +
            'è arrivata alla scrittura senza un valore di confronto. Nessuna scrittura.',
        );
        return { pushed: false, reason: 'base_assente', publishableAvailable: publishable };
      }

      let prenotato: TentativoPrenotato | null = null;
      for (let giro = 0; giro < GIRI_PRESA && !prenotato; giro += 1) {
        // ⛔ **Il confronto si ricontrolla a ogni giro**, non solo prima del
        //    ciclo: dopo una ricomposizione `base` è stato riassegnato, e senza
        //    confronto non si scrive — in nessuno dei tre modi.
        const confronto = base;
        if (confronto === null) {
          this.logger.warn(
            `Push inventario non inviato (${tenantId}): variante ${variantId} @ ${locationId} ` +
              'è arrivata alla presa senza un valore di confronto. Nessuna scrittura.',
          );
          return { pushed: false, reason: 'base_assente', publishableAvailable: publishable };
        }
        prenotato = await this.prenotaTentativo(tenantId, variantId, locationId, {
          valore: publishable,
          base: confronto,
          shopDomain,
          inventoryItemId,
          locationRef: location.shopifyLocationId,
          baseAttesa,
          // ⭐ Il bersaglio è stato calcolato su QUESTO `L`: se nel frattempo si
          //    è mosso, la presa deve fallire e il ciclo ricomporre.
          lAtteso: stato?.localPendingDelta ?? null,
          disponibileAtteso: level.available,
          // ⭐ **Lo scarico si decide QUI**, insieme al valore da inviare: è
          //    l'unico punto che sa quale percorso ha deciso che cosa mandare.
          ...(scarichiRiallineamento ?? scarichiInvioOrdinario(publishable, confronto, stato)),
          // ⛔ **Solo il riallineamento fa nascere i contatori**, ed è la stessa
          //    guardia di `scarichiInvioOrdinario`: un push qualunque non porta
          //    una riga dentro il regime nuovo.
          inizializzaContatori: riallineamento,
        });
        if (prenotato) {
          break;
        }

        const fresca = await this.leggiCoppia(tenantId, variantId, locationId);
        if (!fresca) {
          return { pushed: false, reason: 'level_not_found' };
        }
        if (fresca.stato?.pendingKey) {
          return {
            pushed: false,
            reason: 'tentativo_in_corso',
            publishableAvailable: computeShopifyPublishableAvailable(fresca.available),
          };
        }

        // La coppia si è mossa: si riparte dai valori nuovi, rivalutando le
        // stesse domande di prima — non si porta avanti niente di vecchio.
        coppia = fresca;
        level = fresca;
        stato = fresca.stato;
        publishable = computeShopifyPublishableAvailable(fresca.available);
        const baseNuova = baseDiConfronto(fresca.stato);
        // ⛔ **Anche qui il riallineamento non ha bisogno dell'ultimo
        //    confermato**, per la stessa ragione di sopra: il suo confronto è
        //    `R`, che `asserisci()` sta per rileggere. Senza questa condizione
        //    una presa fallita mandava la partenza a `base_assente` — cioè il
        //    comando falliva proprio sulle righe che deve inizializzare.
        if (baseNuova === null && !riallineamento) {
          return { pushed: false, reason: 'base_assente', publishableAvailable: publishable };
        }
        base = baseNuova;
        baseAttesa = baseNuova;
        // ⭐ La coppia si e' mossa: si RICOMPONE sui valori nuovi, leggendo di
        //    nuovo il canale. Portarsi avanti il valore di prima significherebbe
        //    scrivere su uno stato che non c'e' piu'.
        //
        // ⛔ **E si ricompone COL CALCOLO DEL PROPRIO MODO.** Qui si chiamava
        //    sempre `componi()`: dopo una presa fallita il riallineamento
        //    passava al calcolo della sincronizzazione ordinaria, che su una
        //    riga senza base non compone niente — e con l'ultimo confermato
        //    assente usciva `base_assente` invece di allineare. Peggio: gli
        //    scarichi fotografati restavano quelli del giro prima, quindi i
        //    contatori si sarebbero aggiornati su numeri vecchi.
        // ⛔ **La decisione di NON scrivere si AZZERA prima di ricalcolare.**
        //    Restava memorizzata: con VestiFlow 10 e Shopify 10 si decideva
        //    «basta la base», poi una vendita portava il locale a 9, la presa
        //    falliva, il ricalcolo trovava che bisogna inviare 9 — e si
        //    confermava 9 **senza scriverlo**. Shopify restava a 10.
        soloBase = false;
        const ricomposto = riallineamento ? await asserisci() : await componi();
        if (ricomposto === 'solo_base') {
          base = publishable;
          soloBase = true;
        }
        if (ricomposto === 'canale_muto') {
          return { pushed: false, reason: 'level_not_found', publishableAvailable: publishable };
        }
        // ⛔ **Gli stessi due `unchanged` di sopra, e qui NON spegnevano.**
        //    Asimmetria trovata il 10/09/2026: fuori dal ciclo di presa
        //    l'uscita «non c'è niente da mandare» spegne il pendente, dentro
        //    no. Non perdeva lavoro — la riga sarebbe uscita al giro dopo — ma
        //    è la stessa decisione applicata in quattro punti, e lasciarne due
        //    fuori è esattamente il difetto già pagato quattro volte.
        if (ricomposto === 'nessun_invio') {
          if (stato?.localPushPending) {
            await this.spegniInvioLocalePendente(tenantId, variantId, locationId, publishable);
          }
          return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
        }
        if (ricomposto && ricomposto !== 'solo_base') {
          publishable = ricomposto.valore;
          base = ricomposto.confronto;
          // ⚠️ **Anche qui**: dopo un conflitto di presa il valore si ricompone
          //    su numeri nuovi, e l'avviso deve descrivere QUELLI. Lasciarlo
          //    fuori significherebbe avvisare su una variazione che non è più
          //    quella tentata.
          if (recupero) {
            this.avvisaSeAlza(
              tenantId,
              variant.sku ?? variant.id,
              locationId,
              ricomposto.confronto,
              ricomposto.valore,
              'lettura fresca del canale',
            );
          }
        } else if (!recupero && !riallineamento && base === publishable) {
          // ⛔ **Il riallineamento NON esce di qui**, e prima lo faceva: se al
          //    primo giro i valori differivano e al ricalcolo coincidevano,
          //    usciva «invariata» senza prendere e senza confermare — e la
          //    coppia restava fuori dal regime nuovo. Nel suo caso il ramo
          //    giusto è `solo_base`, che prende e conferma senza scrivere.
          if (stato?.localPushPending) {
            await this.spegniInvioLocalePendente(tenantId, variantId, locationId, publishable);
          }
          return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
        }
      }
      if (!prenotato) {
        // ⛔ **Qui si diceva «l'invio spetta al push dell'operazione
        //    sopravvenuta», e NON era una garanzia.** `P10` lo ha misurato:
        //    l'altro push può essersi già concluso, fermarsi su un tentativo in
        //    corso o interrompersi, e nessuno ripianifica questo valore. Lo
        //    stato era recuperabile, l'innesco no.
        //
        // ⭐ **Adesso il lavoro si CONSERVA**, e la coda del ritentativo lo
        //    ritrova. ⛔ Su una colonna sua, non su `mismatchDetected`: quello
        //    afferma «il canale porta un numero diverso», che si sa guardando
        //    il canale — qui non si è guardato niente.
        await this.segnaInvioLocalePendente(tenantId, variantId, locationId, publishable);
        this.logger.warn(
          `Push inventario non inviato (${tenantId}): la coppia ${variantId} @ ${locationId} è ` +
            `cambiata sotto la lettura per ${GIRI_PRESA} giri. Nessuna scrittura; ` +
            'aggiornamento locale segnato come da trasmettere.',
        );
        return { pushed: false, reason: 'stato_cambiato', publishableAvailable: publishable };
      }

      // ⭐ **Nessuna scrittura quando il canale porta già il valore.** Si è
      //    presa la coppia — quindi lo stato locale è ancora quello letto — e
      //    si conferma: `P := T` e i contatori si scaricano come sempre.
      //
      // ⚠️ **Non è `pushed: true`**: non abbiamo pubblicato niente, e dirlo
      //    sarebbe falso in un esito che l'operatore legge. La coppia risulta
      //    «già allineata», con la base ora stabilita.
      if (soloBase) {
        const confermato = await this.confermaTentativo(
          tenantId,
          variantId,
          locationId,
          publishable,
          prenotato.chiave,
        );
        if (!confermato) {
          return { pushed: false, reason: 'stato_cambiato', publishableAvailable: publishable };
        }
        this.logger.log(
          `Base stabilita senza scrivere (${tenantId}): SKU ${variant.sku ?? variantId} @ ` +
            `${location.name} — il canale porta già ${publishable}`,
        );
        return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
      }

      const scrittura = await this.scriviQuantita(shopDomain, accessToken, prenotato);
      if (scrittura.classe) {
        // ⛔ **Non tutti i rifiuti sono uguali**, e non tutti chiudono il
        //    tentativo: la classe decide, e le due classi prudenti non toccano
        //    niente. Vedi `applicaRifiuto`.
        const reason = await this.applicaRifiuto(
          tenantId,
          variantId,
          locationId,
          prenotato.chiave,
          prenotato.base,
          publishable,
          { classe: scrittura.classe, motivi: scrittura.motivi },
        );
        return { pushed: false, reason, publishableAvailable: publishable };
      }
      await this.confermaTentativo(tenantId, variantId, locationId, publishable, prenotato.chiave);
      await this.shopifyConnection.touchSync(tenantId);
      this.logger.log(
        `Inventario Shopify aggiornato (${tenantId}): SKU ${variant.sku} @ ${location.name} → ${publishable} ` +
          `(Giacenza ${level.onHand}, Impegnata ${level.committed})`,
      );
      return { pushed: true, publishableAvailable: publishable };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push inventario Shopify';
      this.logger.warn(`Push inventario Shopify fallito (${tenantId}): ${message}`);
      return { pushed: false, reason: 'shopify_error' };
    }
  }

  async pushLevels(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    const uniqueLocationIds = [...new Set(locationIds)];
    for (const locationId of uniqueLocationIds) {
      await this.pushLevel(tenantId, variantId, locationId);
    }
  }

  /**
   * Segna che su questa coppia c'è un aggiornamento locale **non trasmesso**.
   *
   * ⛔ **Non è `mismatchDetected`, e non deve diventarlo.** Quella colonna dice
   *    «il canale porta un numero diverso da quello che mi aspetto», e lo si sa
   *    **guardando il canale**. Qui non si è guardato niente: non si è proprio
   *    scritto. Fusi in una colonna sola, dopo nessuno può più dire se una riga
   *    in coda sia stata verificata contro Shopify — e i rimedi sono diversi.
   *
   * ⚠️ **Nessuna nota, e non è una dimenticanza**: `mismatchNote` appartiene
   *    all'altro stato. Scriverci dentro il motivo di questo lo renderebbe di
   *    nuovo indistinguibile a chi legge la riga.
   */
  private async segnaInvioLocalePendente(
    tenantId: string,
    variantId: string,
    locationId: string,
    publishable: number,
  ): Promise<void> {
    const segnato = await this.prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId, variantId, locationId },
      data: { localPushPending: true },
    });
    if (segnato.count === 0) {
      // La riga non esiste: nessun invio è mai stato confermato su questa
      // coppia, quindi non c'è nemmeno una base — `base_assente` avrebbe già
      // fermato il push prima di arrivare qui.
      this.logger.warn(
        `Nessuna riga di stato da segnare (${tenantId}) ${variantId} @ ${locationId}: ` +
          `l'aggiornamento a ${publishable} resta non trasmesso e non tracciato.`,
      );
    }
  }

  /**
   * Spegne il pendente quando non c'è più niente da trasmettere.
   *
   * ⭐ **Condizionato al VALORE, non solo alla coppia.** Fra la lettura e questa
   *    scrittura un'altra operazione locale può aver mosso il Disponibile: se
   *    l'ultimo confermato non è più quello che abbiamo appena constatato
   *    uguale al pubblicabile, spegnere cancellerebbe un lavoro che è tornato
   *    a esistere. `count === 0` significa «non era più il mio caso», e va bene.
   */
  private async spegniInvioLocalePendente(
    tenantId: string,
    variantId: string,
    locationId: string,
    publishable: number,
  ): Promise<void> {
    await this.prisma.shopifyInventorySyncState.updateMany({
      where: {
        tenantId,
        variantId,
        locationId,
        localPushPending: true,
        // ⛔ **Due domande, perché i due regimi sono diversi** — e con una sola
        //    la coda si sporcava in modo permanente.
        //
        // ⭐ Con una base, «non c'è più niente da trasmettere» vuol dire
        //    `L = 0`. Chiedere invece se l'ultimo confermato coincide col
        //    Disponibile è la domanda del regime assoluto: basta un effetto di
        //    canale acquisito in mezzo perché i due numeri differiscano
        //    legittimamente, e la riga resterebbe in coda per sempre — senza
        //    lavoro, riesaminata a ogni passata.
        //
        // ⚠️ Senza base `L` è `NULL` e la domanda giusta resta quella di prima.
        OR: [
          { localPendingDelta: 0 },
          { localPendingDelta: null, lastPushedAvailable: publishable },
        ],
      },
      data: { localPushPending: false },
    });
  }

  private leggiStato(tenantId: string, variantId: string, locationId: string) {
    return this.prisma.shopifyInventorySyncState.findUnique({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
      select: STATO_SYNC,
    });
  }

  /**
   * Il Disponibile e lo stato sync, letti in UNA sola istruzione.
   *
   * ⛔ **Qui c'erano due `findUnique` separati**, e fra loro non c'era niente:
   *    il push combinava un valore di `t0` con uno di `t1` e preparava un invio
   *    su una coppia **mai esistita**. Con il Disponibile letto prima e la base
   *    riletta dopo, il confronto passava — perché la base ERA quella giusta —
   *    e scriveva un totale vecchio, annullando una vendita appena confermata.
   *    Prove `P9` e `P9-bis`.
   *
   * ⭐ **Una sola istruzione basta, e non serve una transazione.** In
   *    `READ COMMITTED` una singola SELECT vede uno snapshot coerente: o
   *    entrambi i valori prima dell'operazione sopravvenuta, o entrambi dopo.
   *    Mai uno prima e uno dopo.
   *
   * ⛔ **E non si apre una transazione attorno al push**, che contiene una
   *    chiamata di rete a Shopify: terrebbe un lucchetto di riga per centinaia
   *    di millisecondi — un rimedio peggiore del difetto.
   *
   * ⚠️ **`LEFT JOIN`, perché lo stato può non esistere ancora**: la prima volta
   *    su una coppia c'è il livello e non c'è la riga di stato. `haStato`
   *    distingue «riga assente» da «riga con tutto a null».
   */
  private async leggiCoppia(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<{
    readonly available: number;
    readonly onHand: number;
    readonly committed: number;
    readonly stato: {
      readonly lastPushedAvailable: number | null;
      readonly lastObservedShopifyAvailable: number | null;
      readonly lastPushedAt: Date | null;
      readonly lastObservedAt: Date | null;
      readonly mismatchDetected: boolean;
      readonly localPushPending: boolean;
      /** `L` — NULL se la base non è stabilita. Non si legge come zero. */
      readonly localPendingDelta: number | null;
      /** `C` — stessa regola del NULL. */
      readonly channelAcquiredDelta: number | null;
      readonly pendingKey: string | null;
      readonly pendingAvailable: number | null;
      readonly pendingBase: number | null;
      readonly pendingShopDomain: string | null;
      readonly pendingItemId: string | null;
      readonly pendingLocationRef: string | null;
      readonly pendingAt: Date | null;
    } | null;
  } | null> {
    const righe = await this.prisma.$queryRaw<
      {
        available: number;
        on_hand: number;
        committed: number;
        ha_stato: boolean;
        last_pushed_available: number | null;
        last_observed_shopify_available: number | null;
        last_pushed_at: Date | null;
        last_observed_at: Date | null;
        mismatch_detected: boolean | null;
        local_push_pending: boolean | null;
        local_pending_delta: number | null;
        channel_acquired_delta: number | null;
        pending_key: string | null;
        pending_available: number | null;
        pending_base: number | null;
        pending_shop_domain: string | null;
        pending_item_id: string | null;
        pending_location_ref: string | null;
        pending_at: Date | null;
      }[]
    >`
      SELECT l.available, l.on_hand, l.committed,
             (s.tenant_id IS NOT NULL) AS ha_stato,
             s.last_pushed_available, s.last_observed_shopify_available,
             s.last_pushed_at, s.last_observed_at, s.mismatch_detected, s.local_push_pending,
             s.local_pending_delta, s.channel_acquired_delta,
             s.pending_key, s.pending_available, s.pending_base,
             s.pending_shop_domain, s.pending_item_id, s.pending_location_ref, s.pending_at
        FROM inventory_levels l
        LEFT JOIN shopify_inventory_sync_states s
          ON s.tenant_id = l.tenant_id
         AND s.variant_id = l.variant_id
         AND s.location_id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND l.variant_id = ${variantId}::uuid
         AND l.location_id = ${locationId}::uuid`;

    const riga = righe[0];
    if (!riga) {
      return null;
    }
    return {
      available: riga.available,
      onHand: riga.on_hand,
      committed: riga.committed,
      stato: riga.ha_stato
        ? {
            lastPushedAvailable: riga.last_pushed_available,
            lastObservedShopifyAvailable: riga.last_observed_shopify_available,
            lastPushedAt: riga.last_pushed_at,
            lastObservedAt: riga.last_observed_at,
            mismatchDetected: riga.mismatch_detected ?? false,
            localPushPending: riga.local_push_pending ?? false,
            // ⭐ NULL = base non stabilita: si conserva com’è, non si legge come zero.
            localPendingDelta: riga.local_pending_delta,
            channelAcquiredDelta: riga.channel_acquired_delta,
            pendingKey: riga.pending_key,
            pendingAvailable: riga.pending_available,
            pendingBase: riga.pending_base,
            pendingShopDomain: riga.pending_shop_domain,
            pendingItemId: riga.pending_item_id,
            pendingLocationRef: riga.pending_location_ref,
            pendingAt: riga.pending_at,
          }
        : null,
    };
  }

  /**
   * Un tentativo aperto si risolve PRIMA di iniziarne un altro.
   *
   * ⛔ **Nessuna operazione nuova cancella quella incerta**: o la si ripete
   *    identica — stessa chiave, stessa destinazione, stesso valore, stesso
   *    confronto — o ci si ferma. Restituisce l'esito che FERMA, oppure `null`
   *    se il dubbio è sciolto e si può proseguire.
   */
  private async risolviTentativoAperto(
    tenantId: string,
    variantId: string,
    locationId: string,
    stato: {
      readonly pendingKey: string | null;
      readonly pendingAvailable: number | null;
      readonly pendingBase: number | null;
      readonly pendingShopDomain: string | null;
      readonly pendingItemId: string | null;
      readonly pendingLocationRef: string | null;
      readonly pendingAt: Date | null;
    },
    attuale: { readonly itemId: string | null; readonly locationRef: string | null },
  ): Promise<ShopifyInventoryPushResult | null> {
    const scaduto =
      stato.pendingAt === null || Date.now() - stato.pendingAt.getTime() > FINESTRA_IDEMPOTENZA_MS;
    if (scaduto) {
      // ⛔ Fuori finestra la ripetizione non è più deduplicata: reinviarla
      //    potrebbe applicare l'effetto una seconda volta. Il tentativo resta
      //    dov'è — riconoscibile — e le modifiche locali successive restano
      //    pendenti, perché né il Disponibile né l'ultimo confermato si toccano.
      this.logger.warn(
        `Tentativo di invio inventario INCERTO oltre la finestra di idempotenza (${tenantId}): ` +
          `variante ${variantId} @ ${locationId}, chiave ${stato.pendingKey}. ` +
          'Richiede riconciliazione: non viene reinviato automaticamente.',
      );
      return { pushed: false, reason: 'tentativo_incerto' };
    }

    if (
      !stato.pendingKey ||
      stato.pendingAvailable === null ||
      // ⛔ **La BASE è un parametro dell'operazione, non un contorno.** Qui non
      //    c'era, e più sotto un `pendingBase ?? pendingAvailable` ne
      //    ricostruiva una: ma un ritentativo ripete un'operazione GIÀ
      //    DEFINITA, e una base inventata la rende un'operazione diversa —
      //    stessa chiave, parametri altri. Per il canale è una richiesta che
      //    non corrisponde alla chiave che la accompagna; e se il confronto
      //    passasse per caso, scriverebbe sopra uno stato che nessuno ha
      //    verificato. Senza base originale non si manda niente.
      stato.pendingBase === null ||
      !stato.pendingShopDomain ||
      !stato.pendingItemId ||
      !stato.pendingLocationRef
    ) {
      // Una prenotazione senza i suoi parametri non è ripetibile: non si
      // indovina la destinazione, si dichiara.
      this.logger.error(
        `Tentativo di invio inventario INCOMPLETO (${tenantId}): variante ${variantId} @ ${locationId}.`,
      );
      return { pushed: false, reason: 'tentativo_incerto' };
    }

    // ── la DESTINAZIONE memorizzata dev'essere ancora quella autorizzata ────
    //
    // ⛔ **Controllare i soli identificativi attuali non basta.** Le guardie che
    //    hanno appena detto sì — connessione, interruttore, sede, storico 26.8 —
    //    hanno guardato la destinazione di ADESSO. Il tentativo però porta la
    //    destinazione di ALLORA, e se nel frattempo il collegamento è stato
    //    chiuso, la variante riagganciata a un altro articolo o la sede
    //    rimappata, ripetere significherebbe scrivere su una destinazione che
    //    nessuno ha autorizzato — o, col negozio cambiato, con le credenziali
    //    di un altro shop.
    //
    // ⭐ **Si ripete solo se la destinazione memorizzata COINCIDE con quella
    //    attuale**, che è quella appena autorizzata. Altrimenti il tentativo
    //    resta dov'è, riconoscibile, e chiede riconciliazione: non si perde e
    //    non si scrive.
    const { shopDomain: dominioAttuale, accessToken } =
      await this.shopifyOAuth.getAccessToken(tenantId);
    const destinazioneCambiata =
      stato.pendingShopDomain !== dominioAttuale ||
      stato.pendingItemId !== attuale.itemId ||
      !isSameShopifyLocationId(stato.pendingLocationRef, attuale.locationRef);
    if (destinazioneCambiata) {
      this.logger.warn(
        `Tentativo NON ripetuto (${tenantId}): la destinazione memorizzata non è più quella ` +
          `autorizzata — negozio ${stato.pendingShopDomain} → ${dominioAttuale}, articolo ` +
          `${stato.pendingItemId} → ${attuale.itemId}, sede ${stato.pendingLocationRef} → ` +
          `${attuale.locationRef}. Richiede riconciliazione.`,
      );
      return { pushed: false, reason: 'tentativo_incerto' };
    }

    try {
      const scrittura = await this.scriviQuantita(stato.pendingShopDomain, accessToken, {
        chiave: stato.pendingKey,
        valore: stato.pendingAvailable,
        // ⭐ **La base ORIGINALE, quella di allora.** Il controllo di
        //    completezza qui sopra l'ha già pretesa: qui non si ripiega su
        //    niente, perché ripetere significa mandare gli stessi parametri.
        base: stato.pendingBase,
        inventoryItemId: stato.pendingItemId,
        locationRef: stato.pendingLocationRef,
      });
      // ⛔ **Anche qui la classe decide.** Un ritentativo che riceve
      //    «l'operazione è in corso» non deve cancellare proprio ciò che sta
      //    ripetendo: sarebbe il caso peggiore, perché la chiave andrebbe persa
      //    mentre l'effetto sta arrivando.
      if (scrittura.classe) {
        const reason = await this.applicaRifiuto(
          tenantId,
          variantId,
          locationId,
          stato.pendingKey,
          stato.pendingBase,
          stato.pendingAvailable,
          { classe: scrittura.classe, motivi: scrittura.motivi },
        );
        return { pushed: false, reason };
      }
    } catch (errore: unknown) {
      const messaggio = errore instanceof Error ? errore.message : 'Errore sconosciuto';
      this.logger.warn(
        `Ripetizione del tentativo non riuscita (${tenantId}) ${variantId} @ ${locationId}: ${messaggio}`,
      );
      return { pushed: false, reason: 'shopify_error' };
    }

    await this.confermaTentativo(
      tenantId,
      variantId,
      locationId,
      stato.pendingAvailable,
      stato.pendingKey,
    );
    this.logger.log(
      `Tentativo di invio inventario risolto ripetendolo (${tenantId}): ` +
        `variante ${variantId} @ ${locationId} → ${stato.pendingAvailable}`,
    );
    return null;
  }

  /**
   * La PRENOTAZIONE: registra l'operazione prima di chiamare, e la prende in
   * modo atomico. `null` se un altro esecutore l'ha già presa.
   */
  private async prenotaTentativo(
    tenantId: string,
    variantId: string,
    locationId: string,
    operazione: {
      readonly valore: number;
      // ⛔ **Un numero, non `number | null`.** La colonna resta nullabile per
      //    storia, ma un tentativo non si apre senza base: senza, il percorso si
      //    è già fermato su `base_assente` e qui non arriva.
      readonly base: number;
      readonly shopDomain: string;
      readonly inventoryItemId: string;
      readonly locationRef: string;
      /** L'ultimo confermato **letto**: la presa fallisce se non è più quello. */
      readonly baseAttesa: number | null;
      /** Il valore di `L` su cui il bersaglio e' stato calcolato. */
      readonly lAtteso: number | null;
      /** Il Disponibile **letto**: la presa fallisce se non è più quello. */
      readonly disponibileAtteso: number;
      /**
       * Quanto togliere da `L` e da `C` alla conferma di QUESTO tentativo.
       *
       * ⭐ **Si decide qui, dove si decide che cosa inviare**, e non nella
       *    conferma: i due percorsi scaricano in modo diverso, e la conferma
       *    non ha modo di sapere quale l'ha aperta.
       *
       * ⚠️ `null` = si usa la formula dell'invio ordinario. È il ripiego per i
       *    tentativi aperti prima che la fotografia esistesse.
       */
      readonly scaricoLocale: number | null;
      readonly scaricoCanale: number | null;
      /**
       * Fa NASCERE i contatori, se non ci sono ancora.
       *
       * ⛔ **Serve, e la ragione è una vendita che si perdeva.** Finché `L` è
       *    `NULL`, `registraOrigine` fa `increment` su `NULL` e il risultato
       *    resta `NULL`: una vendita entrata fra la presa e la conferma della
       *    PRIMA scrittura spariva dalla contabilità degli invii — Shopify a
       *    10, VestiFlow a 9, e nessun −1 da recuperare.
       *
       * ⭐ **Nascendo QUI la riga entra nel regime nuovo prima della finestra**,
       *    e da quel momento ogni movimento locale accumula. Lo scarico alla
       *    conferma toglie poi esattamente quanto è stato trasmesso.
       *
       * ⚠️ Se la scrittura poi fallisce, la riga resta con i contatori a zero e
       *    senza ultimo confermato: il push ordinario esce su `base_assente` e
       *    la coppia si ripresenta al prossimo Allinea. È uno stato onesto —
       *    «entrata nel regime, mai pubblicata» — non una base inventata.
       */
      readonly inizializzaContatori: boolean;
    },
  ): Promise<{
    readonly chiave: string;
    readonly valore: number;
    readonly base: number;
    readonly inventoryItemId: string;
    readonly locationRef: string;
  } | null> {
    // La riga può non esistere ancora: la si crea vuota, e la presa avviene
    // sempre col passo condizionato qui sotto.
    // ⚠️ Due esecutori possono provare a crearla insieme: il vincolo unico ne
    //    ferma uno, e per lui la riga esiste comunque.
    try {
      await this.prisma.shopifyInventorySyncState.upsert({
        where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
        create: { tenantId, variantId, locationId },
        update: {},
      });
    } catch {
      // Creata nel frattempo da un altro esecutore: va bene così.
    }

    const chiave = randomUUID();
    // ⭐ **La presa verifica che i due valori letti siano ANCORA quelli**, e in
    //    una sola istruzione: fra la lettura coerente e questo punto passano le
    //    guardie, la risoluzione di un tentativo e `getAccessToken`, e in quel
    //    tempo la coppia può muoversi.
    //
    // ⛔ **Non basta controllare la BASE.** Un'operazione locale muove il
    //    Disponibile e **non** tocca l'ultimo confermato: la base sarebbe
    //    identica e la presa passerebbe, portandosi dietro un `valore` vecchio.
    //    Le due condizioni misurano due cose diverse e servono entrambe.
    //
    // ⚠️ `IS NOT DISTINCT FROM` e non `=`: la base può essere `null`, e in SQL
    //    `null = null` non è vero. Con l'uguaglianza la presa fallirebbe per
    //    sempre su ogni coppia senza base — cioè proprio dove il ciclo non ha
    //    modo di convergere.
    const preso = await this.prisma.$executeRaw`
      UPDATE shopify_inventory_sync_states s
         SET pending_key = ${chiave},
             pending_available = ${operazione.valore},
             pending_base = ${operazione.base},
             pending_shop_domain = ${operazione.shopDomain},
             pending_item_id = ${operazione.inventoryItemId},
             pending_location_ref = ${operazione.locationRef},
             pending_at = NOW(),
             pending_discharge_local = ${operazione.scaricoLocale},
             pending_discharge_channel = ${operazione.scaricoCanale},
             -- ⭐ Si ricorda se e' stata QUESTA presa a far nascere i contatori:
             --    serve a poterli riportare a NULL se il tentativo non si
             --    conferma. Solo se erano NULL: se c'erano gia', non nasce nulla.
             pending_ha_inizializzato = (
               ${operazione.inizializzaContatori}::boolean
               AND local_pending_delta IS NULL
             ),
             -- ⭐ I contatori NASCONO qui, e solo se richiesto: da questo istante
             --    ogni movimento locale accumula invece di svanire su un NULL.
             local_pending_delta = CASE
               WHEN ${operazione.inizializzaContatori}::boolean
                 THEN COALESCE(local_pending_delta, 0)
               ELSE local_pending_delta
             END,
             channel_acquired_delta = CASE
               WHEN ${operazione.inizializzaContatori}::boolean
                 THEN COALESCE(channel_acquired_delta, 0)
               ELSE channel_acquired_delta
             END
       WHERE s.tenant_id = ${tenantId}::uuid
         AND s.variant_id = ${variantId}::uuid
         AND s.location_id = ${locationId}::uuid
         AND s.pending_key IS NULL
         AND s.last_pushed_available IS NOT DISTINCT FROM ${operazione.baseAttesa}
         -- ⛔ **Anche L, e non e' ridondante col Disponibile.** Due variazioni di
         --    origine diversa possono compensarsi: un carico locale +1 e un
         --    ordine online −1 acquisito lasciano available identico mentre L
         --    cambia. Senza questa riga il bersaglio verrebbe scritto con un L
         --    vecchio e la presa passerebbe lo stesso.
         AND s.local_pending_delta IS NOT DISTINCT FROM ${operazione.lAtteso}
         AND EXISTS (
               SELECT 1 FROM inventory_levels l
                WHERE l.tenant_id = s.tenant_id
                  AND l.variant_id = s.variant_id
                  AND l.location_id = s.location_id
                  AND l.available = ${operazione.disponibileAtteso}
             )`;
    if (preso === 0) {
      return null;
    }
    return {
      chiave,
      valore: operazione.valore,
      base: operazione.base,
      inventoryItemId: operazione.inventoryItemId,
      locationRef: operazione.locationRef,
    };
  }

  /**
   * L'invio vero, con confronto e chiave di idempotenza.
   *
   * Restituisce la **classe** del rifiuto — `null` se la scrittura è avvenuta —
   * e i motivi leggibili.
   *
   * ⛔ **Qui c'era `errori.length > 0`, e leggeva ogni `userError` come una
   *    divergenza accertata.** Non lo sono: il canale usa lo stesso canale di
   *    risposta per cose che non c'entrano niente fra loro, e una di quelle
   *    significa «l'operazione è ANCORA IN CORSO». Corretto il 10/09/2026; la
   *    lettura sta in `shopify-inventory-user-error.util`, con quello che è
   *    misurato e quello che non lo è.
   *
   * ⚠️ **I motivi si restituiscono, non si consumano qui**: sono ciò che rende
   *    leggibile il rifiuto a chi lo troverà nella riga di stato. Un rifiuto
   *    ridotto a un `false` lascia il problema visibile e la sua causa no.
   */
  private async scriviQuantita(
    shopDomain: string,
    accessToken: string,
    operazione: {
      readonly chiave: string;
      readonly valore: number;
      readonly base: number;
      readonly inventoryItemId: string;
      readonly locationRef: string;
    },
  ): Promise<{
    readonly classe: ClasseRifiutoInventario | null;
    readonly motivi: readonly string[];
  }> {
    const errori = await this.shopifyGraphql.setInventoryQuantities(shopDomain, accessToken, {
      reason: 'correction',
      referenceDocumentUri: `vestiflow://inventory-push/${operazione.chiave}`,
      idempotencyKey: operazione.chiave,
      quantities: [
        {
          inventoryItemId:
            gidArticoloInventario(operazione.inventoryItemId) ?? operazione.inventoryItemId,
          locationId: gidSede(operazione.locationRef) ?? operazione.locationRef,
          quantity: operazione.valore,
          // ⛔ **Sempre un numero.** `null` disattiverebbe il confronto — l'API
          //    lo ammette, questo percorso no: senza una base confermata non si
          //    arriva nemmeno qui (`base_assente`).
          changeFromQuantity: operazione.base,
        },
      ],
    });
    const classe = classificaRifiutiInventario(errori);
    const motivi = motiviDi(errori);
    if (classe) {
      this.logger.warn(
        `Scrittura inventario non applicata (${classe}) su ${shopDomain}: ${motivi.join('; ')}`,
      );
    }
    return { classe, motivi };
  }

  /**
   * Che cosa si fa di un rifiuto, secondo la sua CLASSE.
   *
   * ⭐ **Le quattro classi si dividono in due su una domanda sola: la scrittura
   *    è certamente non avvenuta?**
   *
   * | Classe             | Certamente non avvenuta?  | Tentativo   | Esito                  |
   * | ------------------ | ------------------------- | ----------- | ---------------------- |
   * | **concorrenza**    | ⛔ no, può essere in corso | **intatto** | `tentativo_in_corso`   |
   * | **sconosciuto**    | ⛔ non si sa               | **intatto** | `shopify_error`        |
   * | **non ripetibile** | ⛔ non si sa               | **intatto** | `tentativo_incerto`    |
   * | **validazione**    | ✅ sì                      | si chiude   | `richiesta_rifiutata`  |
   * | **confronto**      | ✅ sì                      | si chiude   | `divergenza_accertata` |
   *
   * ⛔ **Nelle prime tre non si scrive NIENTE**: né la chiave, né i parametri,
   *    né la nota, né il marcatore. Toccare la riga significherebbe affermare
   *    qualcosa che non si sa.
   */
  private async applicaRifiuto(
    tenantId: string,
    variantId: string,
    locationId: string,
    chiave: string,
    base: number | null,
    valore: number,
    rifiuto: { readonly classe: ClasseRifiutoInventario; readonly motivi: readonly string[] },
  ): Promise<ShopifyInventoryPushSkipReason | 'shopify_error'> {
    switch (rifiuto.classe) {
      case 'concorrenza':
        // ⛔ **L'operazione è ancora in corso dall'altra parte.** Cancellare il
        //    tentativo qui significherebbe dimenticare la chiave, e al giro
        //    dopo aprire un invio nuovo e indipendente **mentre il primo sta
        //    ancora andando a segno**: il doppio effetto che la chiave di
        //    idempotenza esiste per impedire.
        this.logger.warn(
          `Tentativo ${chiave} ANCORA IN CORSO sul canale (${tenantId}) ${variantId} @ ${locationId}: ` +
            `${rifiuto.motivi.join('; ')}. Nessuna scrittura: il tentativo resta com'è.`,
        );
        return 'tentativo_in_corso';
      case 'sconosciuto':
        // ⛔ Non si conclude su ciò che non si sa leggere: potrebbe essere un
        //    «in corso» che questo codice non conosce ancora.
        this.logger.warn(
          `Rifiuto NON INTERPRETABILE del canale (${tenantId}) ${variantId} @ ${locationId}: ` +
            `${rifiuto.motivi.join('; ')}. Esito ignoto: il tentativo resta aperto.`,
        );
        return 'shopify_error';
      case 'non_ripetibile':
        // ⛔ **Il codice è riconosciuto, ma non dice se l'operazione di allora
        //    abbia avuto effetto** — e la chiave non la può più ripetere. Le
        //    due cose insieme fanno un esito da riconciliare, non da rifare:
        //    generare una chiave nuova di iniziativa sarebbe un invio
        //    indipendente su uno stato ignoto.
        //
        // ⭐ **Chiave e parametri restano dove sono**: l'incoerenza si segnala,
        //    non si «ripara» la riga.
        this.logger.error(
          `Tentativo ${chiave} NON PIÙ RIPETIBILE (${tenantId}) ${variantId} @ ${locationId}: ` +
            `${rifiuto.motivi.join('; ')}. Chiave e parametri conservati (valore ${valore}, ` +
            `base ${base ?? 'assente'}); nessuna operazione nuova. Richiede riconciliazione.`,
        );
        return 'tentativo_incerto';
      case 'validazione':
        await this.chiudiTentativoNonApplicato(
          tenantId,
          variantId,
          locationId,
          chiave,
          base,
          valore,
          rifiuto.motivi,
          'validazione',
        );
        return 'richiesta_rifiutata';
      case 'confronto':
        await this.chiudiTentativoNonApplicato(
          tenantId,
          variantId,
          locationId,
          chiave,
          base,
          valore,
          rifiuto.motivi,
          'confronto',
        );
        return 'divergenza_accertata';
    }
  }

  /**
   * La CONFERMA: solo qui l'ultimo confermato avanza, e il tentativo si chiude.
   *
   * ⛔ **Una sola scrittura, condizionata alla CHIAVE.** Confermare «la riga» e
   *    non «quell'operazione» significa che una risposta tardiva del tentativo A
   *    chiuderebbe il tentativo B e farebbe arretrare l'ultimo confermato al
   *    valore di A. Con `pendingKey` nel `where`, una conferma che non è più la
   *    propria **non scrive niente**. Prova `B3`.
   *
   * ⚠️ **Non passa più da `recordSuccessfulPush`**, e la ragione è
   *    l'atomicità: quel metodo fa un upsert non condizionato, e fra lui e la
   *    chiusura del tentativo ci sarebbe una finestra in cui il confermato è
   *    avanzato e il tentativo è ancora aperto. Gli stessi campi che scriveva —
   *    ultimo inviato, istante, spegnimento del disallineamento — sono qui.
   *
   * Restituisce `false` se il tentativo non era più il proprio.
   */
  private async confermaTentativo(
    tenantId: string,
    variantId: string,
    locationId: string,
    valore: number,
    chiave: string,
  ): Promise<boolean> {
    // ── lo SCARICO dei contatori, nella STESSA istruzione ─────────────────
    //
    // ⭐ **Una sola `UPDATE`, condizionata alla chiave**: o scarica e conferma,
    //    o non fa niente. Non esiste un istante in cui il confermato sia
    //    avanzato e i contatori no.
    //
    // ⭐ **`L -= (T − R)`**: si toglie ESATTAMENTE quanto è stato trasmesso, non
    //    tutto `L`. Con `T` clampato a zero si toglie meno, e il **residuo
    //    negativo resta**: è il debito che il canale non può rappresentare.
    //    ⛔ E siccome è un decremento di una costante fotografata alla presa,
    //    un'operazione locale arrivata DOPO sopravvive — un'assegnazione la
    //    cancellerebbe.
    //
    // ⭐ **`C -= (R − P)`** conserva lo scarto non spiegato attraverso la
    //    conferma: `last_pushed_available` a destra è ancora il valore VECCHIO,
    //    perché SQL valuta tutte le espressioni sulla riga di prima.
    //
    // ⚠️ **`NULL` fa da guardia**: su una riga senza base i due contatori
    //    restano `NULL` e lo scarico non li tocca.
    // ⛔ **UNA SOLA istruzione, e non e' pignoleria.** Scarico e conferma in due
    //    `UPDATE` lascerebbero una finestra in cui i contatori sono gia' scaricati
    //    e il tentativo ancora aperto: alla ripresa verrebbe ripetuto, e
    //    scaricherebbe una seconda volta.
    const scritto = await this.prisma.$executeRaw`
      UPDATE shopify_inventory_sync_states
         SET last_pushed_available = ${valore}::int,
             last_pushed_at = NOW(),
             mismatch_detected = FALSE,
             mismatch_note = NULL,
             -- ⛔ **Qui c'era \`FALSE\` secco, e buttava via il lavoro entrato
             --    durante la scrittura.** La riga usciva dalla coda insieme al
             --    tentativo confermato, quindi \`retryPending\` non aveva piu'
             --    niente da trovare: quella vendita restava ferma finche' su
             --    quella coppia non capitava per caso un altro movimento.
             --
             -- ⭐ **Si spegne se, DOPO lo scarico, non e' rimasto niente.** E'
             --    la stessa espressione della riga sotto, e le due si valutano
             --    entrambe sulla riga vecchia: o si spegne e L e' zero, o resta
             --    acceso perche' L non lo e'.
             --
             -- ⚠️ Resta condizionato alla chiave dal \`WHERE\`, quindi una
             --    conferma tardiva non tocca il pendente di qualcun altro.
             --
             -- ⚠️ **Un residuo NON TRASMISSIBILE tiene la riga in coda**, ed e'
             --    dichiarato: con \`T\` clampato a zero il debito negativo non
             --    si scarica, e la coda continuera' a esaminarla senza mai
             --    scrivere. E' lavoro locale che il canale non puo'
             --    rappresentare — visibile e fermo, non perso in silenzio.
             --
             -- ⚠️ \`COALESCE\` perche' su una riga senza base L e' NULL, e
             --    \`NULL <> 0\` sarebbe NULL: li' il pendente si spegne come prima.
             -- ⚠️ **La STESSA espressione dello scarico di \`L\` qui sotto**, e
             --    devono restare tali: se divergessero, il pendente direbbe una
             --    cosa e il contatore un'altra sulla stessa riga.
             local_push_pending = COALESCE(
               (CASE
                  WHEN pending_discharge_local IS NOT NULL
                    THEN COALESCE(local_pending_delta, 0) - pending_discharge_local
                  ELSE local_pending_delta
                       - (${valore}::int - COALESCE(pending_base, ${valore}::int))
                END) <> 0,
               FALSE),
             -- ⭐ L -= (T − R): si toglie ESATTAMENTE quanto e' stato trasmesso.
             --    Con T clampato a zero si toglie meno, e il RESIDUO NEGATIVO
             --    resta. Ed e' un decremento di una costante fotografata alla
             --    presa: un'operazione locale arrivata DOPO sopravvive.
             -- ⭐ **Lo scarico FOTOGRAFATO alla presa, quando c'è.** I due
             --    percorsi di scrittura scaricano in modo diverso e la conferma
             --    non sa quale l'ha aperta: portarsi dietro il risultato evita
             --    un discriminante e due rami dentro questa UPDATE.
             --
             -- ⚠️ Il \`COALESCE\` è il ripiego per un tentativo aperto PRIMA che
             --    la fotografia esistesse: lì vale la formula dell'invio
             --    ordinario, che è quella che l'ha aperto.
             local_pending_delta = CASE
               -- ⭐ **Con la fotografia, il contatore parte da ZERO se è NULL**:
               --    è così che il RIALLINEAMENTO stabilisce la base su una riga
               --    che non ce l'ha. \`0 − (T − A_w) = A_w − T\`, cioè zero, o il
               --    residuo negativo quando il clamp ha tolto qualcosa.
               --
               -- ⛔ **E l'invio ordinario NON fotografa su una riga senza base**
               --    (\`scarichiInvioOrdinario\`), quindi non passa mai di qui: è
               --    la guardia contro l'inizializzazione nascosta al primo push.
               WHEN pending_discharge_local IS NOT NULL
                 THEN COALESCE(local_pending_delta, 0) - pending_discharge_local
               ELSE local_pending_delta
                    - (${valore}::int - COALESCE(pending_base, ${valore}::int))
             END,
             -- ⭐ C -= (R − P) conserva lo scarto non spiegato attraverso la
             --    conferma: a destra last_pushed_available e' ancora il valore
             --    VECCHIO, perche' SQL valuta tutto sulla riga di prima.
             channel_acquired_delta = CASE
               WHEN pending_discharge_channel IS NOT NULL
                 THEN COALESCE(channel_acquired_delta, 0) - pending_discharge_channel
               ELSE channel_acquired_delta
                    - (COALESCE(pending_base, last_pushed_available) - last_pushed_available)
             END,
             pending_key = NULL,
             pending_discharge_local = NULL,
             pending_discharge_channel = NULL,
             pending_available = NULL,
             pending_base = NULL,
             pending_shop_domain = NULL,
             pending_item_id = NULL,
             pending_location_ref = NULL,
             pending_at = NULL
       WHERE tenant_id = ${tenantId}::uuid
         AND variant_id = ${variantId}::uuid
         AND location_id = ${locationId}::uuid
         AND pending_key = ${chiave}`;
    if (scritto === 0) {
      this.logger.warn(
        `Conferma tardiva ignorata (${tenantId}): il tentativo ${chiave} su ${variantId} @ ${locationId} ` +
          'non è più quello aperto. Nessuna scrittura: né conferma né chiusura.',
      );
      return false;
    }
    return true;
  }

  /**
   * La CHIUSURA di un tentativo che il canale ha **rifiutato**.
   *
   * ⭐ **Gli esiti sono tre, non due**, e questo blocco esiste per non
   *    confonderli:
   *
   * | Esito                    | Che cosa si sa                        | Che cosa si fa            |
   * | ------------------------ | ------------------------------------- | ------------------------- |
   * | conferma                 | il canale ha applicato                | avanza il confermato      |
   * | **divergenza accertata** | il canale ha RIFIUTATO (`userErrors`) | si chiude, non si avanza  |
   * | guasto di trasporto      | esito **ignoto**                      | il tentativo resta aperto |
   *
   * ⚠️ **Un rifiuto è una risposta, non un'assenza di risposta.** Shopify ha
   *    letto l'operazione, ha confrontato `changeFromQuantity` con la quantità
   *    che ha in casa e ha detto no: la scrittura non c'è stata, e ripeterla con
   *    gli stessi parametri produrrà lo stesso rifiuto. Tenere aperto il
   *    tentativo lo farebbe ritentare a ogni evento successivo — cioè insistere
   *    su un'operazione che non può riuscire.
   *
   * ⛔ **`lastPushedAvailable` non AVANZA, in nessuna direzione.** Quella
   *    colonna dice «il canale ha applicato questo»: dopo un rifiuto non è
   *    cambiato niente. Scriverci il valore che si VOLEVA mandare sarebbe la
   *    scrittura cieca che questo lavoro esiste per impedire, e ripiegare
   *    sull'ultimo OSSERVATO sarebbe l'errore già fatto due volte —
   *    un'osservazione dice che cosa il canale **mostra**, non che VestiFlow ne
   *    abbia acquisito le cause.
   *
   * ⭐ **Ma esiste UNA eccezione, ed è mirata: la partenza fallita.** Qui
   *    c'era «non si tocca, in nessuna direzione», e non è più vero. Se è
   *    stata QUESTA presa a far nascere i contatori e il rifiuto lascia del
   *    lavoro, l'ultimo confermato è quello del regime VECCHIO: si AZZERA.
   *    ⚠️ Azzerare non è scrivere un valore inventato — è il contrario:
   *    toglie una certificazione che nessun invio ha rilasciato in questo
   *    regime. Il dettaglio, con la ragione, sta sulla colonna dentro l'UPDATE.
   *
   * ⛔ **E non si dichiara successo.** `mismatchDetected` resta acceso e la nota
   *    dice che cosa è successo: il problema e il lavoro non risolto restano
   *    visibili a chi guarda la riga.
   *
   * ⏸ **Stabilire quale quantità sia CORRETTA non è mestiere di questo
   *    percorso**: è la riconciliazione, che è un blocco a sé e non è ancora
   *    implementata (`docs/DA-FARE.md` §29.6). Finché non c'è, una ripubblicazione
   *    successiva ripresenterà la stessa operazione e raccoglierà lo stesso
   *    rifiuto: è un limite **dichiarato**, non un ciclo nascosto — e il motivo
   *    per cui `divergenza_accertata` va contato a parte dai guasti.
   */
  private async chiudiTentativoNonApplicato(
    tenantId: string,
    variantId: string,
    locationId: string,
    chiave: string,
    base: number | null,
    valore: number,
    motivi: readonly string[],
    classe: 'confronto' | 'validazione',
  ): Promise<void> {
    // ⭐ **La nota dice DOVE guardare, e le due classi mandano in due posti
    //    opposti**: la divergenza alla riconciliazione delle quantità, il
    //    rifiuto della richiesta al collegamento. Una nota sola per entrambe
    //    manderebbe metà delle volte dalla parte sbagliata.
    const nota =
      classe === 'confronto'
        ? `Divergenza accertata su Shopify: il canale ha rifiutato la scrittura di ${valore} ` +
          `con base confermata ${base ?? 'assente'}. Motivo: ${motivi.join('; ')}. ` +
          'Il valore confermato non avanza al valore rifiutato; serve riconciliazione. '
          + 'Se è stata questa presa a stabilire la base ed è rimasto del lavoro, '
          + "l'ultimo confermato è stato AZZERATO: la coppia attende un allineamento riuscito."
        : `Richiesta rifiutata da Shopify: la scrittura di ${valore} non è stata accettata ` +
          `(base confermata ${base ?? 'assente'}). Motivo: ${motivi.join('; ')}. ` +
          'Non è una divergenza delle quantità: va verificata la richiesta o il collegamento. ' +
          'Il valore confermato non avanza al valore rifiutato. ' +
          "Se è stata questa presa a stabilire la base ed è rimasto del lavoro, l'ultimo " +
          'confermato è stato AZZERATO: la coppia attende un allineamento riuscito.';
    // ⚠️ Condizionata alla CHIAVE come la conferma, e per la stessa ragione: un
    //    rifiuto tardivo non deve chiudere il tentativo di qualcun altro.
    // ⛔ **QUI si annulla anche l'inizializzazione, e non è un dettaglio.** La
    //    presa fa nascere i contatori perché i movimenti della finestra non
    //    svaniscano su un `NULL`; se il canale rifiuta, la riga resterebbe
    //    «inizializzata» senza che l'allineamento sia riuscito. E su una riga
    //    PREESISTENTE — `P` valorizzato, `L` ancora `NULL` — la conseguenza è
    //    peggiore dell'inizializzazione: con `L = 0` e il disallineamento
    //    acceso, il recupero smette di correggere, mentre con `L` `NULL` avrebbe
    //    ripubblicato il valore assoluto.
    //
    // ⭐ **Ma solo se i contatori sono ANCORA A ZERO.** Se nel frattempo è
    //    arrivato un movimento, quel lavoro esiste: la riga è legittimamente nel
    //    regime nuovo e i contatori restano.
    //
    // ⚠️ `$executeRaw` perché la condizione guarda i valori della riga, e un
    //    `updateMany` di Prisma non sa esprimere «riportalo a NULL se è zero».
    // ⭐ **Con `RETURNING`, e non per comodità**: la chiusura può azzerare
    //    l'ultimo confermato (la partenza fallita, sotto), e senza rileggere
    //    la riga il messaggio non saprebbe dirlo — direbbe sempre la stessa
    //    cosa per due esiti diversi. Una riga sola: il tentativo è unico.
    const chiuse = await this.prisma.$queryRaw<
      { last_pushed_available: number | null; local_pending_delta: number | null }[]
    >`
      UPDATE shopify_inventory_sync_states
         SET mismatch_detected = TRUE,
             mismatch_note = ${nota},
             pending_key = NULL,
             pending_available = NULL,
             pending_base = NULL,
             pending_shop_domain = NULL,
             pending_item_id = NULL,
             pending_location_ref = NULL,
             pending_at = NULL,
             -- ⚠️ **Anche la fotografia dello scarico si azzera.** Un tentativo
             --    chiuso senza conferma non ha scaricato niente: lasciarla
             --    appesa la farebbe applicare al tentativo successivo, che ha i
             --    suoi numeri.
             pending_discharge_local = NULL,
             pending_discharge_channel = NULL,
             -- ⛔ **I due contatori vivono o muoiono INSIEME**, e prima no: la
             --    condizione era valutata su ciascuno per conto suo, quindi
             --    poteva restare \`L = −1\` con \`C\` riportato a \`NULL\`. Da lì ogni
             --    acquisizione di canale sarebbe svanita su un \`increment\` di
             --    \`NULL\` — la registrazione degli ordini persa in silenzio.
             --
             -- ⭐ La domanda è una sola: **è rimasto del lavoro?** Se nessuno
             --    dei due si è mosso, la riga esce dal regime come prima del
             --    tentativo; se uno dei due porta qualcosa, restano entrambi.
             local_pending_delta = CASE
               WHEN pending_ha_inizializzato = TRUE
                    AND COALESCE(local_pending_delta, 0) = 0
                    AND COALESCE(channel_acquired_delta, 0) = 0
                 THEN NULL
               ELSE local_pending_delta
             END,
             channel_acquired_delta = CASE
               WHEN pending_ha_inizializzato = TRUE
                    AND COALESCE(local_pending_delta, 0) = 0
                    AND COALESCE(channel_acquired_delta, 0) = 0
                 THEN NULL
               ELSE channel_acquired_delta
             END,
             -- ⛔ **E il vecchio confermato NON certifica una partenza fallita.**
             --    Se questa presa ha fatto nascere i contatori e il lavoro resta
             --    — un movimento è arrivato nella finestra — la riga è nel
             --    regime nuovo ma non ha mai pubblicato: l'ultimo confermato è
             --    quello del regime VECCHIO, e non vale come base qui.
             --
             -- ⚠️ **Non è pignoleria di stato: lo scarico di \`C\` lo userebbe.**
             --    L'invio ordinario fa \`C -= (R − P)\`, e con un \`P\` mai
             --    confermato in questo regime quel numero non significa niente:
             --    corromperebbe il contatore delle acquisizioni.
             --
             -- ⭐ Azzerandolo, il push ordinario esce su \`base_assente\` e la
             --    coppia aspetta un Allinea riuscito. Il lavoro resta scritto in
             --    \`L\`: non si perde niente, si rimanda.
             last_pushed_available = CASE
               WHEN pending_ha_inizializzato = TRUE
                    AND NOT (
                      COALESCE(local_pending_delta, 0) = 0
                      AND COALESCE(channel_acquired_delta, 0) = 0
                    )
                 THEN NULL
               ELSE last_pushed_available
             END,
             pending_ha_inizializzato = NULL
       WHERE tenant_id = ${tenantId}::uuid
         AND variant_id = ${variantId}::uuid
         AND location_id = ${locationId}::uuid
         AND pending_key = ${chiave}
   RETURNING last_pushed_available, local_pending_delta`;
    if (chiuse.length === 0) {
      this.logger.warn(
        `Rifiuto tardivo ignorato (${tenantId}): il tentativo ${chiave} su ${variantId} @ ${locationId} ` +
          'non è più quello aperto. Nessuna scrittura.',
      );
      return;
    }
    const rimasta = chiuse[0];
    // ⛔ **La partenza fallita si NOMINA**: è l'unico caso in cui questo
    //    percorso tocca l'ultimo confermato, e chi legge i registri deve
    //    poterlo distinguere da un rifiuto che ha lasciato la base al suo posto.
    const partenzaFallita =
      rimasta?.last_pushed_available === null && rimasta?.local_pending_delta !== null;
    this.logger.warn(
      `Tentativo chiuso (${classe}) (${tenantId}) ${variantId} @ ${locationId}: ${nota}` +
        (partenzaFallita
          ? " — PARTENZA FALLITA: l'ultimo confermato è stato azzerato, la coppia " +
            'resta fuori dal regime continuo finché un allineamento non riesce.'
          : ''),
    );
  }

  /**
   * Le rivalutazioni del percorso di recupero.
   *
   * Restituisce l'esito che **ferma** l'invio, oppure `null` se si può
   * procedere. ⭐ Sta DOPO tutte le guardie ordinarie — connessione, scope,
   * interruttore di sincronizzazione, sede, livello, storico 26.8 — che il
   * recupero non tocca e che quindi hanno già detto la loro.
   */
  private async recuperoDaFermare(
    tenantId: string,
    variantId: string,
    locationId: string,
    stato: {
      readonly lastPushedAvailable: number | null;
      readonly lastObservedShopifyAvailable: number | null;
      readonly mismatchDetected: boolean;
      readonly localPendingDelta: number | null;
    } | null,
    publishable: number,
    etichetta: string,
  ): Promise<ShopifyInventoryPushResult | null> {
    // 1 · Il disallineamento non c'è più. Il marcatore può essersi spento fra la
    //     lettura della coda e questa riga — un'eco, o un altro push riuscito.
    //     ⭐ Vale in entrambi i regimi: non guarda nessun valore.
    if (!stato?.mismatchDetected) {
      return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
    }

    // 2 · Il marcatore è acceso, ma l'ultima osservazione dice che Shopify porta
    //     già il numero che si manderebbe: ripubblicarlo non correggerebbe
    //     niente. ⚠️ Il marcatore NON si spegne qui: spegnerlo è mestiere della
    //     riconciliazione (Caso A), che è l'unica a guardare davvero il canale.
    //
    // ⛔ **Ma «il numero che si manderebbe» qui è ancora il Disponibile
    //    ASSOLUTO**, e nel regime composto non è quello che partirebbe. Questa
    //    domanda arriva PRIMA del calcolo del valore composto: con una base,
    //    rispondere adesso significa rispondere sul numero sbagliato.
    //
    //    Lo scenario, ed è quello del proprietario dal lato del ritentativo:
    //
    // ```text
    //    P = 10   Disponibile = 10   L = +1   osservato = 10   canale (R) = 9
    //    la domanda vecchia   10 === 10  ->  «non c'è niente da fare»
    //    il valore composto   T = max(0, 9 + 1) = 10  !=  R = 9  ->  si manda
    // ```
    //
    // ⭐ **Con una base la domanda si fa dopo**, dentro `componi()`, e si fa
    //    meglio: su `R` letto FRESCO dal canale invece che sull'ultima
    //    osservazione, che è vecchia quanto l'ultimo webhook. `componi()` esce
    //    con `nessun_invio` quando `T === R`, che è la stessa domanda fatta al
    //    momento giusto e sul numero giusto.
    //
    // ⚠️ **Senza base resta la domanda di prima**, ed è ancora quella giusta:
    //    lì non esiste un valore composto, e il numero che partirebbe è
    //    davvero `publishable`.
    const haBase = stato.localPendingDelta !== null && stato.localPendingDelta !== undefined;
    if (!haBase && stato.lastObservedShopifyAvailable === publishable) {
      return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
    }

    // 3 · Un RINVIO sopravvenuto. ⛔ Il ramo differito della riconciliazione non
    //     spegne un marcatore già acceso: senza questa domanda, un
    //     disallineamento vecchio autorizzerebbe un invio che il rinvio appena
    //     deliberato vieta — e lo farebbe entro la stessa chiamata.
    //
    // ⭐ **Solo nel regime VECCHIO** — deciso dal proprietario il 10/09/2026.
    //    Là si pubblica il Disponibile ASSOLUTO, che annulla la sottrazione già
    //    applicata da Shopify per un ordine aperto: la protezione serve, e
    //    resta esattamente com'era.
    //
    // ⭐ **Nel regime composto la protezione non si toglie: è già data dalla
    //    forma del valore.** `T = max(0, R + L)` parte da `R` — la sottrazione
    //    degli ordini aperti la conserva per costruzione — e la scrittura
    //    viaggia con `changeFromQuantity = R`, quindi se il canale si muove nel
    //    frattempo Shopify rifiuta. Il danno da cui il rinvio proteggeva non è
    //    più costruibile.
    //
    // ⛔ **E qui il rinvio faceva DANNO, non solo lavoro inutile**: confrontava
    //    l'osservato col Disponibile assoluto, che è più alto proprio perché gli
    //    ordini aperti non sono ancora acquisiti da noi. Leggeva «sta alzando»
    //    dove si stava abbassando, e tratteneva una vendita al banco finché gli
    //    ordini online non fossero stati evasi.
    //
    // ⚠️ **LA CONDIZIONE DI VALIDITÀ, da rileggere se il modello cambia**:
    //    regge finché `T` parte da `R` letto FRESCO e il confronto remoto
    //    viaggia con `R`. Se il valore composto cambiasse origine, il rinvio
    //    andrebbe ripristinato anche qui.
    //
    // ⚠️ Le altre protezioni restano intatte: pausa, collegamenti esclusi,
    //    confronto remoto, idempotenza, tentativi incerti.
    if (!haBase) {
      const rinviata = await this.reconciliation.rinvioAttivo(
        tenantId,
        variantId,
        locationId,
        stato.lastObservedShopifyAvailable,
        publishable,
      );
      if (rinviata) {
        this.logger.debug(
          `Ripubblicazione rinviata (${tenantId}): ${etichetta} @ ${locationId} — ` +
            `osservato ${stato.lastObservedShopifyAvailable}, pubblicabile ${publishable}, impegni Shopify attivi`,
        );
        return { pushed: false, reason: 'rinvio_attivo', publishableAvailable: publishable };
      }
    }

    // ⚠️ **Il verso che ALZA la quantità su Shopify è ambiguo, e va detto.**
    //    Lo stesso stato su disco è compatibile con storie diverse: Shopify
    //    abbassato a mano (VestiFlow ha ragione, e ripubblicare è il rimedio),
    //    una vendita di canale mai scaricata (Shopify ha ragione, e
    //    ripubblicare rimette in vendita merce già uscita), o movimenti che si
    //    compensano. ⛔ **Disponibile invariato non dimostra assenza di
    //    movimenti**: un saldo non racconta la storia che lo ha prodotto.
    //
    // ⛔ **Qui c'era «il criterio che le separa non è memorizzato da nessuna
    //    parte», e confondeva due domande diverse.** Corretto il 09/09/2026:
    //
    //    1. «QUESTA VENDITA HA GIÀ PRODOTTO UNO SCARICO?» — ha risposta, ed è
    //       persistita: `OnlineSale.inventoryStatus`, lo `StockMovement` con
    //       `sourceDocumentType = online_sale`, e il vincolo unico per riga che
    //       impedisce il doppio scarico. È una PROVA, e c'è.
    //
    //    2. «QUELLA VENDITA DEVE INCIDERE SULLE GIACENZE DI QUESTA GESTIONE?» —
    //       non ha risposta, e non perché manchi un campo: è una DECISIONE
    //       approvata e mai eseguita. Senza il confine sugli ordini e il
    //       documento di apertura delle giacenze (`docs/02` §4.6-4.7, dichiarati
    //       aperti da `docs/24` §12.0 e §12.9) non si sa se una vendita sia già
    //       compresa nel saldo iniziale.
    //
    // ⚠️ È la seconda a mancare, ed è la sola che deciderebbe questo invio.
    //    Ricognizione completa in `docs/ORDINI-CANALE-ESTERNO.md`.
    //
    // ⛔ **Non si tace e non si blocca**: bloccare rinuncerebbe alla metà buona
    //    del rimedio, tacere propagherebbe l'errore al canale in silenzio.
    // ⭐ **Nel regime vecchio i due numeri sono questi**: l'ultima osservazione e
    //    il Disponibile assoluto, che è davvero ciò che partirebbe. Nel regime
    //    composto l'avviso si emette DOPO la composizione, sui numeri della
    //    scrittura effettiva — vedi `avvisaSeAlza`.
    if (!haBase) {
      this.avvisaSeAlza(
        tenantId,
        etichetta,
        locationId,
        stato.lastObservedShopifyAvailable,
        publishable,
        'ultima osservazione',
      );
    }
    return null;
  }

  /**
   * L'avviso sul verso che ALZA la quantità sul canale.
   *
   * ⛔ **Descrive la variazione EFFETTIVAMENTE TENTATA**, e non è una pignoleria
   *    di forma: prima confrontava l'ultima osservazione con il Disponibile
   *    assoluto — un numero che nel regime composto **non parte**. Poteva quindi
   *    avvisare quando la scrittura in realtà abbassa, e tacere quando alza.
   *    Entrambi i casi hanno una prova.
   *
   * ⭐ **I due numeri sono quelli che viaggiano verso Shopify**: `da` è il
   *    confronto (`changeFromQuantity`), `a` è la quantità.
   */
  private avvisaSeAlza(
    tenantId: string,
    etichetta: string,
    locationId: string,
    da: number | null,
    a: number,
    fonte: 'ultima osservazione' | 'lettura fresca del canale',
  ): void {
    if (da === null || da >= a) {
      return;
    }
    this.logger.warn(
      `Ripubblicazione che ALZA la quantità su Shopify (${tenantId}): ${etichetta} @ ${locationId} — ` +
        `da ${da} a ${a} (${fonte}). ` +
        'Se su quella coppia esiste una vendita non registrata in VestiFlow, questo invio la annulla anche sul canale.',
    );
  }

  /**
   * 26.8 · il push delle QUANTITÀ può usare il collegamento di questa variante?
   *
   * ⛔ **Il difetto che chiude**: `pushLevel` risolveva l'articolo di inventario
   *    dalla colonna-cache — o andava a leggerlo su Shopify partendo da
   *    `shopifyVariantId` — senza chiedere niente allo storico. Una variante col
   *    periodo chiuso e la cache conservata riceveva comunque la quantità
   *    (misurato il 09/09/2026, prova `E14`).
   *
   * ⭐ **La domanda si fa sul GID, non sull'anagrafica**: uno storico vecchio
   *    chiuso non blocca un collegamento attuale valido su un altro GID.
   *
   * ⚠️ **Connessione non migrata** (nessun negozio identificato): nessuno
   *    storico da interrogare, comportamento invariato. Assenza di storico non
   *    è esclusione.
   *
   * ⛔ **Variante con l'articolo di inventario ma SENZA il GID di variante**: si
   *    rifiuta. È l'unico caso in cui il collegamento non è verificabile, e
   *    usare un identificativo remoto che lo storico non può confermare è
   *    esattamente ciò che 26.7 vieta. ⚠️ **Nessun percorso applicativo produce
   *    quello stato** — i due identificativi si scrivono e si azzerano sempre
   *    insieme — quindi la scelta è conservativa e va guardata se comparisse.
   *
   * Restituisce il motivo del rifiuto, oppure `null` se si può procedere.
   */
  private async collegamentoDellaVarianteEscluso(
    tenantId: string,
    variant: {
      readonly id: string;
      readonly sku: string | null;
      readonly shopifyVariantId: string | null;
      readonly shopifyInventoryItemId: string | null;
    },
    locationId: string,
  ): Promise<string | null> {
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    if (!shopId) {
      return null;
    }

    if (variant.shopifyVariantId) {
      const uso = await this.storico.collegamentoUsabileVariante(this.prisma, {
        shopId,
        shopifyVariantGid: gidVariante(variant.shopifyVariantId),
        variantId: variant.id,
      });
      if (uso.tipo === 'utilizzabile') {
        return null;
      }
      await this.rifiutoARegistro(tenantId, shopId, {
        variantId: variant.id,
        etichetta: variant.sku ?? variant.id,
        remoteGid: gidVariante(variant.shopifyVariantId),
        detail: `${uso.tipo}: ${uso.motivo} (quantità, sede ${locationId})`,
        motivo: uso.motivo,
      });
      return uso.motivo;
    }

    if (variant.shopifyInventoryItemId) {
      const motivo =
        `l'articolo di inventario ${variant.shopifyInventoryItemId} non ha un GID di variante ` +
        "sull'anagrafica: lo storico non può confermare il collegamento, e la quantità non parte.";
      await this.rifiutoARegistro(tenantId, shopId, {
        variantId: variant.id,
        etichetta: variant.sku ?? variant.id,
        remoteGid: null,
        detail: `collegamento_non_verificabile: ${motivo} (sede ${locationId})`,
        motivo,
      });
      return motivo;
    }

    // Nessun identificativo remoto: non c'è niente da verificare, e il percorso
    // ordinario risponde già `variant_not_linked` più avanti.
    return null;
  }

  /**
   * §10.3 · la riga di registro di un rifiuto del push INVENTARIO.
   *
   * ⛔ **Un guasto del registro NON annulla e NON nasconde.** Qui non c'è
   *    nessuna transazione da far cadere: l'operazione locale che ha mosso la
   *    giacenza è già stata committata molto prima, e questo push è
   *    post-commit. Far risalire l'eccezione annullerebbe un'operazione locale
   *    riuscita per un guasto di tracciamento — il contrario di ciò che serve.
   *    Il rifiuto resta valido (la quantità non parte comunque) e il guasto si
   *    dichiara nel log come errore, non come avviso.
   */
  private async rifiutoARegistro(
    tenantId: string,
    shopId: string,
    dati: {
      readonly variantId: string;
      readonly etichetta: string;
      readonly remoteGid: string | null;
      readonly detail: string;
      readonly motivo: string;
    },
  ): Promise<void> {
    this.logger.warn(`Push inventario rifiutato (${tenantId}): ${dati.motivo}`);
    try {
      const negozio = await this.prisma.shopifyShop.findUnique({
        where: { id: shopId },
        select: { shopGid: true },
      });
      await this.registro.registraRifiuto(
        {
          tenantId,
          attore: { tipo: PlatformAuditActor.push },
          operation: PlatformAuditOperation.riaggancio_rifiutato,
          shopGid: negozio?.shopGid ?? null,
          entityId: dati.variantId,
          entityLabel: dati.etichetta.slice(0, 200),
          remoteGid: dati.remoteGid,
        },
        dati.detail,
        randomUUID(),
      );
    } catch (errore: unknown) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      this.logger.error(
        `Registro dei rifiuti non scritto per il push inventario (${tenantId}/${dati.variantId}): ` +
          `${messaggio}. Il rifiuto resta valido: nessuna quantità è partita.`,
      );
    }
  }

  private async resolveInventoryItemId(
    variant: {
      readonly id: string;
      readonly shopifyInventoryItemId: string | null;
      readonly shopifyVariantId: string | null;
    },
    shopDomain: string,
    accessToken: string,
  ): Promise<string | null> {
    if (variant.shopifyInventoryItemId) {
      return variant.shopifyInventoryItemId;
    }
    if (!variant.shopifyVariantId) {
      return null;
    }

    const shopifyVariant = await this.shopifyAdmin.getVariant(
      shopDomain,
      accessToken,
      variant.shopifyVariantId,
    );
    const inventoryItemId = String(shopifyVariant.inventory_item_id);

    await this.prisma.productVariant.update({
      where: { id: variant.id },
      data: { shopifyInventoryItemId: inventoryItemId },
    });

    return inventoryItemId;
  }
}
