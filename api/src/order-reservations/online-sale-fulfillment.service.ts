import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentType,
  MovementOrigin,
  OnlineSaleInventoryStatus,
  ReservationStatus,
  SalesOrderSource,
  StockMovementType,
  CorrispettivoStatus,
  type Customer,
  type Prisma,
  type SalesOrder,
  type SalesOrderLine,
  type StockReservation,
} from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';

import { allocateProportional, deriveVatRatePercent } from './online-sale-money.util';
import { StockReservationService } from './stock-reservation.service';
import type { OnlineOrderEventInput } from './online-order-lifecycle.service';

/** Prefissi numerazione interna (coerenti con document-defaults). */
const ONLINE_SALE_PREFIX = 'VO';
const CORRISPETTIVO_PREFIX = 'COR';

export type OnlineSaleCreationOutcome = 'created' | 'already_exists' | 'order_not_found';

type OrderWithContext = SalesOrder & {
  lines: SalesOrderLine[];
  customer: Customer | null;
  reservations: StockReservation[];
};

interface ComputedSaleLine {
  readonly lineNumber: number;
  readonly variantId: string | null;
  readonly sku: string;
  readonly barcode: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly subtotalMinor: number;
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly salesOrderLineId: string;
  readonly reservation: StockReservation | null;
}

/**
 * Fase 2 §2–§4: alla ricezione dell'evento canonico `online_order_fulfilled`
 * crea — in UN'UNICA transazione (quella dell'evento, già idempotente) —:
 *
 * 1. il documento interno "Vendita online" (snapshot ordine all'evasione);
 * 2. un movimento negativo `online_sale` PER RIGA (Giacenza −);
 * 3. il consumo dell'impegno collegato (Impegnata −, Disponibile invariata);
 * 4. la registrazione interna nel Registro Corrispettivi.
 *
 * Il Corrispettivo NON è la causa tecnica dello scarico: lo scarico dipende
 * solo dalla Vendita online e dai suoi movimenti. Multicanale: il canale è
 * un dato (`channel`), mai logica hardcoded.
 *
 * Ordini storici importati già evasi (nessun impegno attivo): la Vendita
 * online e il Corrispettivo vengono comunque registrati, ma SENZA effetti
 * di magazzino (`inventoryStatus = not_applied`): la giacenza reale è già
 * allineata dal canale, uno scarico retroattivo la corromperebbe.
 */
@Injectable()
export class OnlineSaleFulfillmentService {
  private readonly logger = new Logger(OnlineSaleFulfillmentService.name);

  constructor(private readonly reservations: StockReservationService) {}

  /** Crea Vendita online + movimenti + consumo impegni + Corrispettivo. */
  async createFromFulfilledOrderTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<OnlineSaleCreationOutcome> {
    const order = (await tx.salesOrder.findFirst({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      include: { lines: true, customer: true, reservations: true },
    })) as OrderWithContext | null;
    if (!order) {
      return 'order_not_found';
    }

    const existing = await tx.onlineSale.findFirst({
      where: { tenantId: event.tenantId, salesOrderId: order.id },
      select: { id: true, externalFulfillmentId: true },
    });
    if (existing) {
      // §6: evento ricevuto di nuovo ⇒ solo dati non economici, nessun
      // nuovo effetto di magazzino, nessun secondo Corrispettivo.
      if (event.externalFulfillmentId && !existing.externalFulfillmentId) {
        await tx.onlineSale.update({
          where: { id: existing.id },
          data: { externalFulfillmentId: event.externalFulfillmentId },
        });
      }
      return 'already_exists';
    }

    const fulfilledAt = event.occurredAt ?? new Date();
    const computedLines = await this.computeSaleLines(tx, order);
    const headerLocationId =
      computedLines.find((line) => line.reservation)?.reservation?.locationId ??
      event.locationId ??
      null;

    const year = fulfilledAt.getFullYear();
    const saleNumber = await this.nextNumber(
      tx,
      event.tenantId,
      DocumentType.online_sale,
      year,
    );

    const sale = await tx.onlineSale.create({
      data: {
        tenantId: event.tenantId,
        series: 'A',
        number: saleNumber,
        year,
        reference: this.formatReference(ONLINE_SALE_PREFIX, year, saleNumber),
        channel: event.channel,
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        externalOrderId: event.externalOrderId,
        externalFulfillmentId: event.externalFulfillmentId ?? null,
        dedupeKey: this.buildSaleDedupeKey(event),
        orderPlacedAt: order.placedAt,
        fulfilledAt,
        customerId: order.customerId,
        customerName: order.customerName,
        customerAddress: this.formatCustomerAddress(order.customer),
        locationId: headerLocationId,
        paymentStatus: order.financialStatus,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        // Aggiornato sotto una volta noto l'esito degli scarichi per riga.
        inventoryStatus: OnlineSaleInventoryStatus.not_applied,
      },
      select: { id: true, reference: true },
    });

    // ── Scarico per riga: UN movimento per riga + consumo impegno (§3) ──────
    let movedLines = 0;
    let stockLines = 0;
    for (const line of computedLines) {
      const createdLine = await tx.onlineSaleLine.create({
        data: {
          tenantId: event.tenantId,
          onlineSaleId: sale.id,
          lineNumber: line.lineNumber,
          variantId: line.variantId,
          sku: line.sku,
          barcode: line.barcode,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          subtotalMinor: line.subtotalMinor,
          vatRatePercent: line.vatRatePercent,
          taxMinor: line.taxMinor,
          totalMinor: line.totalMinor,
          salesOrderLineId: line.salesOrderLineId,
          reservationId: line.reservation?.id ?? null,
          locationId: line.reservation?.locationId ?? null,
        },
        select: { id: true },
      });

      if (!line.variantId || line.quantity <= 0) {
        continue;
      }
      stockLines += 1;

      const reservation = line.reservation;
      if (!reservation) {
        // Nessun impegno da consumare (ordine storico/anomalia): nessuno
        // scarico silenzioso, la situazione viene segnalata sotto.
        continue;
      }

      // 1. Consumo dell'impegno: Impegnata −, Disponibile + (traccia evento).
      await this.reservations.consumeReservationTx(
        tx,
        reservation,
        `Consumato da Vendita online ${sale.reference}`,
      );

      // 2. Scarico fisico: Giacenza −, Disponibile −. Nessuna guardia di
      //    disponibilità: il canale ha già spedito la merce, bloccare qui
      //    creerebbe divergenza dal mondo fisico (oversell accettato §3).
      await applyInventoryDelta(
        tx,
        event.tenantId,
        line.variantId,
        reservation.locationId,
        -line.quantity,
      );

      // 3. Movimento collegato a vendita, riga e ordine. UNIQUE
      //    (sourceDocumentType, sourceLineId) ⇒ al massimo UN movimento per riga.
      await tx.stockMovement.create({
        data: {
          tenantId: event.tenantId,
          type: StockMovementType.online_sale,
          origin: this.movementOrigin(event.channel),
          variantId: line.variantId,
          sku: line.sku,
          locationId: reservation.locationId,
          quantity: line.quantity,
          reason: `Vendita online ${sale.reference} — ordine ${order.orderNumber}`,
          externalRef: event.externalOrderId,
          sourceDocumentType: DocumentType.online_sale,
          sourceDocumentId: sale.id,
          sourceLineId: createdLine.id,
          createdAt: fulfilledAt,
          createdByName: this.channelActorName(event.channel),
        },
      });
      movedLines += 1;
    }

    const inventoryStatus =
      stockLines === 0 || movedLines === 0
        ? OnlineSaleInventoryStatus.not_applied
        : movedLines === stockLines
          ? OnlineSaleInventoryStatus.unloaded
          : OnlineSaleInventoryStatus.partially_unloaded;

    await tx.onlineSale.update({
      where: { id: sale.id },
      data: { inventoryStatus },
    });

    if (inventoryStatus === OnlineSaleInventoryStatus.partially_unloaded) {
      await tx.salesOrder.updateMany({
        where: { id: order.id, tenantId: event.tenantId },
        data: {
          requiresReview: true,
          reviewReason:
            'Vendita online con scarico parziale: alcune righe non avevano un impegno attivo da consumare. Verificare la giacenza.',
        },
      });
    }

    // ── Corrispettivo collegato (§4): stessa transazione, oggetto distinto ──
    await this.createCorrispettivoTx(tx, {
      tenantId: event.tenantId,
      channel: event.channel,
      onlineSaleId: sale.id,
      salesOrderId: order.id,
      fulfilledAt,
      order,
      lines: computedLines,
    });

    this.logger.log(
      `Vendita online ${sale.reference} creata per ordine ${order.orderNumber} (${movedLines}/${stockLines} righe scaricate).`,
    );

    return 'created';
  }

  /**
   * Rimborso DOPO la Vendita online (§7): nessuna cancellazione, nessun
   * carico automatico. Aggiorna lo stato economico, segnala la situazione
   * e predispone la rettifica del Corrispettivo.
   */
  async applyRefundAfterSaleTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    const sale = await tx.onlineSale.findFirst({
      where: { tenantId: event.tenantId, salesOrderId: event.salesOrderId },
      select: { id: true, refundedAt: true, reference: true },
    });
    if (!sale) {
      // Rimborso prima dell'evasione: nessuna vendita da rettificare
      // (lo stato economico dell'ordine è già aggiornato dal connettore).
      return;
    }

    const refundedAt = event.occurredAt ?? new Date();
    if (!sale.refundedAt) {
      await tx.onlineSale.update({
        where: { id: sale.id },
        data: { refundedAt },
      });
    }

    await tx.corrispettivoEntry.updateMany({
      where: {
        tenantId: event.tenantId,
        onlineSaleId: sale.id,
        status: { in: [CorrispettivoStatus.to_verify, CorrispettivoStatus.included] },
      },
      data: {
        status: CorrispettivoStatus.refunded,
        refundedAt,
        adjustmentNote:
          'Rimborso comunicato dal canale dopo la Vendita online: predisporre la rettifica del corrispettivo. La giacenza NON è stata modificata (il rientro fisico richiede un evento di reso reale).',
      },
    });

    await tx.salesOrder.updateMany({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      data: {
        requiresReview: true,
        reviewReason: `Rimborso ricevuto dopo la Vendita online ${sale.reference}: verificare la rettifica del corrispettivo e l'eventuale rientro fisico della merce.`,
      },
    });
  }

  /**
   * Restock reale (§8): evento validato di rientro fisico. Crea un movimento
   * POSITIVO collegato alla Vendita online e all'ordine, aumenta la Giacenza
   * e la Disponibile. Traccia distinta dal rimborso economico: il solo stato
   * "rimborsato" NON genera mai questo carico.
   */
  async applyRestockAfterSaleTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<void> {
    if (!event.lines || event.lines.length === 0) {
      this.logger.warn(
        `Evento restock senza righe per ordine ${event.externalOrderId}: nessun carico applicato.`,
      );
      return;
    }

    const sale = await tx.onlineSale.findFirst({
      where: { tenantId: event.tenantId, salesOrderId: event.salesOrderId },
      select: { id: true, reference: true, orderNumber: true, locationId: true },
    });

    const occurredAt = event.occurredAt ?? new Date();

    for (const line of event.lines) {
      if (line.quantity <= 0 || !line.variantId) {
        continue;
      }
      const locationId = event.locationId ?? sale?.locationId ?? null;
      if (!locationId) {
        this.logger.warn(
          `Restock senza location per ordine ${event.externalOrderId} (sku ${line.sku}): riga saltata.`,
        );
        continue;
      }

      // Carico atomico: Giacenza +, Disponibile + (upsert livello incluso).
      await applyInventoryDelta(tx, event.tenantId, line.variantId, locationId, line.quantity);

      await tx.stockMovement.create({
        data: {
          tenantId: event.tenantId,
          type: StockMovementType.return,
          origin: this.movementOrigin(event.channel),
          variantId: line.variantId,
          sku: line.sku,
          locationId,
          quantity: line.quantity,
          reason: sale
            ? `Reso reale — Vendita online ${sale.reference} (ordine ${sale.orderNumber})`
            : `Reso reale — ordine ${event.externalOrderId}`,
          externalRef: event.externalOrderId,
          sourceDocumentType: sale ? DocumentType.online_sale : null,
          sourceDocumentId: sale?.id ?? null,
          createdAt: occurredAt,
          createdByName: this.channelActorName(event.channel),
        },
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Snapshot righe vendita con allocazione proporzionale dell'IVA ordine. */
  private async computeSaleLines(
    tx: Prisma.TransactionClient,
    order: OrderWithContext,
  ): Promise<ComputedSaleLine[]> {
    const lines = order.lines.filter((line) => line.quantity > 0);

    const variantIds = [
      ...new Set(lines.flatMap((line) => (line.variantId ? [line.variantId] : []))),
    ];
    const variants =
      variantIds.length > 0
        ? await tx.productVariant.findMany({
            where: { id: { in: variantIds }, tenantId: order.tenantId },
            select: { id: true, barcode: true },
          })
        : [];
    const barcodeByVariantId = new Map(
      variants.map((variant) => [variant.id, variant.barcode]),
    );

    const reservationByLineId = new Map(
      order.reservations
        .filter(
          (reservation) =>
            reservation.salesOrderLineId !== null &&
            reservation.status === ReservationStatus.active,
        )
        .map((reservation) => [reservation.salesOrderLineId as string, reservation]),
    );

    // IVA ordine allocata su righe prodotto + spedizione (peso = totale riga);
    // il canale non fornisce il dettaglio per riga nel read-model attuale.
    const weights = lines.map((line) => line.totalMinor);
    if (order.shippingMinor > 0) {
      weights.push(order.shippingMinor);
    }
    const taxShares = allocateProportional(order.taxMinor, weights);

    return lines.map((line, index) => {
      const taxMinor = taxShares[index] ?? 0;
      const subtotalMinor = line.totalMinor - taxMinor;
      return {
        lineNumber: index + 1,
        variantId: line.variantId,
        sku: line.sku,
        barcode: line.variantId
          ? (barcodeByVariantId.get(line.variantId) ?? null)
          : null,
        description: line.title,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        subtotalMinor,
        vatRatePercent: deriveVatRatePercent(subtotalMinor, taxMinor),
        taxMinor,
        totalMinor: line.totalMinor,
        salesOrderLineId: line.id,
        reservation: reservationByLineId.get(line.id) ?? null,
      };
    });
  }

  private async createCorrispettivoTx(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      readonly channel: SalesOrderSource;
      readonly onlineSaleId: string;
      readonly salesOrderId: string;
      readonly fulfilledAt: Date;
      readonly order: OrderWithContext;
      readonly lines: readonly ComputedSaleLine[];
    },
  ): Promise<void> {
    const year = params.fulfilledAt.getFullYear();
    const number = await this.nextNumber(
      tx,
      params.tenantId,
      DocumentType.corrispettivo,
      year,
    );

    // §5: la data fiscale è PROPOSTA dalla data evasione ma resta un campo
    // distinto, modificabile dagli utenti autorizzati via registro.
    const fiscalDate = this.dateOnly(params.fulfilledAt);

    const entry = await tx.corrispettivoEntry.create({
      data: {
        tenantId: params.tenantId,
        series: 'A',
        number,
        year,
        reference: this.formatReference(CORRISPETTIVO_PREFIX, year, number),
        onlineSaleId: params.onlineSaleId,
        salesOrderId: params.salesOrderId,
        channel: params.channel,
        operationalDate: params.fulfilledAt,
        fiscalDate,
        subtotalMinor: params.order.subtotalMinor,
        taxMinor: params.order.taxMinor,
        totalMinor: params.order.totalMinor,
        discountMinor: params.order.discountMinor,
        shippingMinor: params.order.shippingMinor,
        status: CorrispettivoStatus.to_verify,
      },
      select: { id: true },
    });

    const shippingTax =
      params.order.taxMinor -
      params.lines.reduce((acc, line) => acc + line.taxMinor, 0);

    const lineRows = params.lines.map((line) => ({
      tenantId: params.tenantId,
      entryId: entry.id,
      lineNumber: line.lineNumber,
      isShipping: false,
      description: line.description,
      quantity: line.quantity,
      subtotalMinor: line.subtotalMinor,
      vatRatePercent: line.vatRatePercent,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
    }));

    if (params.order.shippingMinor > 0) {
      const shippingSubtotal = params.order.shippingMinor - shippingTax;
      lineRows.push({
        tenantId: params.tenantId,
        entryId: entry.id,
        lineNumber: lineRows.length + 1,
        isShipping: true,
        description: 'Spedizione',
        quantity: 1,
        subtotalMinor: shippingSubtotal,
        vatRatePercent: deriveVatRatePercent(shippingSubtotal, shippingTax),
        taxMinor: shippingTax,
        totalMinor: params.order.shippingMinor,
      });
    }

    if (lineRows.length > 0) {
      await tx.corrispettivoEntryLine.createMany({ data: lineRows });
    }
  }

  /** Chiave idempotenza vendita (§6): tenant scoping è nell'indice univoco. */
  private buildSaleDedupeKey(event: OnlineOrderEventInput): string {
    return [
      event.channel,
      event.externalOrderId,
      event.externalFulfillmentId ?? 'no-fulfillment-id',
      'online_order_fulfilled',
    ].join(':');
  }

  private movementOrigin(channel: SalesOrderSource): MovementOrigin {
    switch (channel) {
      case SalesOrderSource.shopify_online:
      case SalesOrderSource.shopify_pos:
        return MovementOrigin.shopify;
      default:
        return MovementOrigin.vestiflow_online;
    }
  }

  private channelActorName(channel: SalesOrderSource): string {
    switch (channel) {
      case SalesOrderSource.shopify_online:
      case SalesOrderSource.shopify_pos:
        return 'Shopify';
      default:
        return 'Sistema';
    }
  }

  private formatCustomerAddress(customer: Customer | null): string | null {
    if (!customer) {
      return null;
    }
    const parts = [
      customer.addressLine1,
      customer.addressLine2,
      [customer.postalCode, customer.city, customer.province]
        .filter((value) => value && value.trim() !== '')
        .join(' '),
      customer.countryCode,
    ].filter((value) => value && value.trim() !== '');
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /** Numeratore atomico condiviso con il dominio documentale (§2.3). */
  private async nextNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: DocumentType,
    year: number,
  ): Promise<number> {
    const sequence = await tx.documentSequence.upsert({
      where: { tenantId_type_series_year: { tenantId, type, series: 'A', year } },
      create: { tenantId, type, series: 'A', year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return sequence.lastNumber;
  }

  private formatReference(prefix: string, year: number, number: number): string {
    return `${prefix}-${year}-${String(number).padStart(4, '0')}`;
  }

  private dateOnly(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
}
