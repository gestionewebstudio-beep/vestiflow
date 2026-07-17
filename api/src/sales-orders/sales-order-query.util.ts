import {
  Prisma,
  ReservationStatus,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
} from '@prisma/client';

import {
  prismaFinancialFilter,
  prismaFulfillmentFilter,
  prismaSourceFilter,
} from './sales-order.enum-mapper';

export interface SalesOrderListFilters {
  readonly search?: string;
  readonly financialStatus?: string;
  readonly fulfillmentStatus?: string;
  readonly source?: string;
  /** Stato derivato: open | concluded | cancelled (rispecchia la colonna Stato). */
  readonly state?: string;
  readonly customerId?: string;
  readonly locationId?: string;
  readonly placedFrom?: string;
  readonly placedTo?: string;
}

/** Filtri Prisma condivisi tra lista ed export vendite. */
export function buildSalesOrderWhere(
  tenantId: string,
  query: SalesOrderListFilters,
): Prisma.SalesOrderWhereInput {
  // Ogni filtro contribuisce un blocco alla clausola AND: cosi' i filtri che
  // portano un proprio `OR` (ricerca, stato «concluso») non si sovrascrivono.
  const conditions: Prisma.SalesOrderWhereInput[] = [];

  const financialFilter = prismaFinancialFilter(query.financialStatus);
  if (financialFilter) {
    conditions.push({ financialStatus: { in: financialFilter } });
  }

  const fulfillmentFilter = prismaFulfillmentFilter(query.fulfillmentStatus);
  if (fulfillmentFilter) {
    conditions.push({ fulfillmentStatus: { in: fulfillmentFilter } });
  }

  const sourceFilter = prismaSourceFilter(query.source);
  if (sourceFilter) {
    conditions.push({ source: { in: sourceFilter } });
  }

  const placedAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);
  if (placedAt) {
    conditions.push({ placedAt });
  }

  if (query.customerId) {
    conditions.push({ customerId: query.customerId });
  }

  if (query.locationId) {
    // La colonna Location deriva dalla location dell'impegno attivo: il filtro
    // rispecchia la colonna (ordini con un impegno attivo su quella sede).
    conditions.push({
      reservations: { some: { status: ReservationStatus.active, locationId: query.locationId } },
    });
  }

  const stateFilter = buildStateFilter(query.state);
  if (stateFilter) {
    conditions.push(stateFilter);
  }

  if (query.search) {
    conditions.push({
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
    });
  }

  return {
    tenantId,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };
}

/**
 * Stato derivato dell'ordine (precedenza: annullato > concluso/evaso > aperto),
 * allineato alla colonna Stato della lista:
 * - manuale: Confermato / Concluso (fulfilledAt) / Annullato (cancelledAt);
 * - Shopify: Aperto / Evaso (fulfillmentStatus) / Annullato (cancelledAt).
 */
export function buildStateFilter(state?: string): Prisma.SalesOrderWhereInput | undefined {
  switch (state) {
    case 'cancelled':
      return { cancelledAt: { not: null } };
    case 'concluded':
      return {
        cancelledAt: null,
        OR: [{ fulfilledAt: { not: null } }, { fulfillmentStatus: PrismaFulfillment.fulfilled }],
      };
    case 'open':
      return {
        cancelledAt: null,
        fulfilledAt: null,
        NOT: { fulfillmentStatus: PrismaFulfillment.fulfilled },
      };
    default:
      return undefined;
  }
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
