import { Prisma } from '@prisma/client';

import { prismaFinancialFilter, toPrismaSource } from './sales-order.enum-mapper';

export interface SalesOrderListFilters {
  readonly search?: string;
  readonly financialStatus?: string;
  readonly source?: string;
  readonly placedFrom?: string;
  readonly placedTo?: string;
}

/** Filtri Prisma condivisi tra lista ed export vendite. */
export function buildSalesOrderWhere(
  tenantId: string,
  query: SalesOrderListFilters,
): Prisma.SalesOrderWhereInput {
  const financialFilter = prismaFinancialFilter(query.financialStatus);
  const prismaSource = toPrismaSource(query.source);
  const placedAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  return {
    tenantId,
    ...(financialFilter ? { financialStatus: { in: financialFilter } } : {}),
    ...(prismaSource ? { source: prismaSource } : {}),
    ...(placedAt ? { placedAt } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
            {
              lines: {
                some: {
                  OR: [
                    { title: { contains: query.search, mode: 'insensitive' } },
                    { sku: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
}

/** Intervallo inclusivo su date calendario ISO (YYYY-MM-DD), UTC. */
export function buildPlacedAtFilter(
  placedFrom?: string,
  placedTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!placedFrom && !placedTo) {
    return undefined;
  }

  const filter: Prisma.DateTimeFilter = {};
  if (placedFrom) {
    filter.gte = startOfUtcDay(placedFrom);
  }
  if (placedTo) {
    filter.lte = endOfUtcDay(placedTo);
  }
  return filter;
}

function startOfUtcDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfUtcDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}
