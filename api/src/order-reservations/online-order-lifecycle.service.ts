import { Injectable, Logger } from '@nestjs/common';
import {
  OnlineOrderEventType,
  SalesOrderFulfillmentStatus,
  ShipmentLineOutcome,
  type Prisma,
  type SalesOrderSource,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { buildOnlineOrderDedupeKey } from './online-order-event.util';
import { OnlineSaleFulfillmentService } from './online-sale-fulfillment.service';
import { StockReservationService, type ReservationLineInput } from './stock-reservation.service';

/**
 * Evento canonico ordine online: prodotto dai connettori canale
 * (Shopify per primo), consumato dal dominio quantità. Il dominio non
 * conosce i payload del canale, solo questi dati normalizzati.
 */
/**
 * ⭐ DA DOVE arriva l’ordine — deciso dal proprietario il 12/09/2026 (`docs/27` §5-bis).
 *
 * - `continua`: webhook o recupero della sincronizzazione continua, cioè DOPO
 *   l’attivazione. Tutto ciò che arriva di qui è accaduto mentre VestiFlow
 *   governava la giacenza: un’evasione si scarica anche senza impegno (l’ordine
 *   creato ed evaso mentre la sincronizzazione era interrotta non si ignora).
 * - `pendenti`: gli ordini ancora APERTI acquisiti alla partenza, come impegni.
 * - `massiva`: «Importa ordini» (storico intero): un evaso senza impegno resta
 *   `not_applied` — la giacenza reale è già allineata dal canale.
 */
export type OrigineAcquisizioneOrdine = 'continua' | 'pendenti' | 'massiva';

export interface OnlineOrderEventInput {
  readonly tenantId: string;
  readonly channel: SalesOrderSource;
  readonly type: OnlineOrderEventType;
  /** Assente = `massiva`: il comportamento di prima, per chi non lo dichiara. */
  readonly acquisizione?: OrigineAcquisizioneOrdine;
  readonly salesOrderId: string;
  readonly externalOrderId: string;
  /** Suffisso dedupe per eventi ripetibili (es. updated_at del canale). */
  readonly dedupeSuffix?: string;
  readonly occurredAt?: Date;
  /** Id evasione esterna (solo eventi fulfilled). */
  readonly externalFulfillmentId?: string | null;
  /**
   * Location dell'ORDINE. Per gli impegni è solo il ripiego delle righe che non
   * portano una sede propria (`lines[].locationId`, dal fulfillment order);
   * per l'evasione è la sede dell'uscita.
   */
  readonly locationId?: string | null;
  /** Righe da impegnare (solo eventi created/updated), ognuna con la SUA sede. */
  readonly lines?: readonly ReservationLineInput[];
  /**
   * ⭐ Righe che oggi non si risolvono a una variante — collegamento CHIUSO,
   *    12/09/2026 — ma il cui impegno preesistente si CONSERVA (`docs/24`
   *    §1.14.3: gli impegni seguono il ciclo dell'ordine). Solo created/updated.
   */
  readonly righeDaConservare?: readonly string[];
  /**
   * ⭐ Righe che una lettura COMPLETA dei fulfillment order dà assegnate a una
   *    location NON collegata (13/09/2026): l'impegno precedente si RILASCIA
   *    solo se il residuo assegnato là è TUTTA la quantità residua della riga
   *    (quantità corrente − spedizioni applicate); altrimenti si conserva.
   *    Solo created/updated.
   */
  readonly righeDaRilasciare?: readonly RigaConfermataAltrove[];
  /** La spedizione acquisita (solo eventi `online_order_shipped`). */
  readonly spedizione?: SpedizioneInput;
}

/** Una riga che Shopify tiene, per intero o in parte, in una location non collegata. */
export interface RigaConfermataAltrove {
  readonly salesOrderLineId: string;
  /** La quantità corrente della riga sull'ordine. */
  readonly quantity: number;
  /** Quanto di quella riga resta da evadere nella location non collegata. */
  readonly residuoAssegnatoAltrove: number;
}

/**
 * ⭐ Una SPEDIZIONE — un `fulfillment` riuscito del canale (deciso dal
 *    proprietario il 12/09/2026): ogni quantità uscita scarica la SUA sede quando
 *    la si acquisisce, anche a ordine incompleto; una riga d'ordine può uscire in
 *    più spedizioni e da più sedi, ognuna col suo movimento. Gli effetti sono
 *    idempotenti riga per riga (`sales_order_shipment_lines`).
 */
export interface SpedizioneInput {
  /** L'id dell'evasione sul canale: l'identità dell'effetto. */
  readonly externalFulfillmentId: string;
  /** La location remota, com'è nel payload. */
  readonly shopifyLocationId: string | null;
  /** La sede VestiFlow risolta dal collegamento esplicito; `null` = non collegata. */
  readonly locationId: string | null;
  readonly shippedAt: Date;
  readonly righe: readonly SpedizioneRigaInput[];
}

export interface SpedizioneRigaInput {
  readonly salesOrderLineId: string;
  /** `null` = riga non risolta (collegamento chiuso, articolo sconosciuto). */
  readonly variantId: string | null;
  readonly sku: string;
  /** Quantità uscita CON QUESTA spedizione. */
  readonly quantity: number;
}

/**
 * `not_applied`: l'evento era valido ma NON ha prodotto effetti — un reso senza
 * sede di rientro determinabile — e la sua registrazione è stata tolta nella
 * stessa transazione: quando la sede sarà collegata, lo stesso evento (stesso
 * webhook o «Importa ordini») si applica. Registrarlo come `applied` lo avrebbe
 * reso irripetibile per costruzione (dedupe).
 */
export type OnlineOrderEventOutcome = 'applied' | 'duplicate' | 'not_applied';

/**
 * Ciclo di vita canonico degli ordini online (fase 1 §4–§9 + fase 2):
 * - created/updated → impegni allineati alle righe (Giacenza INVARIATA);
 * - cancelled → impegni rilasciati (nessun movimento fisico);
 * - fulfilled → Vendita online + movimenti `online_sale` + consumo impegni,
 *   in UN'UNICA transazione (fase 2 §2–§4);
 * - shipped → ⭐ scarico per sede di ciò che è USCITO con quella spedizione,
 *   impegno consumato per la quantità spedita (12/09/2026); idempotente riga
 *   per riga. Nessuna Vendita online: quella resta a completamento;
 * - partially_fulfilled → nessun effetto proprio: lo stato è sull'ordine e gli
 *   effetti fisici sono delle spedizioni. ⛔ Qui c'era «richiede verifica,
 *   gestione non supportata»: superato dal 12/09/2026;
 * - refunded → stato economico + rettifica in `sales_order_refunds`, MAI
 *   carico automatico (fase 2 §7);
 * - restocked → carico reale collegato alla Vendita online (fase 2 §8).
 *
 * Idempotenza: ogni evento viene registrato in `online_order_events` con
 * dedupe key univoca per tenant NELLA STESSA transazione degli effetti;
 * un evento già registrato non produce effetti (webhook doppio ⇒ no-op).
 */
@Injectable()
export class OnlineOrderLifecycleService {
  private readonly logger = new Logger(OnlineOrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: StockReservationService,
    private readonly onlineSales: OnlineSaleFulfillmentService,
  ) {}

  async handle(event: OnlineOrderEventInput): Promise<OnlineOrderEventOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const recorded = await this.recordEventTx(tx, event);
      if (!recorded) {
        this.logger.debug(
          `Evento duplicato ignorato: ${event.type} ordine ${event.externalOrderId}`,
        );
        return 'duplicate';
      }

      switch (event.type) {
        case OnlineOrderEventType.online_order_created:
        case OnlineOrderEventType.online_order_updated:
          await this.applyOrderUpsertTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_cancelled:
          await this.applyCancellationTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_fulfilled:
          await this.applyFulfilledTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_shipped: {
          // ⭐ Una riga rimasta `senza_sede` tiene l'evento RIPETIBILE (13/09/2026,
          //    percorso 23): lo stesso webhook — stesso `updated_at` — o un
          //    recupero la applica quando la location viene collegata. Le righe
          //    già scaricate non si toccano (idempotenza per riga).
          const spedizione = await this.onlineSales.applyShipmentTx(tx, event);
          if (spedizione.ripetibile) {
            await this.cancellaRegistrazioneTx(tx, event);
            return 'not_applied';
          }
          break;
        }
        case OnlineOrderEventType.online_order_partially_fulfilled:
          // Nessun effetto proprio (vedi sopra): l'evento resta nel registro
          // degli eventi per dire che l'ordine è passato da questo stato.
          break;
        case OnlineOrderEventType.online_order_refunded:
          await this.onlineSales.applyRefundAfterSaleTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_restocked: {
          const restock = await this.onlineSales.applyRestockAfterSaleTx(tx, event);
          if (!restock.applicato) {
            await this.cancellaRegistrazioneTx(tx, event);
            return 'not_applied';
          }
          break;
        }
      }

      return 'applied';
    });
  }

  /** Toglie la registrazione appena scritta: l'evento resta ripetibile. */
  private async cancellaRegistrazioneTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    const dedupeKey = buildOnlineOrderDedupeKey(
      event.channel,
      event.externalOrderId,
      event.type,
      event.dedupeSuffix,
    );
    await tx.onlineOrderEvent.deleteMany({ where: { tenantId: event.tenantId, dedupeKey } });
  }

  /** Registra l'evento canonico; false se già presente (dedupe key). */
  private async recordEventTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<boolean> {
    const dedupeKey = buildOnlineOrderDedupeKey(
      event.channel,
      event.externalOrderId,
      event.type,
      event.dedupeSuffix,
    );

    // skipDuplicates: nessun errore in transazione, count 0 ⇒ evento già visto.
    const result = await tx.onlineOrderEvent.createMany({
      data: [
        {
          tenantId: event.tenantId,
          channel: event.channel,
          type: event.type,
          salesOrderId: event.salesOrderId,
          externalOrderId: event.externalOrderId,
          dedupeKey,
        },
      ],
      skipDuplicates: true,
    });

    return result.count > 0;
  }

  /**
   * Ordine creato/aggiornato: impegna le righe SOLO se l'ordine è ancora
   * aperto (non annullato, non evaso). Gli ordini storici già evasi importati
   * in bulk non devono gonfiare la Impegnata.
   */
  private async applyOrderUpsertTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    const locationId = event.locationId ?? null;
    // ⭐ La sede è PER RIGA (13/09/2026): una riga senza la sua e senza quella
    //    dell'ordine non si impegna — l'impegno che avesse si CONSERVA (B7:
    //    nessuna sede indovinata; l'ordine è già segnalato). ⭐ Eccezione decisa
    //    il 13/09/2026: se la lettura completa dice che TUTTA la quantità
    //    residua sta in una location non collegata, l'impegno si RILASCIA (il
    //    pezzo non partirà da lì); a quantità diversa, si conserva.
    const righe = (event.lines ?? []).filter((riga) => Boolean(riga.locationId ?? locationId));
    const righeSenzaSede = (event.lines ?? [])
      .filter((riga) => !(riga.locationId ?? locationId))
      .map((riga) => riga.salesOrderLineId);
    const righeDaConservare = [...(event.righeDaConservare ?? []), ...righeSenzaSede];

    const order = await tx.salesOrder.findFirst({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      select: { cancelledAt: true, fulfilledAt: true, fulfillmentStatus: true },
    });
    // ⭐ Anche a ordine PARZIALMENTE evaso (12/09/2026): la parte ancora da
    //    spedire conserva l'impegno, e un annullamento parziale nel frattempo
    //    lo riduce. Fermo restando: evaso o annullato, niente si riapre.
    if (
      !order ||
      order.cancelledAt !== null ||
      order.fulfilledAt !== null ||
      (order.fulfillmentStatus !== SalesOrderFulfillmentStatus.unfulfilled &&
        order.fulfillmentStatus !== SalesOrderFulfillmentStatus.partially_fulfilled)
    ) {
      return;
    }

    // ⭐ L'impegno di una riga = quantità corrente − quanto è GIÀ uscito con le
    //    spedizioni applicate (`scaricata`): la spedizione consuma l'impegno, e
    //    l'aggiornamento successivo non deve rimetterlo.
    const spedite = await this.quantitaSpeditePerRiga(tx, event.tenantId, event.salesOrderId);
    const daImpegnare = righe.flatMap((riga) => {
      const quantity = riga.quantity - (spedite.get(riga.salesOrderLineId) ?? 0);
      return quantity > 0 ? [{ ...riga, quantity }] : [];
    });
    // Ordine, riga, quantità e assegnazione — mai i totali `committed`: si
    // rilascia solo se il residuo assegnato altrove È il residuo della riga.
    const daRilasciare: string[] = [];
    for (const riga of event.righeDaRilasciare ?? []) {
      const residuo = riga.quantity - (spedite.get(riga.salesOrderLineId) ?? 0);
      if (residuo > 0 && riga.residuoAssegnatoAltrove === residuo) {
        daRilasciare.push(riga.salesOrderLineId);
      } else {
        righeDaConservare.push(riga.salesOrderLineId);
      }
    }

    if (daImpegnare.length === 0 && righeDaConservare.length === 0 && daRilasciare.length === 0) {
      // ⭐ Nessuna riga da impegnare — tutte tolte dal canale, come un annullamento
      //    parziale arrivato a zero: gli impegni ancora attivi si rilasciano.
      //    ⛔ Fino al 12/09/2026 si usciva prima di arrivare qui, e l'impegno
      //    restava finché non arrivava `orders/cancelled` (misurato, percorso 9).
      await this.reservations.releaseOrderReservationsTx(tx, {
        tenantId: event.tenantId,
        salesOrderId: event.salesOrderId,
        note: 'Righe ordine rimosse dal canale',
      });
      return;
    }

    await this.reservations.syncOrderReservationsTx(tx, {
      tenantId: event.tenantId,
      salesOrderId: event.salesOrderId,
      channel: event.channel,
      locationId,
      externalOrderRef: event.externalOrderId,
      lines: daImpegnare,
      righeDaConservare,
      righeDaRilasciare: daRilasciare,
    });
  }

  /** Per riga d'ordine: la quantità già uscita con spedizioni applicate. */
  private async quantitaSpeditePerRiga(
    tx: Prisma.TransactionClient,
    tenantId: string,
    salesOrderId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const righe = await tx.salesOrderShipmentLine.findMany({
      where: { tenantId, esito: ShipmentLineOutcome.scaricata, shipment: { salesOrderId } },
      select: { salesOrderLineId: true, quantity: true },
    });
    const esito = new Map<string, number>();
    for (const riga of righe) {
      esito.set(riga.salesOrderLineId, (esito.get(riga.salesOrderLineId) ?? 0) + riga.quantity);
    }
    return esito;
  }

  /** Annullamento pre-evasione (§5): stato + rilascio impegni, Giacenza invariata. */
  private async applyCancellationTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    await tx.salesOrder.updateMany({
      where: { id: event.salesOrderId, tenantId: event.tenantId, cancelledAt: null },
      data: { cancelledAt: event.occurredAt ?? new Date() },
    });

    await this.reservations.releaseOrderReservationsTx(tx, {
      tenantId: event.tenantId,
      salesOrderId: event.salesOrderId,
      note: 'Ordine annullato dal canale',
    });
  }

  /**
   * Evasione completa: registra stato/data/id sull'ordine e crea — nella
   * stessa transazione — la Vendita online con scarico e consumo impegni
   * (fase 2 §2–§4). Se una parte fallisce, l'intera
   * transazione (evento incluso) viene annullata: nessun saldo parziale.
   */
  private async applyFulfilledTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    await tx.salesOrder.updateMany({
      where: { id: event.salesOrderId, tenantId: event.tenantId, fulfilledAt: null },
      data: {
        fulfilledAt: event.occurredAt ?? new Date(),
        externalFulfillmentId: event.externalFulfillmentId ?? null,
      },
    });

    await this.onlineSales.createFromFulfilledOrderTx(tx, event);
  }
}
