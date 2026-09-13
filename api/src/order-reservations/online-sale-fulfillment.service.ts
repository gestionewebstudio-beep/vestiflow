import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentType,
  MovementOrigin,
  OnlineSaleInventoryStatus,
  Prisma,
  ReservationStatus,
  SalesOrderSource,
  ShipmentLineOutcome,
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
 *
 * ⭐ **Le SPEDIZIONI, dal 12/09/2026** (decisione del proprietario): magazzino e
 *    rappresentazione commerciale sono due cose. Lo scarico fisico avviene
 *    all'acquisizione di OGNI `fulfillment` (`applyShipmentTx`): quanto è uscito,
 *    dalla sede da cui è uscito, con l'impegno consumato per quella quantità —
 *    anche a ordine incompleto, anche in più volte per la stessa riga. La
 *    Vendita online resta UNA per ordine a completamento e ADOTTA quei
 *    movimenti (ne aggiorna i riferimenti) invece di crearne altri. Il percorso
 *    «senza spedizioni» resta per i payload che non le portano.
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
    // quando l'evasione non esiste ancora e il payload può non portare alcuna
    // sede. ⛔ Fino al 12/09/2026 qui c’era un ripiego — la prima sede
    // licenziata in ORDINE ALFABETICO — tolto con B7: senza sede collegata
    // l’impegno non si prende e l’ordine resta segnalato.
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
    // ⭐ La sede di TESTATA è la sede di uscita se è UNA sola. Con spedizioni
    //    acquisite da sedi diverse resta VUOTA, per scelta: assegnare la prima
    //    direbbe che tutto è uscito da lì (proprietario, 13/09/2026). Senza
    //    spedizioni acquisite (payload senza `fulfillments[]`) vale la sede
    //    dell'evasione, poi quella dell'impegno, com'era.
    const sediDelleSpedizioni = [
      ...new Set(
        (
          await tx.salesOrderShipmentLine.findMany({
            where: {
              tenantId: event.tenantId,
              shipment: { salesOrderId: order.id },
              esito: ShipmentLineOutcome.scaricata,
              movement: { isNot: null },
            },
            select: { movement: { select: { locationId: true } } },
          })
        )
          .map((riga) => riga.movement?.locationId)
          .filter((sede): sede is string => Boolean(sede)),
      ),
    ];
    const headerLocationId =
      sediDelleSpedizioni.length > 0
        ? sediDelleSpedizioni.length === 1
          ? sediDelleSpedizioni[0]!
          : null
        : (fulfilmentLocationId ??
          computedLines.find((line) => line.reservation)?.reservation?.locationId ??
          null);

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

    // ── Scarico per riga ────────────────────────────────────────────────────
    // ⭐ Se l'ordine ha SPEDIZIONI acquisite, lo scarico è GIÀ avvenuto riga per
    //    riga, con la sua sede e il suo movimento: qui la Vendita online li
    //    adotta. Altrimenti (payload senza `fulfillments[]`): UN movimento per
    //    riga + consumo impegno, com'era (§3).
    const spedizioni = await tx.salesOrderShipmentLine.findMany({
      where: { tenantId: event.tenantId, shipment: { salesOrderId: order.id } },
      select: {
        salesOrderLineId: true,
        quantity: true,
        esito: true,
        stockMovementId: true,
        movement: { select: { locationId: true } },
      },
    });
    const conSpedizioni = spedizioni.length > 0;
    // L'impegno della riga, anche se GIÀ consumato dalle spedizioni: il
    // riferimento sulla riga di Vendita resta, com'era quando lo consumava lei.
    const impegnoDellaRiga = new Map(
      order.reservations
        .filter((r) => r.salesOrderLineId !== null)
        .map((r) => [r.salesOrderLineId as string, r.id]),
    );
    // Costo di record da congelare sulla vendita: costo effettivo corrente
    // delle varianti, in una sola query (§A).
    const costByVariant = await currentVariantCostMap(
      tx,
      event.tenantId,
      computedLines.flatMap((line) => (line.variantId ? [line.variantId] : [])),
    );
    let movedLines = 0;
    let stockLines = 0;
    let senzaSede = 0;
    const continua = event.acquisizione === 'continua';
    for (const line of computedLines) {
      const righeSpedite = conSpedizioni
        ? spedizioni.filter((riga) => riga.salesOrderLineId === line.salesOrderLineId)
        : [];
      const scaricate = righeSpedite.filter(
        (riga) => riga.esito === ShipmentLineOutcome.scaricata && riga.stockMovementId,
      );
      const sediDiUscita = [...new Set(scaricate.map((riga) => riga.movement?.locationId))].filter(
        (sede): sede is string => Boolean(sede),
      );
      // La sede della riga è quella dello scarico, non quella dell'impegno: la
      // sede di uscita se è una sola, poi quella dell'evasione di testata, poi
      // quella dell'impegno (com'era).
      const sedeRiga =
        (sediDiUscita.length === 1 ? sediDiUscita[0] : null) ??
        fulfilmentLocationId ??
        line.reservation?.locationId ??
        null;
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
          reservationId:
            line.reservation?.id ?? impegnoDellaRiga.get(line.salesOrderLineId) ?? null,
          locationId: sedeRiga,
        },
        select: { id: true },
      });

      if (conSpedizioni) {
        // L'adozione dei movimenti e i conteggi stanno in `adottaSpedizioniTx`,
        // che serve anche a una spedizione applicata DOPO la nascita della Vendita.
        continue;
      }
      if (!line.variantId || line.quantity <= 0) {
        continue;
      }
      stockLines += 1;

      const reservation = line.reservation;
      if (!line.variantId || (!reservation && !continua)) {
        // Nessun impegno da consumare (ordine storico dell’import massivo):
        // nessuno scarico silenzioso, la situazione viene segnalata sotto.
        continue;
      }
      if (!sedeRiga) {
        // ⛔ Nessuna sede determinabile: niente sede indovinata (B7). La riga
        //    resta segnalata sotto, non scaricata.
        senzaSede += 1;
        continue;
      }
      await this.scaricaTx(tx, {
        tenantId: event.tenantId,
        channel: event.channel,
        variantId: line.variantId,
        sku: line.sku,
        locationId: sedeRiga,
        quantity: line.quantity,
        reservation,
        unitCostMinor: costByVariant.get(line.variantId) ?? 0,
        reason: `Vendita online ${sale.reference} — ordine ${order.orderNumber}`,
        notaImpegno: `Consumato da Vendita online ${sale.reference}`,
        externalRef: event.externalOrderId,
        createdAt: fulfilledAt,
        source: {
          sourceDocumentType: DocumentType.online_sale,
          sourceDocumentId: sale.id,
          sourceLineId: createdLine.id,
        },
      });
      movedLines += 1;
    }

    if (conSpedizioni) {
      const adozione = await this.adottaSpedizioniTx(tx, event.tenantId, {
        id: sale.id,
        reference: sale.reference,
        orderNumber: order.orderNumber,
      });
      stockLines = adozione.stockLines;
      movedLines = adozione.movedLines;
      senzaSede = adozione.senzaSede;
    }

    const inventoryStatus = this.statoMagazzino({ stockLines, movedLines });

    await tx.onlineSale.update({
      where: { id: sale.id },
      data: { inventoryStatus },
    });

    if (senzaSede > 0) {
      await this.segnalaTx(tx, event.tenantId, order.id, [
        'Evasione senza sede determinabile: nessuno scarico eseguito. Collega la location Shopify a una sede e verifica la giacenza a mano.',
      ]);
    } else if (inventoryStatus === OnlineSaleInventoryStatus.partially_unloaded) {
      await this.segnalaTx(tx, event.tenantId, order.id, [
        'Vendita online con scarico parziale: alcune righe non sono state scaricate (nessun impegno attivo, o riga non risolta). Verificare la giacenza.',
      ]);
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
   * ⭐ Una SPEDIZIONE acquisita (`online_order_shipped`, 12/09/2026): per ogni
   *    riga, scarico dalla sede della spedizione e consumo dell'impegno per la
   *    quantità uscita; la parte non ancora spedita resta impegnata.
   *
   * ⭐ **Idempotente riga per riga**, non per evento: la riga di spedizione
   *    (`sales_order_shipment_lines`, unica per spedizione e riga d'ordine) è
   *    l'effetto. Una riga già `scaricata` non si tocca; una riga rimasta
   *    `senza_sede` si riprova alla prossima acquisizione — quando la location
   *    sarà collegata, lo stesso webhook o un recupero la applica.
   *
   * ⛔ Perché questo valga, l'evento NON deve restare registrato come applicato:
   *    la deduplicazione del ciclo di vita fermava lo stesso webhook (stessa
   *    chiave) prima di arrivare qui, e la riga restava `senza_sede` per sempre —
   *    misurato il 13/09/2026, percorso 23. Il ritorno `ripetibile` lo dice al
   *    ciclo di vita, che toglie la registrazione come già fa per il reso non
   *    applicato. `senza_variante` e `senza_impegno` NON sono ripetibili: sono
   *    decisioni, non attese.
   *
   * | Esito            | Quando                                                              |
   * | ---------------- | ------------------------------------------------------------------- |
   * | `scaricata`      | movimento creato, impegno consumato per la quantità                 |
   * | `senza_sede`     | location remota non collegata e nessun impegno da cui prenderla     |
   * | `senza_impegno`  | ordine storico (`massiva`/`pendenti`) senza impegno: nessuno scarico |
   * | `senza_variante` | riga non risolta (collegamento chiuso): niente scarico; l'impegno   |
   * |                  | preesistente si CHIUDE senza uscita, e l'ordine lo dice             |
   */
  async applyShipmentTx(
    tx: Prisma.TransactionClient,
    event: OnlineOrderEventInput,
  ): Promise<{ readonly ripetibile: boolean }> {
    const spedizione = event.spedizione;
    if (!spedizione) {
      return { ripetibile: false };
    }
    const order = await tx.salesOrder.findFirst({
      where: { id: event.salesOrderId, tenantId: event.tenantId },
      select: { id: true, orderNumber: true },
    });
    if (!order) {
      return { ripetibile: false };
    }
    const chiave = {
      tenantId: event.tenantId,
      salesOrderId: order.id,
      externalFulfillmentId: spedizione.externalFulfillmentId,
    };
    const testata =
      (await tx.salesOrderShipment.findUnique({
        where: { tenantId_salesOrderId_externalFulfillmentId: chiave },
        select: { id: true, locationId: true },
      })) ??
      (await tx.salesOrderShipment.create({
        data: {
          ...chiave,
          shopifyLocationId: spedizione.shopifyLocationId,
          locationId: spedizione.locationId,
          shippedAt: spedizione.shippedAt,
        },
        select: { id: true, locationId: true },
      }));
    if (!testata.locationId && spedizione.locationId) {
      // La location è stata collegata DOPO la prima acquisizione: si completa.
      await tx.salesOrderShipment.update({
        where: { id: testata.id },
        data: { locationId: spedizione.locationId },
      });
    }
    const sedeSpedizione = testata.locationId ?? spedizione.locationId;

    const esistenti = await tx.salesOrderShipmentLine.findMany({
      where: { shipmentId: testata.id },
      select: { id: true, salesOrderLineId: true, esito: true },
    });
    // ⭐ Ripetizione senza niente da fare (misurata il 12/09/2026): se ogni riga
    //    della spedizione è già `scaricata`, si esce qui — niente letture di
    //    impegni e costi, niente riadozione. Un webhook ripetuto costa due
    //    letture, zero scritture.
    const giaFatta = spedizione.righe.every(
      (riga) =>
        riga.quantity <= 0 ||
        esistenti.some(
          (e) =>
            e.salesOrderLineId === riga.salesOrderLineId &&
            e.esito === ShipmentLineOutcome.scaricata,
        ),
    );
    if (giaFatta) {
      return { ripetibile: false };
    }
    const impegni = await tx.stockReservation.findMany({
      where: { tenantId: event.tenantId, salesOrderId: order.id, status: ReservationStatus.active },
    });
    const costByVariant = await currentVariantCostMap(
      tx,
      event.tenantId,
      spedizione.righe.flatMap((riga) => (riga.variantId ? [riga.variantId] : [])),
    );
    const continua = event.acquisizione === 'continua';
    const motivi: string[] = [];
    let scaricateOra = 0;
    let righeSenzaSede = 0;

    for (const riga of spedizione.righe) {
      if (riga.quantity <= 0) {
        continue;
      }
      const esistente = esistenti.find((e) => e.salesOrderLineId === riga.salesOrderLineId);
      if (esistente?.esito === ShipmentLineOutcome.scaricata) {
        continue; // applicata una volta: non si ripete
      }
      const reservation = impegni.find((i) => i.salesOrderLineId === riga.salesOrderLineId) ?? null;

      let esito: ShipmentLineOutcome;
      let stockMovementId: string | null = null;
      if (!riga.variantId) {
        esito = ShipmentLineOutcome.senza_variante;
        if (reservation) {
          // ⭐ L'impegno PREESISTENTE segue il ciclo dell'ordine (`docs/24`
          //    §1.14.3): la merce è uscita, l'impegno si chiude — senza scarico,
          //    perché la variante non è più quella. Lo dice il motivo sull'ordine.
          await this.reservations.releaseReservationTx(
            tx,
            reservation,
            `Spedizione ${spedizione.externalFulfillmentId}: riga non risolta (collegamento chiuso), impegno chiuso senza scarico`,
          );
        }
        motivi.push(
          `Riga «${riga.sku}» spedita (${riga.quantity}) ma NON scaricata: variante non risolta (collegamento chiuso o articolo sconosciuto). Verifica la giacenza a mano.`,
        );
      } else if (!reservation && !continua) {
        esito = ShipmentLineOutcome.senza_impegno;
      } else {
        // ⛔ La sede è quella COMUNICATA dal canale, risolta dal collegamento
        //    esplicito. Se il canale l'ha detta e non è collegata, NON si
        //    ripiega sull'impegno: sarebbe attribuire l'uscita a un'altra sede.
        //    Il ripiego vale solo se il canale non ha detto nessuna sede
        //    (l'impegno sta sulla sede dell'ordine, anch'essa del canale).
        const sede = spedizione.shopifyLocationId
          ? sedeSpedizione
          : (sedeSpedizione ?? reservation?.locationId ?? null);
        if (!sede) {
          esito = ShipmentLineOutcome.senza_sede;
        } else {
          stockMovementId = await this.scaricaTx(tx, {
            tenantId: event.tenantId,
            channel: event.channel,
            variantId: riga.variantId,
            sku: riga.sku,
            locationId: sede,
            quantity: riga.quantity,
            reservation,
            unitCostMinor: costByVariant.get(riga.variantId) ?? 0,
            reason: `Spedizione ${spedizione.externalFulfillmentId} — ordine ${order.orderNumber}`,
            notaImpegno: `Consumato da spedizione ${spedizione.externalFulfillmentId}`,
            externalRef: event.externalOrderId,
            createdAt: spedizione.shippedAt,
            source: { sourceDocumentType: null, sourceDocumentId: null, sourceLineId: null },
          });
          esito = ShipmentLineOutcome.scaricata;
          scaricateOra += 1;
        }
      }

      const dati = {
        tenantId: event.tenantId,
        variantId: riga.variantId,
        sku: riga.sku,
        quantity: riga.quantity,
        esito,
        stockMovementId,
      };
      if (esistente) {
        await tx.salesOrderShipmentLine.update({ where: { id: esistente.id }, data: dati });
      } else {
        await tx.salesOrderShipmentLine.create({
          data: { ...dati, shipmentId: testata.id, salesOrderLineId: riga.salesOrderLineId },
        });
      }
      if (esito === ShipmentLineOutcome.senza_sede) {
        righeSenzaSede += 1;
        motivi.push(
          `Riga «${riga.sku}» spedita (${riga.quantity}) senza sede determinabile: nessuno scarico. Collega la location Shopify a una sede e verifica la giacenza a mano.`,
        );
      }
    }

    if (motivi.length > 0) {
      await this.segnalaTx(tx, event.tenantId, order.id, motivi);
    }
    const ripetibile = righeSenzaSede > 0;

    // ⭐ Spedizione applicata DOPO la nascita della Vendita (una riga rimasta
    //    senza sede, collegata poi): la Vendita la adotta adesso, e il suo stato
    //    di magazzino segue. Senza Vendita non c'è niente da adottare: lo farà
    //    lei quando nasce. E senza righe scaricate ADESSO non c'è niente di
    //    nuovo da adottare: riscrivere gli stessi riferimenti sarebbe una
    //    scrittura evitabile a ogni webhook.
    if (scaricateOra === 0) {
      return { ripetibile };
    }
    const vendita = await tx.onlineSale.findFirst({
      where: { tenantId: event.tenantId, salesOrderId: order.id },
      select: { id: true, reference: true },
    });
    if (vendita) {
      const adozione = await this.adottaSpedizioniTx(tx, event.tenantId, {
        id: vendita.id,
        reference: vendita.reference,
        orderNumber: order.orderNumber,
      });
      await tx.onlineSale.update({
        where: { id: vendita.id },
        data: { inventoryStatus: this.statoMagazzino(adozione) },
      });
    }
    return { ripetibile };
  }

  /**
   * ⭐ La Vendita ADOTTA i movimenti delle spedizioni (12/09/2026): per ogni sua
   *    riga, se OGNI riga di spedizione di quella riga d'ordine è `scaricata`
   *    (e almeno una c'è) la riga è coperta e i movimenti prendono i riferimenti
   *    della Vendita — UNO sulla riga di vendita, com'era; più d'uno sulla sola
   *    testata, perché «un movimento per riga di documento» resta. Idempotente:
   *    riscrive gli stessi riferimenti. Serve alla nascita della Vendita e a una
   *    spedizione applicata dopo.
   */
  private async adottaSpedizioniTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sale: { readonly id: string; readonly reference: string; readonly orderNumber: string },
  ): Promise<{ stockLines: number; movedLines: number; senzaSede: number }> {
    const righeVendita = await tx.onlineSaleLine.findMany({
      where: { tenantId, onlineSaleId: sale.id },
      select: { id: true, salesOrderLineId: true, variantId: true, quantity: true },
    });
    const spedizioni = await tx.salesOrderShipmentLine.findMany({
      where: {
        tenantId,
        salesOrderLineId: {
          in: righeVendita.flatMap((r) => (r.salesOrderLineId ? [r.salesOrderLineId] : [])),
        },
      },
      select: { salesOrderLineId: true, esito: true, stockMovementId: true },
      orderBy: { createdAt: 'asc' },
    });
    let stockLines = 0;
    let movedLines = 0;
    let senzaSede = 0;
    for (const riga of righeVendita) {
      const righeSpedite = spedizioni.filter((sp) => sp.salesOrderLineId === riga.salesOrderLineId);
      // Una riga NON risolta (collegamento chiuso) ma spedita è una riga di
      // magazzino non scaricata: conta, e la vendita lo dice. Una riga senza
      // variante e senza spedizione (articolo custom) no, com'era.
      const nonRisoltaMaSpedita = righeSpedite.some(
        (sp) => sp.esito === ShipmentLineOutcome.senza_variante,
      );
      if ((!riga.variantId && !nonRisoltaMaSpedita) || riga.quantity <= 0) {
        continue;
      }
      stockLines += 1;
      if (righeSpedite.some((sp) => sp.esito === ShipmentLineOutcome.senza_sede)) {
        senzaSede += 1;
      }
      const scaricate = righeSpedite.filter(
        (sp) => sp.esito === ShipmentLineOutcome.scaricata && sp.stockMovementId,
      );
      if (righeSpedite.length === 0 || scaricate.length !== righeSpedite.length) {
        continue;
      }
      for (const sp of scaricate) {
        await tx.stockMovement.update({
          where: { id: sp.stockMovementId! },
          data: {
            sourceDocumentType: DocumentType.online_sale,
            sourceDocumentId: sale.id,
            sourceLineId: scaricate.length === 1 ? riga.id : null,
            reason: `Vendita online ${sale.reference} — ordine ${sale.orderNumber}`,
          },
        });
      }
      movedLines += 1;
    }
    return { stockLines, movedLines, senzaSede };
  }

  /** Lo stato di magazzino della Vendita dai conteggi: la formula è una sola. */
  private statoMagazzino(conteggi: {
    readonly stockLines: number;
    readonly movedLines: number;
  }): OnlineSaleInventoryStatus {
    return conteggi.stockLines === 0 || conteggi.movedLines === 0
      ? OnlineSaleInventoryStatus.not_applied
      : conteggi.movedLines === conteggi.stockLines
        ? OnlineSaleInventoryStatus.unloaded
        : OnlineSaleInventoryStatus.partially_unloaded;
  }

  /**
   * Lo SCARICO di una riga: Giacenza −, Disponibile −, sulla sede indicata;
   * impegno consumato per la quantità (Impegnata −, Disponibile +); UN
   * movimento `online_sale`. Usato dalla spedizione e dal percorso senza
   * spedizioni: la decisione è una sola.
   *
   * @returns l'id del movimento creato
   */
  private async scaricaTx(
    tx: Prisma.TransactionClient,
    dati: {
      readonly tenantId: string;
      readonly channel: SalesOrderSource;
      readonly variantId: string;
      readonly sku: string;
      readonly locationId: string;
      readonly quantity: number;
      readonly reservation: StockReservation | null;
      readonly unitCostMinor: number;
      readonly reason: string;
      readonly notaImpegno: string;
      readonly externalRef: string;
      readonly createdAt: Date;
      readonly source: {
        readonly sourceDocumentType: DocumentType | null;
        readonly sourceDocumentId: string | null;
        readonly sourceLineId: string | null;
      };
    },
  ): Promise<string> {
    if (dati.reservation) {
      // 1. Consumo dell'impegno per la quantità uscita: Impegnata −, Disponibile +.
      //    Sulla sede DELL'IMPEGNO, sempre: è lì che era stato preso, e il
      //    consumo lo annulla. Se ne esce meno del residuo, il resto resta impegnato.
      await this.reservations.consumeReservationQuantityTx(
        tx,
        dati.reservation,
        dati.quantity,
        dati.notaImpegno,
      );
    }
    // 2. Scarico fisico: Giacenza −, Disponibile −, sulla sede da cui è uscita.
    //    Nessuna guardia di disponibilità: il canale ha già spedito la merce,
    //    bloccare qui creerebbe divergenza dal mondo fisico (oversell §3).
    await applyInventoryDelta(
      tx,
      dati.tenantId,
      dati.variantId,
      dati.locationId,
      -dati.quantity,
      'canale',
    );
    // 3. Il movimento. Costo corrente della variante, sempre un numero: una
    //    variante senza costo vale zero, e zero è un costo (`regole-gestionale`).
    const movimento = await tx.stockMovement.create({
      data: {
        tenantId: dati.tenantId,
        type: StockMovementType.online_sale,
        origin: this.movementOrigin(dati.channel),
        variantId: dati.variantId,
        sku: dati.sku,
        locationId: dati.locationId,
        quantity: dati.quantity,
        reason: dati.reason,
        externalRef: dati.externalRef,
        ...dati.source,
        unitCostMinor: dati.unitCostMinor,
        totalCostMinor: frozenTotalCostMinor(dati.unitCostMinor, dati.quantity),
        createdAt: dati.createdAt,
        createdByName: this.channelActorName(dati.channel),
      },
      select: { id: true },
    });
    return movimento.id;
  }

  /** «Da verificare» con i motivi, accodati a quelli già presenti. */
  private async segnalaTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    salesOrderId: string,
    motivi: readonly string[],
  ): Promise<void> {
    const ordine = await tx.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: { reviewReason: true },
    });
    const presenti = ordine?.reviewReason ? [ordine.reviewReason] : [];
    const nuovi = motivi.filter((m) => !presenti[0]?.includes(m));
    await tx.salesOrder.updateMany({
      where: { id: salesOrderId, tenantId },
      data: { requiresReview: true, reviewReason: [...presenti, ...nuovi].join(' · ') },
    });
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
  ): Promise<{ applicato: boolean }> {
    if (!event.lines || event.lines.length === 0) {
      this.logger.warn(
        `Evento restock senza righe per ordine ${event.externalOrderId}: nessun carico applicato.`,
      );
      return { applicato: true };
    }

    // ⛔ §30.8-bis (12/09/2026): la sede di rientro è SOLO quella dichiarata dal
    //    canale e collegata. Qui c'era `event.locationId ?? sale?.locationId`: il
    //    reso finiva nella sede di SPEDIZIONE, cioè una sede inventata. Senza sede
    //    non si carica niente, l'ordine resta «Da verificare» con il motivo, e
    //    l'evento non si registra: collegata la location, si riapplica.
    if (!event.locationId) {
      await tx.salesOrder.updateMany({
        where: { id: event.salesOrderId, tenantId: event.tenantId },
        data: {
          requiresReview: true,
          reviewReason:
            'Reso con reintegro: la sede di rientro indicata dal canale non è collegata a una sede VestiFlow (o manca). Nessun carico eseguito. Collegare la location in Impostazioni → Shopify e ripetere «Importa ordini».',
        },
      });
      return { applicato: false };
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
      const locationId = event.locationId;

      // Carico atomico: Giacenza +, Disponibile + (upsert livello incluso).
      await applyInventoryDelta(
        tx,
        event.tenantId,
        line.variantId,
        locationId,
        line.quantity,
        'canale',
      );

      // Il reso inverte la vendita: costo congelato sulla vendita online
      // originale (§③). Il fallback vale solo se quella vendita non esiste —
      // se esiste ed è costata zero, il reso rientra a zero.
      const unitCostMinor = await originalSaleUnitCostMinor(
        tx,
        event.tenantId,
        sale?.id ?? null,
        line.variantId,
        [StockMovementType.online_sale],
        costByVariant.get(line.variantId) ?? 0,
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
    return { applicato: true };
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
