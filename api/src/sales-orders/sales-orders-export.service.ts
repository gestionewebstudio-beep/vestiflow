import { Injectable } from '@nestjs/common';

import { serializeItalianExcelCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportSalesOrdersQueryDto } from './dto/export-sales-orders.query.dto';
import {
  financialStatusDisplayLabel,
  fulfillmentStatusDisplayLabel,
  sourceDisplayLabel,
} from './sales-order.enum-mapper';
import { buildSalesOrderWhere } from './sales-order-query.util';

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

/** Data e ora in fuso Europe/Rome, formato it-IT (es. 24/06/2026, 18:09). */
const ROME_DATETIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Importo it-IT (es. 1.500,00) leggibile nativamente in Excel italiano. */
const EUR_AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Injectable()
export class SalesOrdersExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportSalesOrdersQueryDto): Promise<string> {
    const orders = await this.prisma.salesOrder.findMany({
      where: this.buildWhere(tenantId, query),
      include: { customer: { select: { party: { select: { email: true } } } } },
      orderBy: { placedAt: 'desc' },
    });

    const rows = orders.map((order) => ({
      'Numero ordine': order.orderNumber,
      Data: ROME_DATETIME_FORMAT.format(order.placedAt),
      Cliente: order.customerName,
      'Email cliente': order.customer?.party.email ?? '',
      Canale: sourceDisplayLabel(order.source),
      Pagamento: financialStatusDisplayLabel(order.financialStatus),
      Evasione: fulfillmentStatusDisplayLabel(order.fulfillmentStatus),
      Valuta: order.currency,
      Subtotale: this.formatMinor(order.subtotalMinor),
      Totale: this.formatMinor(order.totalMinor),
      'ID Shopify': order.shopifyOrderId ?? '',
    }));

    return serializeItalianExcelCsv(SALES_ORDER_EXPORT_HEADERS, rows);
  }

  /** Unità minori intere → importo formattato it-IT (es. 1.500,00). */
  private formatMinor(minor: number): string {
    return EUR_AMOUNT_FORMAT.format(minor / 100);
  }

  private buildWhere(tenantId: string, query: ExportSalesOrdersQueryDto) {
    return buildSalesOrderWhere(tenantId, query);
  }
}
