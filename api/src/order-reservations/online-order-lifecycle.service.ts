import { Injectable, Logger } from '@nestjs/common';
import {
  OnlineOrderEventType,
  SalesOrderFulfillmentStatus,
  type Prisma,
  type SalesOrderSource,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { buildOnlineOrderDedupeKey } from './online-order-event.util';
import { OnlineSaleFulfillmentService } from './online-sale-fulfillment.service';
import {
  StockReservationService,
  type ReservationLineInput,
} from './stock-reservation.service';

/**
 * Evento canonico ordine online: prodotto dai connettori canale
 * (Shopify per primo), consumato dal dominio quantità. Il dominio non
 * conosce i payload del canale, solo questi dati normalizzati.
 */
export interface OnlineOrderEventInput {
  readonly tenantId: string;
  readonly channel: SalesOrderSource;
  readonly type: OnlineOrderEventType;
  readonly salesOrderId: string;
  readonly externalOrderId: string;
  /** Suffisso dedupe per eventi ripetibili (es. updated_at del canale). */
  readonly dedupeSuffix?: string;
  readonly occurredAt?: Date;
  /** Id evasione esterna (solo eventi fulfilled). */
  readonly externalFulfillmentId?: string | null;
  /** Location assegnata all'ordine (necessaria per gli impegni). */
  readonly locationId?: string | null;
  /** Righe da impegnare (solo eventi created/updated). */
  readonly lines?: readonly ReservationLineInput[];
}

export type OnlineOrderEventOutcome = 'applied' | 'duplicate';

/**
 * Ciclo di vita canonico degli ordini online (fase 1 §4–§9 + fase 2):
 * - created/updated → impegni allineati alle righe (Giacenza INVARIATA);
 * - cancelled → impegni rilasciati (nessun movimento fisico);
 * - fulfilled → Vendita online + movimenti `online_sale` + consumo impegni
 *   + Corrispettivo, in UN'UNICA transazione (fase 2 §2–§4);
 * - partially_fulfilled → ordine marcato "richiede verifica", NESSUNA
 *   Vendita online definitiva (fase 2 §10);
 * - refunded → stato economico + rettifica Corrispettivo, MAI carico
 *   automatico (fase 2 §7);
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
        case OnlineOrderEventType.online_order_partially_fulfilled:
          await this.applyPartialFulfilmentTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_refunded:
          await this.onlineSales.applyRefundAfterSaleTx(tx, event);
          break;
        case OnlineOrderEventType.online_order_restocked:
          await this.onlineSales.applyRestockAfterSaleTx(tx, event);
          break;
      }

      return 'applied';
    });
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
    if (!event.locationId || !event.lines || event.lines.length === 0) {
      return;
    }

    const order = await tx.salesOrder.findFirst({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      select: { cancelledAt: true, fulfilledAt: true, fulfillmentStatus: true },
    });
    if (
      !order ||
      order.cancelledAt !== null ||
      order.fulfilledAt !== null ||
      order.fulfillmentStatus !== SalesOrderFulfillmentStatus.unfulfilled
    ) {
      return;
    }

    await this.reservations.syncOrderReservationsTx(tx, {
      tenantId: event.tenantId,
      salesOrderId: event.salesOrderId,
      channel: event.channel,
      locationId: event.locationId,
      externalOrderRef: event.externalOrderId,
      lines: event.lines,
    });
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
   * stessa transazione — la Vendita online con scarico, consumo impegni e
   * Corrispettivo (fase 2 §2–§4). Se una parte fallisce, l'intera
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

  /** Evasione parziale (§7): fuori ambito fase 1 ⇒ richiede verifica, dati conservati. */
  private async applyPartialFulfilmentTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    await tx.salesOrder.updateMany({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      data: {
        requiresReview: true,
        reviewReason:
          'Evasione parziale rilevata dal canale: gestione non ancora supportata, verificare manualmente.',
      },
    });
  }
}
