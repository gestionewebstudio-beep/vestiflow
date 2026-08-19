import { Injectable, Logger } from '@nestjs/common';
import { ReservationStatus, SalesOrderSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../order-reservations/stock-reservation.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

/**
 * Finestra oltre la quale l'assenza dall'elenco remoto non significa niente:
 * Shopify restituisce solo gli ordini degli ultimi 60 giorni alle app senza
 * `read_all_orders`, e quel permesso va richiesto e approvato da loro.
 */
const CHANNEL_ORDER_WINDOW_DAYS = 60;

/**
 * Margine di sicurezza sul bordo della finestra.
 *
 * I 60 giorni li valuta Shopify sul proprio orologio, noi li calcoliamo sul
 * nostro: un ordine proprio sul confine potrebbe essere escluso da loro e
 * incluso da noi, e allora lo segnaleremmo come sparito mentre esiste. Guardando
 * due giorni più in qua il confine sfocato resta fuori.
 *
 * Costa poco: si rinuncia a vedere le cancellazioni di ordini fra i 58 e i 60
 * giorni, che stanno comunque per uscire dalla finestra. Si sbaglia nell'unico
 * verso accettabile — qualche cancellazione non vista invece di segnalazioni
 * false, che insegnerebbero a ignorare anche quelle vere.
 */
const CHANNEL_ORDER_WINDOW_MARGIN_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Soglie oltre le quali un'assenza di massa NON viene creduta.
 *
 * Che un negozio cancelli metà dei propri ordini è raro; che l'elenco remoto
 * sia incompleto lo è molto meno. Due modi noti in cui succede:
 *
 * - `listAllOrders` pagina con `since_id` e chiude il ciclo su `page.orders ??
 *   []`: una pagina 2xx senza quella chiave tronca l'elenco **in silenzio**,
 *   senza sollevare niente;
 * - dopo un CAMBIO DI NEGOZIO Shopify (c'è un servizio apposta) gli ordini del
 *   negozio precedente non compaiono più, perché stiamo interrogando un altro
 *   negozio.
 *
 * In entrambi i casi agire significherebbe segnalare come cancellati centinaia
 * di ordini vivi e liberarne gli impegni: merce data per disponibile mentre è
 * venduta, cioè la si vende due volte. Meglio non concludere e dirlo.
 */
const BULK_ABSENCE_MIN_COUNT = 5;
const BULK_ABSENCE_MAX_SHARE = 0.2;

export interface MissingOrdersReconcileResult {
  /** Ordini che risultano spariti dal canale in questa passata. */
  readonly missing: number;
  /** Ordini ricomparsi: la segnalazione precedente è stata tolta. */
  readonly reappeared: number;
  /** Ordini spariti e non evasi, di cui sono stati liberati gli impegni. */
  readonly released: number;
  /**
   * Perché il confronto non ha concluso niente, quando è successo. Non è un
   * errore: è una cosa che l'operatore deve sapere, perché il controllo che si
   * aspettava non è stato fatto.
   */
  readonly inconclusive?: string;
}

const EMPTY_RESULT: MissingOrdersReconcileResult = { missing: 0, reappeared: 0, released: 0 };

/**
 * Ordini spariti dal canale.
 *
 * Un ordine può essere CANCELLATO su Shopify, e VestiFlow non lo saprebbe in
 * nessun modo: non siamo iscritti a `orders/delete`. Ce ne accorgiamo qui,
 * confrontando l'elenco remoto — che lo scarico ordini ha già in mano per
 * intero — con quello locale.
 *
 * (L'ANNULLAMENTO è un'altra cosa e funziona già: siamo iscritti a
 * `orders/cancelled` e gli impegni vengono rilasciati.)
 *
 * **VestiFlow non cancella niente da solo.** Qui si scrive un'osservazione e si
 * libera la merce che non ha più motivo di restare bloccata; la rimozione
 * dell'ordine resta una scelta dell'operatore.
 */
@Injectable()
export class ShopifyMissingOrdersService {
  private readonly logger = new Logger(ShopifyMissingOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: StockReservationService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  /**
   * Confronta l'elenco remoto con quello locale, in coda allo scarico ordini.
   *
   * `remoteOrderGids` deve essere l'elenco **completo** dei remoti: se fosse
   * parziale, gli ordini mancanti verrebbero scambiati per cancellati.
   */
  async reconcile(
    tenantId: string,
    params: {
      readonly remoteOrderGids: ReadonlySet<string>;
      readonly now?: Date;
    },
  ): Promise<MissingOrdersReconcileResult> {
    // PRIMA GUARDIA — elenco remoto vuoto: non si conclude niente.
    //
    // Da un elenco vuoto non si distingue «negozio senza ordini» da «la
    // chiamata non ha portato nulla», e nel secondo caso segnare TUTTI gli
    // ordini come spariti sarebbe il danno peggiore che questa funzione possa
    // fare. Nel dubbio non si dice niente.
    if (params.remoteOrderGids.size === 0) {
      const reason =
        'Shopify non ha restituito nessun ordine: il controllo sugli ordini spariti non è stato eseguito.';
      this.logger.warn(`Riconciliazione ordini saltata (${tenantId}): elenco remoto vuoto.`);
      return { ...EMPTY_RESULT, inconclusive: reason };
    }

    // L'id locale può essere stato scritto in forme diverse nel tempo (GID
    // oppure numero nudo). Si confronta su entrambe: un formato che non combacia
    // farebbe risultare sparito un ordine che c'è.
    const remoteIds = new Set<string>(params.remoteOrderGids);
    for (const gid of params.remoteOrderGids) {
      const numericTail = gid.split('/').pop();
      if (numericTail) {
        remoteIds.add(numericTail);
      }
    }

    const now = params.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - (CHANNEL_ORDER_WINDOW_DAYS - CHANNEL_ORDER_WINDOW_MARGIN_DAYS) * DAY_MS,
    );

    const reappeared = await this.clearReappeared(tenantId, remoteIds);

    // SECONDA GUARDIA — la finestra.
    //
    // Fuori dai 60 giorni Shopify semplicemente non manda gli ordini, quindi
    // l'assenza non è un'informazione: è il limite dell'API. Segnalarla
    // produrrebbe una falsa segnalazione su tutto lo storico, e una
    // segnalazione falsa ripetuta insegna a ignorare anche quelle vere.
    const candidates = await this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        source: { in: [SalesOrderSource.shopify_online, SalesOrderSource.shopify_pos] },
        shopifyOrderId: { not: null },
        placedAt: { gte: cutoff },
        channelMissingSince: null,
      },
      select: { id: true, orderNumber: true, shopifyOrderId: true, fulfilledAt: true },
    });

    // Il confronto si fa in memoria contro l'insieme dei remoti: un `notIn` con
    // migliaia di id sarebbe una query mostruosa, e la finestra tiene già
    // piccolo l'insieme dei candidati.
    const missing = candidates.filter((order) => !remoteIds.has(order.shopifyOrderId as string));
    if (missing.length === 0) {
      return { ...EMPTY_RESULT, reappeared };
    }

    // TERZA GUARDIA — un'assenza di massa non si crede.
    //
    // Sopra la soglia il sospetto è che sia sbagliato l'elenco, non il negozio:
    // una pagina persa dalla paginazione, o un cambio di negozio Shopify. Non si
    // segnala e non si libera niente — e lo si dice, perché l'operatore deve
    // sapere che il controllo non è stato fatto.
    const share = missing.length / candidates.length;
    if (missing.length >= BULK_ABSENCE_MIN_COUNT && share > BULK_ABSENCE_MAX_SHARE) {
      const reason =
        `${missing.length} ordini su ${candidates.length} non risultano su Shopify: troppi perché ` +
        'siano cancellazioni. Il controllo non è stato eseguito — verifica la connessione al negozio.';
      this.logger.warn(`Assenza di massa non creduta (${tenantId}): ${reason}`);
      return { ...EMPTY_RESULT, reappeared, inconclusive: reason };
    }

    let released = 0;
    const syncTargets = new Set<string>();

    for (const order of missing) {
      // Gli impegni si liberano SUBITO, senza aspettare l'operatore: merce
      // riservata per un ordine che non esiste più è merce che non si può
      // vendere, e quella non è una decisione da rimandare. Dentro la finestra
      // il segnale è affidabile, quindi il rilascio è sicuro.
      //
      // Su un ordine già evaso non c'è niente da rilasciare — gli impegni sono
      // stati consumati all'evasione — e la merce è uscita davvero: cancellare
      // l'ordine sul canale non la riporta in magazzino. Resta la sola
      // segnalazione, che serve perché è una situazione da guardare: esiste un
      // corrispettivo registrato per una vendita che sul canale non risulta più.
      const releasable = order.fulfilledAt === null;

      // Una transazione per ordine: segnalazione e rilascio o vanno insieme o
      // non vanno. Un ordine che fallisce non porta giù gli altri — sono fatti
      // indipendenti, e vederne dieci su undici è meglio che nessuno.
      const freed = await this.prisma.$transaction(async (tx) => {
        const active = releasable
          ? await tx.stockReservation.findMany({
              where: { tenantId, salesOrderId: order.id, status: ReservationStatus.active },
              select: { variantId: true, locationId: true },
            })
          : [];
        if (active.length > 0) {
          await this.reservations.releaseOrderReservationsTx(tx, {
            tenantId,
            salesOrderId: order.id,
            note: 'Ordine non più presente sul canale: impegni liberati',
          });
        }
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { channelMissingSince: now },
        });
        return active;
      });

      // Fuori dalla transazione: contare dentro significherebbe contare due
      // volte se venisse rieseguita.
      if (freed.length > 0) {
        released += 1;
        for (const reservation of freed) {
          syncTargets.add(`${reservation.variantId}:${reservation.locationId}`);
        }
      }
    }

    await this.pushInventoryTargets(tenantId, syncTargets);

    this.logger.log(
      `Ordini spariti dal canale (${tenantId}): ${missing.length} segnalati, ${released} con impegni liberati, ${reappeared} ricomparsi.`,
    );

    return { missing: missing.length, reappeared, released };
  }

  /**
   * Un ordine segnalato che ricompare nell'elenco remoto non è più sparito: la
   * segnalazione va tolta, altrimenti resta accesa una cosa non più vera.
   */
  private async clearReappeared(tenantId: string, remoteIds: ReadonlySet<string>): Promise<number> {
    const flagged = await this.prisma.salesOrder.findMany({
      where: { tenantId, channelMissingSince: { not: null }, shopifyOrderId: { not: null } },
      select: { id: true, shopifyOrderId: true },
    });
    const reappeared = flagged.filter((order) => remoteIds.has(order.shopifyOrderId as string));
    if (reappeared.length === 0) {
      return 0;
    }
    await this.prisma.salesOrder.updateMany({
      // `tenantId` anche qui: gli id vengono da una query già filtrata, ma un
      // update di massa senza vincolo di tenant è il tipo di riga che diventa
      // pericolosa quando qualcuno la copia altrove.
      where: { tenantId, id: { in: reappeared.map((order) => order.id) } },
      data: { channelMissingSince: null },
    });
    return reappeared.length;
  }

  /** Il calo di Impegnata va comunicato al canale, come in ogni altro flusso. */
  private async pushInventoryTargets(
    tenantId: string,
    targets: ReadonlySet<string>,
  ): Promise<void> {
    for (const target of targets) {
      const [variantId, locationId] = target.split(':');
      if (!variantId || !locationId) {
        continue;
      }
      try {
        await this.inventoryPush.pushLevel(tenantId, variantId, locationId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }
  }
}
