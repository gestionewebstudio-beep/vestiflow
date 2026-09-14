import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReservationStatus,
  SalesOrderSource,
  type SalesOrder,
  type SalesOrderLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { resolveReadableListLocationScope } from '../inventory/licensed-location-scope.util';
import { assertLocationReadableInUserScope } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { annullatePerRiga, speditePerRiga } from './sales-order-rettifiche.util';
import { sedeDellOrdine } from './sales-order-sede.util';
import type { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { buildSalesOrderWhere } from './sales-order-query.util';
import { parseSalesOrderSort } from './sales-orders-sort.util';
import { pageWindow } from '../common/dto/unpaged.util';

/** Vendita online collegata all'ordine (fase 3 §2-§3: colonna registro). */
export interface SalesOrderOnlineSaleRef {
  readonly id: string;
  readonly reference: string;
  readonly fulfilledAt: Date;
  readonly inventoryStatus: string;
  readonly refundedAt: Date | null;
}

/** Una RETTIFICA del canale (rimborso), alla sua data, con le righe rimborsate. */
export interface SalesOrderRettificaRow {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: Date;
  readonly totalMinor: number;
  readonly taxMinor: number;
  readonly note: string | null;
  readonly lines: readonly {
    readonly salesOrderLineId: string | null;
    readonly quantity: number;
    readonly restockType: string;
  }[];
}

export type SalesOrderListRow = SalesOrder & {
  customer: { email: string | null } | null;
  lines: readonly Pick<SalesOrderLine, 'id' | 'title' | 'quantity'>[];
  document: { id: string; reference: string | null; type: string; status: string } | null;
  onlineSale: SalesOrderOnlineSaleRef | null;
  /** Quantità ancora impegnata dagli impegni attivi dell'ordine (fase 3 §2). */
  committedQuantity: number;
  /**
   * La sede per RACCORDO (`sedeDellOrdine`): la testata, poi gli impegni attivi se
   * su una sede sola, poi la Vendita online. Mai la prima fra più sedi.
   */
  locationName: string | null;
  /**
   * ⭐ Le RETTIFICHE del canale (rimborsi): la somma è di TESTATA
   *    (`refundTotalMinor`, scritta coi rimborsi) e il totale aggiornato lo genera
   *    il database (`currentTotalMinor`): il valore originario resta `totalMinor`
   *    (13/09/2026, #1014). Qui solo il conteggio, che la testata non porta.
   */
  refundCount: number;
};

export type SalesOrderDetailRow = SalesOrder & {
  lines: (SalesOrderLine & {
    /** Pezzi ANNULLATI prima della spedizione: dalle righe rimborsate `cancel` del canale. */
    cancelledQuantity: number;
    /** Pezzi SPEDITI: dalle spedizioni acquisite. */
    shippedQuantity: number;
  })[];
  customer: { email: string | null } | null;
  document: { id: string; reference: string | null; type: string; status: string } | null;
  /**
   * La sede: di testata per gli ordini manuali; per gli ordini di CANALE il
   * raccordo (`sedeDellOrdine`), che riempie anche `locationId` così la maschera
   * mostra la sede dell'uscita invece di «Seleziona location…». Niente si
   * persiste: è una lettura.
   */
  locationName: string | null;
  /** Le rettifiche del canale, ciascuna alla sua data; la somma è di testata. */
  refunds: readonly SalesOrderRettificaRow[];
  /** Vendita online generata dall'evasione (fase 2). */
  onlineSale: {
    id: string;
    reference: string;
    fulfilledAt: Date;
    inventoryStatus: string;
    refundedAt: Date | null;
  } | null;
};

/**
 * Read-model vendite (owner Shopify). Nessuna scrittura: snapshot ordini
 * popolati da sync/webhook. Lista senza righe per performance.
 */
@Injectable()
export class SalesOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListSalesOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<SalesOrderListRow>> {
    const baseWhere = buildSalesOrderWhere(tenantId, query);
    // Scope sede in lettura, come per gli ordini fornitore e il registro
    // documenti: un commesso di una sede non legge gli ordini MANUALI delle
    // altre.
    //
    // Gli ordini che arrivano da un canale esterno restano invece sempre
    // visibili: la loro sede non dice «dove lavora chi lo ha scritto» ma solo
    // da quale magazzino è partita la merce, assegnata dall'evasione. Filtrarli
    // per sede farebbe sparire ordini che l'operatore deve poter seguire, e
    // sarebbe una perdita di righe silenziosa.
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (scope === null) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const where: Prisma.SalesOrderWhereInput =
      scope === 'unrestricted'
        ? baseWhere
        : {
            ...baseWhere,
            AND: [
              ...(Array.isArray(baseWhere.AND)
                ? baseWhere.AND
                : baseWhere.AND
                  ? [baseWhere.AND]
                  : []),
              {
                OR: [
                  { source: { not: SalesOrderSource.manual } },
                  { locationId: null },
                  { locationId: { in: [...scope] } },
                ],
              },
            ],
          };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { party: { select: { email: true } } } },
          document: { select: { id: true, reference: true, type: true, status: true } },
          lines: {
            select: { id: true, title: true, quantity: true },
            orderBy: { id: 'asc' },
          },
          onlineSale: {
            select: {
              id: true,
              reference: true,
              fulfilledAt: true,
              inventoryStatus: true,
              refundedAt: true,
              // Location di scarico: è la risposta alla colonna quando gli
              // impegni non ci sono più. Non esce nella riga (vedi sotto).
              location: { select: { id: true, name: true } },
            },
          },
          location: { select: { id: true, name: true } },
          reservations: {
            where: { status: ReservationStatus.active },
            select: {
              remainingQuantity: true,
              location: { select: { id: true, name: true } },
            },
          },
          _count: { select: { refunds: true } },
        },
        orderBy: parseSalesOrderSort(query.sort),
        ...pageWindow(query),
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    const items: SalesOrderListRow[] = rows.map(
      ({ reservations, customer, onlineSale, _count, location, ...order }) => ({
        ...order,
        refundCount: _count.refunds,
        customer: customer ? { email: customer.party.email } : null,
        // La location della vendita serve solo a rispondere alla colonna: si
        // ricostruisce la riga senza, per non cambiare la forma della risposta.
        onlineSale: onlineSale
          ? {
              id: onlineSale.id,
              reference: onlineSale.reference,
              fulfilledAt: onlineSale.fulfilledAt,
              inventoryStatus: onlineSale.inventoryStatus,
              refundedAt: onlineSale.refundedAt,
            }
          : null,
        committedQuantity: reservations.reduce(
          (sum, reservation) => sum + reservation.remainingQuantity,
          0,
        ),
        // Da dove esce la merce. Finché l'ordine è aperto lo dice l'impegno
        // attivo; quando è evaso l'impegno è consumato e risponde la vendita
        // online. Su un ordine annullato non c'è nessun magazzino da cui sia
        // uscito qualcosa: resta vuoto, ed è la verità. ⛔ Con impegni su più
        // sedi resta vuoto anche qui: era «la prima trovata» (13/09/2026).
        locationName: sedeDellOrdine({ location, reservations, onlineSale })?.name ?? null,
      }),
    );

    // ⛔ Nessun tetto sulle righe (deciso il 21/08/2026): con `all` si
    // consegna tutto il risultato del filtro, e a contenerlo è il PERIODO —
    // l'elenco si apre sugli ultimi 30 giorni.
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string, user: UserProfileDto): Promise<SalesOrderDetailRow> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          include: { spedizioni: { select: { salesOrderLineId: true, quantity: true } } },
        },
        customer: { select: { party: { select: { email: true } } } },
        location: { select: { id: true, name: true } },
        document: { select: { id: true, reference: true, type: true, status: true } },
        onlineSale: {
          select: {
            id: true,
            reference: true,
            fulfilledAt: true,
            inventoryStatus: true,
            refundedAt: true,
            // La sede dell'uscita, per il raccordo: non esce nella risposta.
            location: { select: { id: true, name: true } },
          },
        },
        reservations: {
          where: { status: ReservationStatus.active },
          select: { location: { select: { id: true, name: true } } },
        },
        refunds: {
          orderBy: { occurredAt: 'asc' },
          select: {
            id: true,
            kind: true,
            occurredAt: true,
            totalMinor: true,
            taxMinor: true,
            note: true,
            lines: { select: { salesOrderLineId: true, quantity: true, restockType: true } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Vendita non trovata');
    }
    // Apertura diretta per id: stessa regola della lista — solo gli ordini
    // manuali sono legati alla sede di chi li ha scritti.
    if (order.source === SalesOrderSource.manual) {
      assertLocationReadableInUserScope(
        user,
        order.locationId,
        'Non sei autorizzato ad accedere a questo ordine.',
      );
    }
    const { customer, location, reservations, onlineSale, lines, refunds, ...rest } = order;
    // ⭐ Tre quantità per riga: ordinata (la riga), annullata (le righe `cancel` del
    //    canale), spedita (le spedizioni acquisite). Mai «ordinate − spedite».
    const annullate = annullatePerRiga(refunds);
    const spedite = speditePerRiga(lines.flatMap((line) => line.spedizioni));
    // La sede per raccordo: sulla maschera di un ordine di canale evaso da una
    // sede nota compariva «Seleziona location…» (13/09/2026, #1014).
    const sede = sedeDellOrdine({ location, reservations, onlineSale });
    return {
      ...rest,
      locationId: sede?.id ?? null,
      // La sede della vendita serve al raccordo e non esce nella risposta.
      onlineSale: onlineSale
        ? {
            id: onlineSale.id,
            reference: onlineSale.reference,
            fulfilledAt: onlineSale.fulfilledAt,
            inventoryStatus: onlineSale.inventoryStatus,
            refundedAt: onlineSale.refundedAt,
          }
        : null,
      lines: lines.map(({ spedizioni: _spedizioni, ...line }) => ({
        ...line,
        cancelledQuantity: annullate.get(line.id) ?? 0,
        shippedQuantity: spedite.get(line.id) ?? 0,
      })),
      refunds,
      customer: customer ? { email: customer.party.email } : null,
      locationName: sede?.name ?? null,
    };
  }
}
