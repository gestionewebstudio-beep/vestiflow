import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReservationEventType,
  ReservationStatus,
  type SalesOrderSource,
  type StockReservation,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { assertLocationReadableInUserScope } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { applyCommittedDelta } from './committed-delta.util';
import { origineDaCanaleOrdine } from '../inventory/inventory-level-delta.util';

/**
 * Nota dell'evento di aggiornamento: dice CHE COSA è cambiato, perché su un
 * cambio di combinazione il solo `quantityDelta` non basta a ricostruire dove
 * l'Impegnata si è spostata.
 */
function describeReservationChange(
  variantChanged: boolean,
  locationChanged: boolean,
): string | undefined {
  if (variantChanged && locationChanged) {
    return "Cambio articolo e location dell'ordine";
  }
  if (variantChanged) {
    return 'Cambio articolo della riga';
  }
  if (locationChanged) {
    return "Cambio location dell'ordine";
  }
  return undefined;
}

/** Riga ordine da impegnare (input canonico, indipendente dal canale). */
export interface ReservationLineInput {
  readonly salesOrderLineId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly externalLineRef?: string | null;
  /**
   * ⭐ La sede DI QUESTA RIGA (13/09/2026): Shopify assegna ogni riga a una sede
   *    nel suo fulfillment order, e due righe dello stesso ordine possono uscire
   *    da due sedi. Assente → vale la sede dell'ordine (`params.locationId`);
   *    se manca anche quella, la riga NON si impegna e l'impegno che avesse si
   *    conserva — mai una sede indovinata.
   */
  readonly locationId?: string | null;
}

export interface SyncOrderReservationsParams {
  readonly tenantId: string;
  readonly salesOrderId: string;
  readonly channel: SalesOrderSource;
  /** La sede dell'ORDINE: ripiego per le righe che non ne dichiarano una. */
  readonly locationId: string | null;
  readonly externalOrderRef?: string | null;
  readonly lines: readonly ReservationLineInput[];
  /**
   * ⭐ Righe che oggi NON si risolvono a una variante (collegamento chiuso,
   *    12/09/2026) ma il cui impegno PREESISTENTE si conserva: seguono il ciclo
   *    dell'ordine (`docs/24` §1.14.3), non quello del collegamento. Non sono
   *    in `lines` — non si crea né si aggiorna niente — e non si rilasciano.
   */
  readonly righeDaConservare?: readonly string[];
  /**
   * ⭐ Righe il cui impegno attivo si RILASCIA (13/09/2026): Shopify le ha
   *    assegnate per intero a una location non collegata, e il pezzo non
   *    partirà da dove era impegnato. Stesso rilascio delle righe rimosse —
   *    `committed` −residuo, evento, nessun movimento — con il suo motivo.
   *    Le altre righe non si toccano.
   */
  readonly righeDaRilasciare?: readonly string[];
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

    const seenLineIds = new Set<string>(params.righeDaConservare ?? []);

    for (const line of params.lines) {
      if (line.quantity <= 0) {
        continue;
      }
      seenLineIds.add(line.salesOrderLineId);
      const current = existingByLineId.get(line.salesOrderLineId);
      const sedeRiga = line.locationId ?? params.locationId;
      if (!sedeRiga) {
        // ⛔ Senza sede la riga non si impegna e non si rilascia: è vista (non
        //    «rimossa dal canale») e ciò che ha resta com'è.
        continue;
      }

      if (!current) {
        await this.createReservationTx(tx, params, line, sedeRiga);
        continue;
      }

      if (current.status === ReservationStatus.consumed) {
        // Impegno già consumato (fase 2): non si riapre da un update ordine.
        continue;
      }

      // Nulla da fare solo se l'impegno rappresenta GIA' esattamente la riga:
      // stessa variante, stessa sede, stessa quantita', ancora attivo.
      // ⛔ Senza il confronto sulla variante, «A x3 → B x3 stessa sede» passava
      //    di qui come «nessuna modifica» e l'Impegnata restava sulla A.
      const unchanged =
        current.status === ReservationStatus.active &&
        current.variantId === line.variantId &&
        current.locationId === sedeRiga &&
        current.remainingQuantity === line.quantity;
      if (unchanged) {
        continue;
      }

      await this.updateReservationTx(tx, params.tenantId, current, line, sedeRiga);
    }

    // Righe rimosse dal canale (o impegni orfani) e righe assegnate per intero
    // a una location non collegata: rilascio, mai cancellazione.
    const daRilasciare = new Set<string>(params.righeDaRilasciare ?? []);
    for (const reservation of existing) {
      const stillPresent =
        reservation.salesOrderLineId !== null && seenLineIds.has(reservation.salesOrderLineId);
      if (!stillPresent && reservation.status === ReservationStatus.active) {
        const confermataAltrove =
          reservation.salesOrderLineId !== null && daRilasciare.has(reservation.salesOrderLineId);
        await this.releaseReservationTx(
          tx,
          reservation,
          confermataAltrove
            ? 'Riga assegnata da Shopify a una location non collegata'
            : 'Riga ordine rimossa dal canale',
        );
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
      origineDaCanaleOrdine(reservation.channel),
    );

    this.logger.debug(
      `Impegno consumato: ordine ${reservation.salesOrderId}, sku ${reservation.sku}, qta ${reservation.remainingQuantity}`,
    );

    return reservation.remainingQuantity;
  }

  /**
   * ⭐ Consuma UNA PARTE di un impegno attivo (spedizione parziale, 12/09/2026):
   *    Impegnata − q, Disponibile + q, residuo − q; l'impegno resta attivo
   *    finché resta qualcosa da spedire, e si chiude quando la quantità
   *    consumata raggiunge il residuo. Lo scarico fisico è del movimento creato
   *    dal chiamante nella stessa transazione. Idempotente: un impegno non
   *    attivo è no-op.
   *
   * @returns quantità consumata davvero (0 se non attivo).
   */
  async consumeReservationQuantityTx(
    tx: Prisma.TransactionClient,
    reservation: StockReservation,
    quantita: number,
    note: string,
  ): Promise<number> {
    if (quantita <= 0 || reservation.status !== ReservationStatus.active) {
      return 0;
    }
    if (quantita >= reservation.remainingQuantity) {
      return this.consumeReservationTx(tx, reservation, note);
    }
    const residuo = reservation.remainingQuantity - quantita;
    const result = await tx.stockReservation.updateMany({
      where: { id: reservation.id, status: ReservationStatus.active },
      data: { remainingQuantity: residuo },
    });
    if (result.count === 0) {
      return 0;
    }
    await tx.stockReservationEvent.create({
      data: {
        tenantId: reservation.tenantId,
        reservationId: reservation.id,
        type: ReservationEventType.consumed,
        quantityDelta: -quantita,
        remainingAfter: residuo,
        note,
      },
    });
    await applyCommittedDelta(
      tx,
      reservation.tenantId,
      reservation.variantId,
      reservation.locationId,
      -quantita,
      origineDaCanaleOrdine(reservation.channel),
    );
    this.logger.debug(
      `Impegno consumato in parte: ordine ${reservation.salesOrderId}, sku ${reservation.sku}, qta ${quantita}, residuo ${residuo}`,
    );
    return quantita;
  }

  /**
   * Ripristina gli impegni CONSUMATI di un ordine (annullamento del documento
   * di scarico che aveva concluso un Ordine cliente manuale): status di nuovo
   * `active`, quantità originale, Impegnata + quantità, evento verificabile.
   * La Giacenza non viene toccata: il ricarico fisico è dello storno movimenti
   * eseguito dal chiamante nella stessa transazione. Idempotente sui non consumati.
   */
  async restoreConsumedOrderReservationsTx(
    tx: Prisma.TransactionClient,
    params: { readonly tenantId: string; readonly salesOrderId: string; readonly note: string },
  ): Promise<void> {
    const consumed = await tx.stockReservation.findMany({
      where: {
        tenantId: params.tenantId,
        salesOrderId: params.salesOrderId,
        status: ReservationStatus.consumed,
      },
    });

    for (const reservation of consumed) {
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.active, remainingQuantity: reservation.quantity },
      });

      await tx.stockReservationEvent.create({
        data: {
          tenantId: params.tenantId,
          reservationId: reservation.id,
          type: ReservationEventType.updated,
          quantityDelta: reservation.quantity,
          remainingAfter: reservation.quantity,
          note: params.note,
        },
      });

      await applyCommittedDelta(
        tx,
        params.tenantId,
        reservation.variantId,
        reservation.locationId,
        reservation.quantity,
        origineDaCanaleOrdine(reservation.channel),
      );
    }
  }

  /**
   * Impegni attivi che compongono la Impegnata di una variante×location (UI §10).
   *
   * Senza utente in contesto (chiamate interne, lavori di sistema) non si
   * decide nulla qui: l'autorizzazione l'ha già data chi ha avviato
   * l'operazione — è `assertLocationReadableInUserScope` a lasciar passare.
   */
  async listActiveForLevel(
    tenantId: string,
    variantId: string,
    locationId: string,
    // ⛔ **`UserProfileDto`, non `UserProfileDto | undefined`.** Misurato il
    // 28/08/2026: la rotta sta sotto `JwtAuthGuard` senza `@Public()`, il
    // decoratore `@CurrentUser()` e tipizzato non-nullable e la guardia popola
    // `request.appUser` su entrambi i rami che restituiscono `true` per una
    // rotta protetta. L’identita non puo essere assente qui.
    //
    // ⚠️ `undefined` era convenzione ereditata dalle utility, non necessita
    // tecnica: ed e esattamente la forma che ha prodotto lo stesso difetto in
    // tre domini diversi. Se un giorno servisse una chiamata di sistema, avra
    // una strada esplicita (`…ForSystem`), non questa scorciatoia.
    user: UserProfileDto,
  ): Promise<ActiveReservationWithRefs[]> {
    // Il gate della rotta chiede la sola sezione Magazzino, ma la sede arriva
    // dalla query ed è validata solo come UUID: senza questo controllo chi ha
    // una sola sede assegnata leggeva gli impegni di qualunque altra — numero
    // d'ordine, canale, quantità e sku dei clienti di un altro negozio. Chi ha
    // `inventory.view_all_locations`, il titolare e chi ha accesso a tutte le
    // sedi continuano a vedere tutto.
    assertLocationReadableInUserScope(
      user,
      locationId,
      'Non sei autorizzato a consultare gli impegni di questo magazzino.',
    );

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
    locationId: string,
  ): Promise<void> {
    const reservation = await tx.stockReservation.create({
      data: {
        tenantId: params.tenantId,
        locationId,
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
      locationId,
      line.quantity,
      origineDaCanaleOrdine(params.channel),
    );
  }

  /**
   * Riallinea un impegno esistente alla riga corrente.
   *
   * ⭐ L'impegno rappresenta sempre ESATTAMENTE la riga:
   * `salesOrderLineId + variantId + locationId + quantità`. Da qui discende
   * tutto il resto — se cambia la variante o la sede, l'Impegnata NON si
   * aggiorna per differenza: si NEUTRALIZZA sulla combinazione vecchia e si
   * applica intera sulla nuova. Sono due conti diversi, e un delta comune fra
   * loro non significa niente.
   *
   * ⛔ Qui `variantId` non veniva scritto e i delta finivano tutti su
   * `current.variantId`: la riga passava alla variante B mentre l'impegno e
   * l'Impegnata restavano sulla A. Il difetto era del motore, non dell'Ordine
   * cliente — `syncOrderReservationsTx` riceveva la variante giusta e la
   * scartava, quindi ne erano toccati anche il ciclo online e la riapertura
   * da annullamento.
   */
  private async updateReservationTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    current: StockReservation,
    line: ReservationLineInput,
    locationId: string,
  ): Promise<void> {
    const variantChanged = current.variantId !== line.variantId;
    const locationChanged = current.locationId !== locationId;
    // La combinazione che porta l'Impegnata. Se cambia, cambia il conto su cui
    // si scrive: non è più lo stesso saldo da correggere.
    const keyChanged = variantChanged || locationChanged;

    // Quanto risulta impegnato OGGI sulla combinazione vecchia. Zero se
    // l'impegno non è attivo: un rilasciato che torna in riga non ha niente da
    // restituire, ha solo da impegnare.
    const currentRemaining =
      current.status === ReservationStatus.active ? current.remainingQuantity : 0;

    await tx.stockReservation.update({
      where: { id: current.id },
      data: {
        quantity: line.quantity,
        remainingQuantity: line.quantity,
        status: ReservationStatus.active,
        variantId: line.variantId,
        sku: line.sku,
        locationId,
      },
    });

    await tx.stockReservationEvent.create({
      data: {
        tenantId,
        reservationId: current.id,
        type: ReservationEventType.updated,
        // Variazione della quantità DI QUESTO IMPEGNO, non dell'Impegnata: sono
        // due assi diversi, e su un cambio di combinazione divergono.
        quantityDelta: line.quantity - currentRemaining,
        remainingAfter: line.quantity,
        note: describeReservationChange(variantChanged, locationChanged),
      },
    });

    if (keyChanged) {
      // Si azzera il vecchio conto per intero e si apre il nuovo per intero.
      // ⚠️ Il secondo delta è `line.quantity`, MAI `line.quantity - currentRemaining`:
      //    sulla combinazione nuova non c'era niente da cui sottrarre.
      await applyCommittedDelta(
        tx,
        tenantId,
        current.variantId,
        current.locationId,
        -currentRemaining,
        origineDaCanaleOrdine(current.channel),
      );
      await applyCommittedDelta(
        tx,
        tenantId,
        line.variantId,
        locationId,
        line.quantity,
        origineDaCanaleOrdine(current.channel),
      );
      return;
    }

    // Stessa variante e stessa sede: il conto è uno solo, e si corregge per
    // differenza.
    await applyCommittedDelta(
      tx,
      tenantId,
      line.variantId,
      locationId,
      line.quantity - currentRemaining,
      origineDaCanaleOrdine(current.channel),
    );
  }

  async releaseReservationTx(
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
      origineDaCanaleOrdine(reservation.channel),
    );

    this.logger.debug(
      `Impegno rilasciato: ordine ${reservation.salesOrderId}, sku ${reservation.sku}, qta ${reservation.remainingQuantity}`,
    );
  }
}
