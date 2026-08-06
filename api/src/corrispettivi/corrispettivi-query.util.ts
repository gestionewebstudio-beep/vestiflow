import {
  Prisma,
  SalesOrderFiscalStatus as PrismaFiscal,
  SalesOrderFinancialStatus as PrismaFinancial,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';

import {
  buildPlacedAtFilter,
  type SalesOrderListFilters,
} from '../sales-orders/sales-order-query.util';
import {
  prismaFinancialFilter,
  toPrismaSource,
} from '../sales-orders/sales-order.enum-mapper';
import { toPrismaFiscalStatus } from './corrispettivi-fiscal.enum-mapper';

export interface CorrispettiviListFilters extends SalesOrderListFilters {
  readonly fiscalStatus?: string;
  readonly onlineOnly?: boolean;
  readonly posOnly?: boolean;
  readonly pendingDeliveryOnly?: boolean;
  readonly refundsOnly?: boolean;
}

/** Filtri Prisma condivisi tra lista corrispettivi, summary ed export. */
export function buildCorrispettiviWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.SalesOrderWhereInput {
  const financialFilter = prismaFinancialFilter(query.financialStatus);
  const prismaSource = toPrismaSource(query.source);
  const placedAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);
  const fiscalStatus = toPrismaFiscalStatus(query.fiscalStatus);

  let sourceFilter: PrismaSource | Prisma.EnumSalesOrderSourceFilter | undefined = prismaSource;
  if (query.onlineOnly) {
    sourceFilter = PrismaSource.shopify_online;
  } else if (query.posOnly) {
    sourceFilter = PrismaSource.shopify_pos;
  }

  const where: Prisma.SalesOrderWhereInput = {
    tenantId,
    ...(financialFilter ? { financialStatus: { in: financialFilter } } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(placedAt ? { placedAt } : {}),
    ...(fiscalStatus ? { fiscalStatus } : {}),
    ...(query.pendingDeliveryOnly
      ? {
          fiscalStatus: PrismaFiscal.pending_registration,
          source: PrismaSource.shopify_online,
        }
      : {}),
    ...(query.refundsOnly
      ? {
          financialStatus: {
            in: [PrismaFinancial.refunded, PrismaFinancial.partially_refunded],
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  return where;
}
