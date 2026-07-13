import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReservationEventType,
  ReservationStatus,
  type SalesOrderSource,
  type StockReservation,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { applyCommittedDelta } from './committed-delta.util';

/** Riga ordine da impegnare (input canonico, indipendente dal canale). */
export interface ReservationLineInput {
  readonly salesOrderLineId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly externalLineRef?: string | null;
}

export interface SyncOrderReservationsParams {
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly channel: SalesOrderSource;
  readonly locationId: string;
  readonly externalOrderRef?: string | null;
  readonly lines: readonly ReservationLineInput[];
}

export interface ReleaseOrderReservationsParams {
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly note?: string;
}

/** Impegno attivo con riferimenti display (drill-down UI Impegnata). */
export type ActiveReservationWithRefs = StockReservation & {
  order: { orderNumber: string; source: SalesOrderSource; placedAt: Date };
  location: { name: string };
};

/**
 * Servizio di dominio della quantità Impegnata (fase 1 + fase 2).
 *
 * UNICO punto autorizzato a variare `committed` (e di conseguenza `available`)
 * su InventoryLevel: ogni variazione crea/aggiorna un impegno corrente
 * (`stock_reservations`) e lascia un evento verificabile
 * (`stock_reservation_events`). La Giacenza (`onHand`) non viene mai toccata
 * da un impegno: i movimenti fisici restano competenza dei movimenti di
 * magazzino. Il consumo dell'impegno (evasione → Vendita online, fase 2)
 * avviene con `consumeReservationTx` nella stessa transazione dello scarico.
 */
@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allinea gli impegni di un ordine alle sue righe correnti (idempotente):
   * crea gli impegni mancanti, aggiorna le quantità variate, rilascia gli
   * impegni delle righe rimosse. Da chiamare dentro la transazione
   * dell'evento canonico.
   */
  async syncOrderReservationsTx(
    tx: Prisma.TransactionClient,
    params: SyncOrderReservationsParams,
  ): Promise<void> {
    const existing = await tx.stockReservation.findMany({
      where: { tenantId: params.tenantId, salesOrderId: params.salesOrderId },
    });
    const existingByLineId = new Map(
      existing
        .filter((reservation) => reservation.salesOrderLineId !== null)
        .map((reservation) => [reservation.salesOrderLineId as string, reservation]),
    );

    const seenLineIds = new Set<string>();

    for (const line of params.lines) {
      if (line.quantity <= 0) {
        continue;
      }
      seenLineIds.add(line.salesOrderLineId);
      const current = existingByLineId.get(line.salesOrderLineId);

      if (!current) {
        await this.createReservationTx(tx, params, line);
        continue;
      }

      if (current.status === ReservationStatus.consumed) {
        // Impegno già consumato (fase 2): non si riapre da un update ordine.
        continue;
      }

      const currentRemaining =
        current.status === ReservationStatus.active ? current.remainingQuantity : 0;
      const delta = line.quantity - currentRemaining;
      if (delta === 0 && current.status === ReservationStatus.active) {
        continue;
      }

      await this.updateReservationTx(tx, params.tenantId, current, line, delta);
    }

    // Righe rimosse dal canale (o impegni orfani): rilascio, mai cancellazione.
    for (const reservation of existing) {
      const stillPresent =
        reservation.salesOrderLineId !== null && seenLineIds.has(reservation.salesOrderLineId);
      if (!stillPresent && reservation.status === ReservationStatus.active) {
        await this.releaseReservationTx(tx, reservation, 'Riga ordine rimossa dal canale');
      }
    }
  }

  /** Rilascia tutti gli impegni attivi di un ordine (annullamento §5). */
  async releaseOrderReservationsTx(
    tx: Prisma.TransactionClient,
    params: ReleaseOrderReservationsParams,
  ): Promise<void> {
    const active = await tx.stockReservation.findMany({
      where: {
        tenantId: params.tenantId,
        salesOrderId: params.salesOrderId,
        status: ReservationStatus.active,
      },
    });

    for (const reservation of active) {
      await this.releaseReservationTx(tx, reservation, params.note ?? 'Ordine annullato');
    }
  }

  /**
   * Consuma un impegno attivo (evasione → Vendita online, fase 2 §3):
   * status `consumed`, evento verificabile, Impegnata − residuo,
   * Disponibile + residuo. La Giacenza NON viene toccata qui: lo scarico
   * fisico è del movimento di magazzino creato dal chiamante nella stessa
   * transazione. Idempotente: un impegno già consumato/rilasciato è no-op.
   *
   * @returns quantità residua consumata (0 se l'impegno non era attivo).
   */
  async consumeReservationTx(
    tx: Prisma.TransactionClient,
    reservation: StockReservation,
    note: string,
  ): Promise<number> {
    // Guardia idempotente: consuma solo se ancora attivo (evento doppio ⇒ no-op).
    const result = await tx.stockReservation.updateMany({
      where: { id: reservation.id, status: ReservationStatus.active },
      data: { status: ReservationStatus.consumed, remainingQuantity: 0 },
    });
    if (result.count === 0) {
      return 0;
    }

    await tx.stockReservationEvent.create({
      data: {
        tenantId: reservation.tenantId,
        reservationId: reservation.id,
        type: ReservationEventType.consumed,
        quantityDelta: -reservation.remainingQuantity,
        remainingAfter: 0,
        note,
      },
    });

    await applyCommittedDelta(
      tx,
      reservation.tenantId,
      reservation.variantId,
      reservation.locationId,
      -reservation.remainingQuantity,
    );

    this.logger.debug(
      `Impegno consumato: ordine ${reservation.salesOrderId}, sku ${reservation.sku}, qta ${reservation.remainingQuantity}`,
    );

    return reservation.remainingQuantity;
  }

  /** Impegni attivi che compongono la Impegnata di una variante×location (UI §10). */
  listActiveForLevel(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ActiveReservationWithRefs[]> {
    return this.prisma.stockReservation.findMany({
      where: { tenantId, variantId, locationId, status: ReservationStatus.active },
      include: {
        order: { select: { orderNumber: true, source: true, placedAt: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async createReservationTx(
    tx: Prisma.TransactionClient,
    params: SyncOrderReservationsParams,
    line: ReservationLineInput,
  ): Promise<void> {
    const reservation = await tx.stockReservation.create({
      data: {
        tenantId: params.tenantId,
        locationId: params.locationId,
        variantId: line.variantId,
        channel: params.channel,
        salesOrderId: params.salesOrderId,
        salesOrderLineId: line.salesOrderLineId,
        sku: line.sku,
        quantity: line.quantity,
        remainingQuantity: line.quantity,
        status: ReservationStatus.active,
        externalOrderRef: params.externalOrderRef ?? null,
        externalLineRef: line.externalLineRef ?? null,
      },
    });

    await tx.stockReservationEvent.create({
      data: {
        tenantId: params.tenantId,
        reservationId: reservation.id,
        type: ReservationEventType.created,
        quantityDelta: line.quantity,
        remainingAfter: line.quantity,
      },
    });

    await applyCommittedDelta(
      tx,
      params.tenantId,
      line.variantId,
      params.locationId,
      line.quantity,
    );
  }

  private async updateReservationTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    current: StockReservation,
    line: ReservationLineInput,
    delta: number,
  ): Promise<void> {
    await tx.stockReservation.update({
      where: { id: current.id },
      data: {
        quantity: line.quantity,
        remainingQuantity: line.quantity,
        status: ReservationStatus.active,
        sku: line.sku,
      },
    });

    await tx.stockReservationEvent.create({
      data: {
        tenantId,
        reservationId: current.id,
        type: ReservationEventType.updated,
        quantityDelta: delta,
        remainingAfter: line.quantity,
      },
    });

    await applyCommittedDelta(tx, tenantId, current.variantId, current.locationId, delta);
  }

  private async releaseReservationTx(
    tx: Prisma.TransactionClient,
    reservation: StockReservation,
    note: string,
  ): Promise<void> {
    // Guardia idempotente: rilascia solo se ancora attivo (doppio rilascio ⇒ no-op).
    const result = await tx.stockReservation.updateMany({
      where: { id: reservation.id, status: ReservationStatus.active },
      data: { status: ReservationStatus.released, remainingQuantity: 0 },
    });
    if (result.count === 0) {
      return;
    }

    await tx.stockReservationEvent.create({
      data: {
        tenantId: reservation.tenantId,
        reservationId: reservation.id,
        type: ReservationEventType.released,
        quantityDelta: -reservation.remainingQuantity,
        remainingAfter: 0,
        note,
      },
    });

    await applyCommittedDelta(
      tx,
      reservation.tenantId,
      reservation.variantId,
      reservation.locationId,
      -reservation.remainingQuantity,
    );

    this.logger.debug(
      `Impegno rilasciato: ordine ${reservation.salesOrderId}, sku ${reservation.sku}, qta ${reservation.remainingQuantity}`,
    );
  }
}
