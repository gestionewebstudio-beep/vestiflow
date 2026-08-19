import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentType,
  MovementOrigin,
  OnlineSaleInventoryStatus,
  Prisma,
  ReservationStatus,
  SalesOrderSource,
  StockMovementType,
  type Customer,
  type Party,
  type SalesOrder,
  type SalesOrderLine,
  type StockReservation,
} from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import {
  currentVariantCostMap,
  frozenTotalCostMinor,
  originalSaleUnitCostMinor,
} from '../inventory/movement-cost.util';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { findVatCodeForDerivedRate } from '../vat/vat-reverse-match.util';
import {
  buildUnmatchedRateSnapshot,
  buildVatCodeSnapshot,
  vatSnapshotRatePercent,
} from '../vat/vat-snapshot.util';

import { allocateProportional, deriveVatRatePercent } from './online-sale-money.util';
import { StockReservationService } from './stock-reservation.service';
import type { OnlineOrderEventInput } from './online-order-lifecycle.service';

/** Prefisso numerazione interna (coerente con document-defaults). */
const ONLINE_SALE_PREFIX = 'VO';

export type OnlineSaleCreationOutcome = 'created' | 'already_exists' | 'order_not_found';

type OrderWithContext = SalesOrder & {
  lines: SalesOrderLine[];
  customer: (Customer & { party: Party }) | null;
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
  /** Aliquota derivata dal canale (solo calcolo interno, non persistita: §7). */
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly salesOrderLineId: string;
  readonly reservation: StockReservation | null;
  /** Codice IVA riconosciuto per corrispondenza inversa con l'aliquota derivata dal canale. */
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.InputJsonObject | null;
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
      include: { lines: true, customer: { include: { party: true } }, reservations: true },
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
    const salesVatCodes = await this.loadSalesVatCodes(tx, event.tenantId);
    const computedLines = await this.computeSaleLines(tx, order, salesVatCodes);
    // ── La sede da cui la merce è USCITA ──────────────────────────────────
    //
    // È quella dell'EVASIONE, che il canale dichiara nel payload
    // (`fulfillments[].location_id`) e che arriva qui come `event.locationId`.
    // NON quella dell'impegno: l'impegno si prende alla CREAZIONE dell'ordine,
    // quando l'evasione non esiste ancora e il payload non porta alcuna sede,
    // quindi ricade su un ripiego — la prima sede licenziata in ORDINE
    // ALFABETICO (`resolveShopifyOrderLocationId`).
    //
    // Misurato il 14/08/2026 su tre ordini di prova: Shopify spediva da «Shop
    // location», VestiFlow scaricava da «Magazzino test 3» — prima per la M. Il
    // dato corretto era già nel payload al momento dello scarico, e veniva
    // scavalcato da quello inventato prima. Con una sede sola non si vede; con
    // quattro, ogni vendita online scala lo scaffale sbagliato per sempre.
    //
    // ⚠️ L'impegno resta consumato sulla SUA sede, e non è un'incoerenza: il
    // consumo (`applyCommittedDelta −q` su quella sede) è l'esatto inverso
    // della sua creazione, quindi il saldo netto lì è ZERO. L'unica scrittura
    // che sopravvive è lo scarico fisico, che va dove la merce era davvero.
    // Resta un errore TRANSITORIO sulla disponibilità della sede del ripiego,
    // fra creazione dell'ordine ed evasione: accettato, e chiuso quando
    // l'impegno saprà leggere le fulfillment orders di Shopify.
    const fulfilmentLocationId = event.locationId ?? null;
    const headerLocationId =
      fulfilmentLocationId ??
      computedLines.find((line) => line.reservation)?.reservation?.locationId ??
      null;

    const year = fulfilledAt.getFullYear();
    const saleNumber = await this.nextNumber(tx, event.tenantId, DocumentType.online_sale, year);

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
    // Costo di record da congelare sulla vendita: costo effettivo corrente
    // delle varianti, in una sola query (§A).
    const costByVariant = await currentVariantCostMap(
      tx,
      event.tenantId,
      computedLines.flatMap((line) => (line.variantId ? [line.variantId] : [])),
    );
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
          taxMinor: line.taxMinor,
          totalMinor: line.totalMinor,
          vatCodeId: line.vatCodeId,
          vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
          salesOrderLineId: line.salesOrderLineId,
          reservationId: line.reservation?.id ?? null,
          // La sede della riga è quella dello scarico, non quella dell'impegno.
          locationId: fulfilmentLocationId ?? line.reservation?.locationId ?? null,
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
      //    Sulla sede DELL'IMPEGNO, sempre: è lì che era stato preso, e il
      //    consumo lo annulla. Vedi la nota su `fulfilmentLocationId`.
      await this.reservations.consumeReservationTx(
        tx,
        reservation,
        `Consumato da Vendita online ${sale.reference}`,
      );

      // 2. Scarico fisico: Giacenza −, Disponibile −, sulla sede dell'EVASIONE.
      //    Nessuna guardia di disponibilità: il canale ha già spedito la merce,
      //    bloccare qui creerebbe divergenza dal mondo fisico (oversell §3).
      const unloadLocationId = fulfilmentLocationId ?? reservation.locationId;
      await applyInventoryDelta(
        tx,
        event.tenantId,
        line.variantId,
        unloadLocationId,
        -line.quantity,
      );

      // 3. Movimento collegato a vendita, riga e ordine. UNIQUE
      //    (sourceDocumentType, sourceLineId) ⇒ al massimo UN movimento per riga.
      const unitCostMinor = costByVariant.get(line.variantId) ?? null;
      await tx.stockMovement.create({
        data: {
          tenantId: event.tenantId,
          type: StockMovementType.online_sale,
          origin: this.movementOrigin(event.channel),
          variantId: line.variantId,
          sku: line.sku,
          locationId: unloadLocationId,
          quantity: line.quantity,
          reason: `Vendita online ${sale.reference} — ordine ${order.orderNumber}`,
          externalRef: event.externalOrderId,
          sourceDocumentType: DocumentType.online_sale,
          sourceDocumentId: sale.id,
          sourceLineId: createdLine.id,
          unitCostMinor,
          totalCostMinor: frozenTotalCostMinor(unitCostMinor, line.quantity),
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

    // ── Nessuna voce di corrispettivo ─────────────────────────────────────
    //
    // Qui nasceva una `CorrispettivoEntry` con il suo numero COR-… Non nasce
    // più: il registro corrispettivi è **derivato** dalle vendite e dalle
    // rettifiche (decisione dell'11/08, specifica `08` §10), e una tabella
    // parallela che nessuno legge può solo divergere da esse.
    //
    // Smettere di scriverla chiude anche il difetto `01` §3.12: ogni voce
    // nuova poteva contenere un'aliquota media inventata sugli ordini
    // multi-aliquota. Da adesso nessuna nuova ne nasce.
    //
    // La tabella **resta**, e le righe già scritte con lei: il database è
    // condiviso e l'eliminazione è distruttiva, quindi va in un rilascio a sé.

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

    // La voce di corrispettivo non si aggiorna più, perché non nasce più: la
    // rettifica economica vive in `sales_order_refunds` (§4) e il registro la
    // sottrae alla sua data. `refundedAt` sulla Vendita online resta, ed è
    // l'informazione utile — dice che quella vendita ha avuto un rimborso.

    await tx.salesOrder.updateMany({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      data: {
        requiresReview: true,
        // Chiede di verificare ciò che resta da fare — la rettifica fiscale —
        // non il rientro della merce, che il canale può aver già applicato da
        // sé come movimento (vedi la nota sopra).
        reviewReason: `Rimborso ricevuto dopo la Vendita online ${sale.reference}: verificare la rettifica del corrispettivo. Il rientro della merce, se dichiarato dal canale, arriva come movimento collegato.`,
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
    // Fallback per il costo del reso quando la vendita originale non è
    // collegata o non porta il costo: costo effettivo corrente delle varianti.
    const costByVariant = await currentVariantCostMap(
      tx,
      event.tenantId,
      event.lines.flatMap((line) => (line.variantId ? [line.variantId] : [])),
    );

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

      // Il reso inverte la vendita: costo congelato sulla vendita online
      // originale (§③), fallback al costo variante corrente.
      const unitCostMinor = await originalSaleUnitCostMinor(
        tx,
        event.tenantId,
        sale?.id ?? null,
        line.variantId,
        [StockMovementType.online_sale],
        costByVariant.get(line.variantId) ?? null,
      );
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
          unitCostMinor,
          totalCostMinor: frozenTotalCostMinor(unitCostMinor, line.quantity),
          createdAt: occurredAt,
          createdByName: this.channelActorName(event.channel),
        },
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Codici IVA attivi vendita/entrambi del tenant, per la corrispondenza
   * inversa con l'aliquota derivata dal canale (§Piano IVA fase 2, punto 3).
   */
  private async loadSalesVatCodes(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<VatCodeWithNature[]> {
    return tx.vatCode.findMany({
      where: { tenantId, deletedAt: null, isActive: true, usageScope: { in: ['sales', 'both'] } },
      include: { nature: true },
    });
  }

  /** Risolve Codice IVA + snapshot per un'aliquota derivata da dati reali del canale. */
  private resolveDerivedVat(
    ratePercent: number | null,
    salesVatCodes: readonly VatCodeWithNature[],
  ): { vatCodeId: string | null; vatSnapshot: Prisma.InputJsonObject | null } {
    if (ratePercent == null) {
      return { vatCodeId: null, vatSnapshot: null };
    }
    const matched = findVatCodeForDerivedRate(ratePercent, salesVatCodes);
    return {
      vatCodeId: matched?.id ?? null,
      vatSnapshot: matched
        ? buildVatCodeSnapshot(matched)
        : buildUnmatchedRateSnapshot(ratePercent),
    };
  }

  /** Snapshot righe vendita con allocazione proporzionale dell'IVA ordine. */
  private async computeSaleLines(
    tx: Prisma.TransactionClient,
    order: OrderWithContext,
    salesVatCodes: readonly VatCodeWithNature[],
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
    const barcodeByVariantId = new Map(variants.map((variant) => [variant.id, variant.barcode]));

    const reservationByLineId = new Map(
      order.reservations
        .filter(
          (reservation) =>
            reservation.salesOrderLineId !== null &&
            reservation.status === ReservationStatus.active,
        )
        .map((reservation) => [reservation.salesOrderLineId as string, reservation]),
    );

    // ⚠️ L'IVA di riga si prende da quella che il CANALE ha dichiarato, quando
    // c'è: `lineVatTotalMinor` e lo snapshot dell'aliquota, scritti all'import
    // leggendo `tax_lines`.
    //
    // Prima si ripartiva sempre l'imposta dell'ordine in proporzione al valore
    // della riga. Su un ordine a una sola aliquota coincide col vero; con due
    // aliquote ogni riga risulta sbagliata mentre il totale continua a tornare
    // — e il totale che torna è ciò che ha reso il difetto invisibile per mesi
    // (registro difetti 3.12, misurato: 6,22 € su una riga la cui imposta vera
    // è 2,31 €).
    //
    // La ripartizione resta **solo come ripiego** per le righe che il canale
    // non ha dichiarato: ordini importati prima di questa correzione, o righe
    // manuali. Peggio di così non fa, e non riscrive il passato.
    const declaredVat = lines.some((line) => line.vatSnapshot != null);
    const weights = lines.map((line) => line.totalMinor);
    if (order.shippingMinor > 0) {
      weights.push(order.shippingMinor);
    }
    const taxShares = declaredVat ? [] : allocateProportional(order.taxMinor, weights);

    return lines.map((line, index) => {
      const taxMinor = declaredVat ? line.lineVatTotalMinor : (taxShares[index] ?? 0);
      const subtotalMinor = line.totalMinor - taxMinor;
      const declaredRate = vatSnapshotRatePercent(line.vatSnapshot);
      const vatRatePercent = declaredRate ?? deriveVatRatePercent(subtotalMinor, taxMinor);
      const { vatCodeId, vatSnapshot } = this.resolveDerivedVat(vatRatePercent, salesVatCodes);
      return {
        lineNumber: index + 1,
        variantId: line.variantId,
        sku: line.sku,
        barcode: line.variantId ? (barcodeByVariantId.get(line.variantId) ?? null) : null,
        description: line.title,
        quantity: line.quantity,
        // Prezzo unitario a sei decimali dal 16/08: `Number` conserva la coda,
        // e la riga documento la ospita (anche lì la colonna è numeric(16,6)).
        unitPriceMinor: Number(line.unitPriceMinor),
        subtotalMinor,
        vatRatePercent,
        taxMinor,
        totalMinor: line.totalMinor,
        salesOrderLineId: line.id,
        reservation: reservationByLineId.get(line.id) ?? null,
        vatCodeId,
        vatSnapshot,
      };
    });
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

  private formatCustomerAddress(customer: (Customer & { party: Party }) | null): string | null {
    if (!customer) {
      return null;
    }
    const parts = [
      customer.party.addressLine1,
      customer.party.addressLine2,
      [customer.party.postalCode, customer.party.city, customer.party.province]
        .filter((value) => value && value.trim() !== '')
        .join(' '),
      customer.party.countryCode,
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
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
}
