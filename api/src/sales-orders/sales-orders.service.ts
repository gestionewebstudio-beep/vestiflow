import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type SalesOrder, type SalesOrderLine } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { prismaFinancialFilter, toPrismaSource } from './sales-order.enum-mapper';

export type SalesOrderListRow = SalesOrder & {
  customer: { email: string | null } | null;
};

export type SalesOrderDetailRow = SalesOrder & {
  lines: SalesOrderLine[];
  customer: { email: string | null } | null;
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
    const financialFilter = prismaFinancialFilter(query.financialStatus);
    const prismaSource = toPrismaSource(query.source);

    const where: Prisma.SalesOrderWhereInput = {
      tenantId,
      ...(financialFilter ? { financialStatus: { in: financialFilter } } : {}),
      ...(prismaSource ? { source: prismaSource } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: { customer: { select: { email: true } } },
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<SalesOrderDetailRow> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        customer: { select: { email: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Vendita non trovata');
    }
    return order;
  }
}
