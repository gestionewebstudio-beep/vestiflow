import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { serializeCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import { minorToShopifyDecimal } from '../shopify/shopify-money.util';
import type { ExportSalesOrdersQueryDto } from './dto/export-sales-orders.query.dto';
import {
  financialStatusDisplayLabel,
  fulfillmentStatusDisplayLabel,
  prismaFinancialFilter,
  sourceDisplayLabel,
  toPrismaSource,
} from './sales-order.enum-mapper';

export const SALES_ORDER_EXPORT_HEADERS = [
  'Numero ordine',
  'Data',
  'Cliente',
  'Email cliente',
  'Canale',
  'Pagamento',
  'Evasione',
  'Valuta',
  'Subtotale',
  'Totale',
  'ID Shopify',
] as const;

@Injectable()
export class SalesOrdersExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportSalesOrdersQueryDto): Promise<string> {
    const orders = await this.prisma.salesOrder.findMany({
      where: this.buildWhere(tenantId, query),
      include: { customer: { select: { email: true } } },
      orderBy: { placedAt: 'desc' },
    });

    const rows = orders.map((order) => ({
      'Numero ordine': order.orderNumber,
      Data: order.placedAt.toISOString(),
      Cliente: order.customerName,
      'Email cliente': order.customer?.email ?? '',
      Canale: sourceDisplayLabel(order.source),
      Pagamento: financialStatusDisplayLabel(order.financialStatus),
      Evasione: fulfillmentStatusDisplayLabel(order.fulfillmentStatus),
      Valuta: order.currency,
      Subtotale: minorToShopifyDecimal(order.subtotalMinor),
      Totale: minorToShopifyDecimal(order.totalMinor),
      'ID Shopify': order.shopifyOrderId ?? '',
    }));

    return serializeCsv(SALES_ORDER_EXPORT_HEADERS, rows);
  }

  private buildWhere(
    tenantId: string,
    query: ExportSalesOrdersQueryDto,
  ): Prisma.SalesOrderWhereInput {
    const financialFilter = prismaFinancialFilter(query.financialStatus);
    const prismaSource = toPrismaSource(query.source);

    return {
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
  }
}
