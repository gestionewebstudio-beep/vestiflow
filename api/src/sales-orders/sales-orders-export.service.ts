import { Injectable } from '@nestjs/common';
import { Prisma, SalesOrderSource } from '@prisma/client';

import { serializeItalianExcelCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportSalesOrdersQueryDto } from './dto/export-sales-orders.query.dto';
import {
  financialStatusDisplayLabel,
  fulfillmentStatusDisplayLabel,
  sourceDisplayLabel,
} from './sales-order.enum-mapper';
import { buildSalesOrderWhere } from './sales-order-query.util';
import { resolveReadableListLocationScope } from '../inventory/licensed-location-scope.util';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';

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

  /**
   * ⛔ **`user` NON è opzionale per comodità: è lo scope sede.**
   *
   * `SalesOrdersService.list` restringe gli ordini MANUALI alle sedi
   * dell’utente, con la ragione scritta in loco: «un commesso di una sede non
   * legge gli ordini manuali delle altre». Questo export non lo faceva — il
   * controller non dichiarava nemmeno `@CurrentUser()` — quindi il CSV portava
   * fuori gli ordini manuali di TUTTE le sedi del tenant.
   *
   * ⚠️ Mitigazione parziale che c’era già: servono `SectionSales` + view +
   * `ReportsExport`. Non basta: quei permessi non dicono nulla sulla SEDE.
   */
  async exportCsv(
    tenantId: string,
    query: ExportSalesOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<string> {
    // ⭐ Stessa forma di `SalesOrdersService.list`: se lo scope è vuoto non si
    //   esporta niente, e non si esporta «tutto» per ripiego.
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (scope === null) {
      return serializeItalianExcelCsv(SALES_ORDER_EXPORT_HEADERS, []);
    }
    const orders = await this.prisma.salesOrder.findMany({
      where: this.withLocationScope(this.buildWhere(tenantId, query), scope),
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

  /**
   * ⭐ La stessa restrizione di `SalesOrdersService.list`, non una variante:
   * gli ordini MANUALI si vedono solo dalle sedi dell’utente; quelli di canale
   * e quelli senza sede restano visibili — filtrarli farebbe sparire righe che
   * l’operatore deve poter seguire.
   */
  private withLocationScope(
    base: Prisma.SalesOrderWhereInput,
    scope: 'unrestricted' | ReadonlySet<string> | readonly string[],
  ): Prisma.SalesOrderWhereInput {
    if (scope === 'unrestricted') {
      return base;
    }
    return {
      ...base,
      AND: [
        ...(Array.isArray(base.AND) ? base.AND : base.AND ? [base.AND] : []),
        {
          OR: [
            { source: { not: SalesOrderSource.manual } },
            { locationId: null },
            { locationId: { in: [...scope] } },
          ],
        },
      ],
    };
  }

  private buildWhere(tenantId: string, query: ExportSalesOrdersQueryDto) {
    return buildSalesOrderWhere(tenantId, query);
  }
}
