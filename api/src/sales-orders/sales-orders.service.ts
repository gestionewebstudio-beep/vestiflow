import { Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus, type SalesOrder, type SalesOrderLine } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { buildSalesOrderWhere } from './sales-order-query.util';

/** Vendita online collegata all'ordine (fase 3 §2-§3: colonna registro). */
export interface SalesOrderOnlineSaleRef {
  readonly id: string;
  readonly reference: string;
  readonly fulfilledAt: Date;
  readonly inventoryStatus: string;
  readonly refundedAt: Date | null;
  readonly corrispettivo: { id: string; reference: string; status: string } | null;
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
  /** Vendita online generata dall'evasione (fase 2), con Corrispettivo collegato. */
  onlineSale: {
    id: string;
    reference: string;
    fulfilledAt: Date;
    inventoryStatus: string;
    refundedAt: Date | null;
    corrispettivo: {
      id: string;
      reference: string;
      fiscalDate: Date;
      status: string;
    } | null;
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
  ): Promise<Paginated<SalesOrderListRow>> {
    const where = buildSalesOrderWhere(tenantId, query);

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
              corrispettivo: { select: { id: true, reference: true, status: true } },
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
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    const items: SalesOrderListRow[] = rows.map(({ reservations, customer, ...order }) => ({
      ...order,
      customer: customer ? { email: customer.party.email } : null,
      committedQuantity: reservations.reduce(
        (sum, reservation) => sum + reservation.remainingQuantity,
        0,
      ),
      locationName: reservations[0]?.location.name ?? null,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<SalesOrderDetailRow> {
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
            corrispettivo: {
              select: { id: true, reference: true, fiscalDate: true, status: true },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Vendita non trovata');
    }
    const { customer, location, ...rest } = order;
    return {
      ...rest,
      customer: customer ? { email: customer.party.email } : null,
      locationName: location?.name ?? null,
    };
  }
}
