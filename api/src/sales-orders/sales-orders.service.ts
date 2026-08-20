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
import type { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { buildSalesOrderWhere } from './sales-order-query.util';
import { parseSalesOrderSort } from './sales-orders-sort.util';

/** Vendita online collegata all'ordine (fase 3 §2-§3: colonna registro). */
export interface SalesOrderOnlineSaleRef {
  readonly id: string;
  readonly reference: string;
  readonly fulfilledAt: Date;
  readonly inventoryStatus: string;
  readonly refundedAt: Date | null;
}

export type SalesOrderListRow = SalesOrder & {
  customer: { email: string | null } | null;
  lines: readonly Pick<SalesOrderLine, 'id' | 'title' | 'quantity'>[];
  document: { id: string; reference: string | null; type: string; status: string } | null;
  onlineSale: SalesOrderOnlineSaleRef | null;
  /** Quantità ancora impegnata dagli impegni attivi dell'ordine (fase 3 §2). */
  committedQuantity: number;
  /** Nome della location degli impegni (prima trovata), se disponibile. */
  locationName: string | null;
};

export type SalesOrderDetailRow = SalesOrder & {
  lines: SalesOrderLine[];
  customer: { email: string | null } | null;
  document: { id: string; reference: string | null; type: string; status: string } | null;
  /** Nome della location di origine (ordini manuali). */
  locationName: string | null;
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
              location: { select: { name: true } },
            },
          },
          reservations: {
            where: { status: ReservationStatus.active },
            select: {
              remainingQuantity: true,
              location: { select: { name: true } },
            },
          },
        },
        orderBy: parseSalesOrderSort(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    const items: SalesOrderListRow[] = rows.map(
      ({ reservations, customer, onlineSale, ...order }) => ({
        ...order,
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
        // uscito qualcosa: resta vuoto, ed è la verità.
        locationName: reservations[0]?.location.name ?? onlineSale?.location?.name ?? null,
      }),
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string, user?: UserProfileDto): Promise<SalesOrderDetailRow> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }] },
        customer: { select: { party: { select: { email: true } } } },
        location: { select: { name: true } },
        document: { select: { id: true, reference: true, type: true, status: true } },
        onlineSale: {
          select: {
            id: true,
            reference: true,
            fulfilledAt: true,
            inventoryStatus: true,
            refundedAt: true,
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
    const { customer, location, ...rest } = order;
    return {
      ...rest,
      customer: customer ? { email: customer.party.email } : null,
      locationName: location?.name ?? null,
    };
  }
}
