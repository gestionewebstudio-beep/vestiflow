import { Injectable } from '@nestjs/common';
import { DocumentType, Prisma, StockMovementType } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { onlineSalesChannelLabel } from '../common/tenant-channel-profile.util';
import {
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveOperationalLocationScope,
} from '../inventory/licensed-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import type { BusinessAnalyticsQueryDto } from './dto/business-analytics-query.dto';
import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';
import {
  aggregateSalesMovements,
  topProductsOf,
  type AggregatableMovement,
  type SalesAggregate,
} from './movement-sales.util';
import { onlineOriginalKey, type RevenueLineMaps } from './movement-sales-revenue.util';
import {
  enumeratePeriodDates,
  periodDateTimeRange,
  previousReportPeriod,
  resolveReportPeriod,
} from './report-period.util';

/**
 * Movimenti che il report del gestionale conta come vendite (§②): vendita al
 * banco, vendita online, reso. `unload`/`adjustment`/`transfer` sono operazioni
 * di magazzino, non vendite, e restano fuori. Le vendite manuali (movimenti
 * `sale` a mano) oggi non esistono: includerle domani = aggiungere un tipo qui.
 */
const SALE_REPORT_MOVEMENT_TYPES: StockMovementType[] = [
  StockMovementType.sale,
  StockMovementType.online_sale,
  StockMovementType.return,
];

@Injectable()
export class BusinessAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    tenantId: string,
    query: BusinessAnalyticsQueryDto,
    user?: UserProfileDto,
  ): Promise<BusinessAnalyticsSummaryDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { channelProfile: true },
    });

    const period = resolveReportPeriod(query);
    const prevPeriod = previousReportPeriod(period);
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
    );

    if (!scope) {
      return this.emptySummary(period, prevPeriod);
    }

    const currentRange = periodDateTimeRange(period);
    const previousRange = periodDateTimeRange(prevPeriod);
    const movementScope = locationScopeToMovementFilter(scope);
    const inventoryScope = locationScopeToInventoryLevelFilter(scope);

    const [current, previous, inventoryAgg, lowStockCount] = await Promise.all([
      this.aggregateMovementSales(tenantId, currentRange, movementScope, period),
      this.aggregateMovementSales(tenantId, previousRange, movementScope),
      this.aggregateInventoryValuation(tenantId, inventoryScope),
      this.prisma.inventoryLevel.count({
        where: {
          tenantId,
          ...inventoryScope,
          available: { lte: this.prisma.inventoryLevel.fields.minThreshold },
        },
      }),
    ]);

    const changePercent =
      previous.revenueMinor > 0
        ? Math.round(
            ((current.revenueMinor - previous.revenueMinor) / previous.revenueMinor) * 1000,
          ) / 10
        : null;

    const margin = this.buildMargin(current);
    const stockMargin =
      inventoryAgg.stockCostMinor !== null
        ? {
            stockMarginMinor: inventoryAgg.stockValueMinor - inventoryAgg.stockCostMinor,
            stockMarginPercent:
              inventoryAgg.stockValueMinor > 0
                ? Math.round(
                    ((inventoryAgg.stockValueMinor - inventoryAgg.stockCostMinor) /
                      inventoryAgg.stockValueMinor) *
                      1000,
                  ) / 10
                : null,
          }
        : { stockMarginMinor: null, stockMarginPercent: null };

    const avgDailyRevenueMinor =
      period.dayCount > 0 ? Math.round(current.revenueMinor / period.dayCount) : 0;
    const projectedMonthRevenueMinor = avgDailyRevenueMinor * this.daysInCurrentMonth();
    const avgDailyUnits = period.dayCount > 0 ? current.unitsSold / period.dayCount : 0;
    const daysOfCover =
      avgDailyUnits > 0 ? Math.round(inventoryAgg.availableUnits / avgDailyUnits) : null;

    const onlineLabel = onlineSalesChannelLabel(tenant?.channelProfile ?? null);
    const shopifyMinor = current.byChannel.shopify.revenueMinor;
    const manualMinor =
      current.byChannel.pos.revenueMinor + current.byChannel.online_manual.revenueMinor;

    const channels: BusinessAnalyticsSummaryDto['channels'] = [
      {
        channel: 'shopify',
        label: 'Shopify',
        revenueMinor: current.byChannel.shopify.revenueMinor,
        unitsSold: current.byChannel.shopify.unitsSold,
      },
      {
        channel: 'pos',
        label: 'Negozio fisico',
        revenueMinor: current.byChannel.pos.revenueMinor,
        unitsSold: current.byChannel.pos.unitsSold,
      },
      {
        channel: 'online_manual',
        label: onlineLabel,
        revenueMinor: current.byChannel.online_manual.revenueMinor,
        unitsSold: current.byChannel.online_manual.unitsSold,
      },
    ].filter((row) => row.revenueMinor !== 0 || row.unitsSold !== 0);

    return {
      currencyCode: 'EUR',
      period: { from: period.from, to: period.to, dayCount: period.dayCount },
      previousPeriod: {
        from: prevPeriod.from,
        to: prevPeriod.to,
        dayCount: prevPeriod.dayCount,
      },
      revenue: {
        totalMinor: current.revenueMinor,
        shopifyMinor,
        manualMinor,
        previousTotalMinor: previous.revenueMinor,
        changePercent,
      },
      sales: {
        transactionCount: current.transactionCount,
        unitsSold: current.unitsSold,
        avgTicketMinor:
          current.transactionCount > 0
            ? Math.round(current.revenueMinor / current.transactionCount)
            : null,
      },
      margin,
      inventory: {
        stockValueMinor: inventoryAgg.stockValueMinor,
        stockCostMinor: inventoryAgg.stockCostMinor,
        stockMarginMinor: stockMargin.stockMarginMinor,
        stockMarginPercent: stockMargin.stockMarginPercent,
        availableUnits: inventoryAgg.availableUnits,
        lowStockCount,
      },
      forecast: {
        avgDailyRevenueMinor,
        projectedMonthRevenueMinor,
        daysOfCover,
      },
      channels,
      topProducts: topProductsOf(current.topProducts),
      dailyRevenue: enumeratePeriodDates(period.from, period.to).map((date) => ({
        date,
        revenueMinor: current.daily.get(date) ?? 0,
      })),
    };
  }

  /**
   * Report vendite dai MOVIMENTI (§②): carica i movimenti di vendita/reso e le
   * righe collegate, poi aggrega (funzione pura). Costo CONGELATO dal movimento,
   * ricavo dalla riga di vendita (§①b).
   */
  private async aggregateMovementSales(
    tenantId: string,
    range: { gte: Date; lte: Date },
    movementScope: Prisma.StockMovementWhereInput,
    period?: ReturnType<typeof resolveReportPeriod>,
  ): Promise<SalesAggregate> {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...movementScope,
        type: { in: SALE_REPORT_MOVEMENT_TYPES },
        createdAt: range,
      },
      select: {
        type: true,
        origin: true,
        quantity: true,
        sku: true,
        variantId: true,
        totalCostMinor: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        sourceLineId: true,
        createdAt: true,
        variant: { select: { product: { select: { name: true } } } },
      },
    });

    const movements: AggregatableMovement[] = rows.map((row) => ({
      type: row.type,
      origin: row.origin,
      quantity: row.quantity,
      sku: row.sku,
      variantId: row.variantId,
      totalCostMinor: row.totalCostMinor,
      sourceDocumentType: row.sourceDocumentType,
      sourceDocumentId: row.sourceDocumentId,
      sourceLineId: row.sourceLineId,
      createdAt: row.createdAt,
      productName: row.variant.product.name,
    }));

    const maps = await this.loadRevenueLineMaps(tenantId, movements);
    const dailyDates = period ? enumeratePeriodDates(period.from, period.to) : undefined;
    return aggregateSalesMovements(movements, maps, dailyDates);
  }

  /**
   * Precarica in batch le righe da cui deriva il ricavo dei movimenti: righe
   * documento (POS/DDT), righe vendita online e — per i resi online senza riga
   * propria — la riga di vendita originale per variante (§①b + reso online).
   */
  private async loadRevenueLineMaps(
    tenantId: string,
    movements: readonly AggregatableMovement[],
  ): Promise<RevenueLineMaps> {
    const documentLineIds: string[] = [];
    const onlineSaleLineIds: string[] = [];
    const onlineReturnSaleIds: string[] = [];
    const onlineReturnVariantIds: string[] = [];

    for (const movement of movements) {
      if (movement.sourceLineId) {
        if (movement.sourceDocumentType === DocumentType.online_sale) {
          onlineSaleLineIds.push(movement.sourceLineId);
        } else {
          documentLineIds.push(movement.sourceLineId);
        }
      } else if (
        movement.type === StockMovementType.return &&
        movement.sourceDocumentType === DocumentType.online_sale &&
        movement.sourceDocumentId &&
        movement.variantId
      ) {
        onlineReturnSaleIds.push(movement.sourceDocumentId);
        onlineReturnVariantIds.push(movement.variantId);
      }
    }

    const uniq = (values: readonly string[]): string[] => [...new Set(values)];

    const [documentLines, onlineSaleLines, originalOnlineLines] = await Promise.all([
      documentLineIds.length > 0
        ? this.prisma.documentLine.findMany({
            where: { tenantId, id: { in: uniq(documentLineIds) } },
            // Ricavo LORDO: la riga porta l'imponibile in `lineTotalMinor` e il
            // lordo qui. Prima si leggeva l'imponibile, che in cassa conteneva
            // il lordo — il report resta sullo stesso numero, ora dal campo che
            // lo dichiara.
            select: { id: true, lineGrossTotalMinor: true },
          })
        : Promise.resolve([]),
      onlineSaleLineIds.length > 0
        ? this.prisma.onlineSaleLine.findMany({
            where: { tenantId, id: { in: uniq(onlineSaleLineIds) } },
            select: { id: true, totalMinor: true },
          })
        : Promise.resolve([]),
      onlineReturnSaleIds.length > 0
        ? this.prisma.onlineSaleLine.findMany({
            where: {
              tenantId,
              onlineSaleId: { in: uniq(onlineReturnSaleIds) },
              variantId: { in: uniq(onlineReturnVariantIds) },
            },
            select: { onlineSaleId: true, variantId: true, unitPriceMinor: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      documentLineTotal: new Map(documentLines.map((line) => [line.id, line.lineGrossTotalMinor])),
      onlineSaleLineTotal: new Map(onlineSaleLines.map((line) => [line.id, line.totalMinor])),
      onlineOriginalUnitPrice: new Map(
        originalOnlineLines
          .filter((line) => line.variantId != null)
          .map((line) => [
            onlineOriginalKey(line.onlineSaleId, line.variantId as string),
            line.unitPriceMinor,
          ]),
      ),
    };
  }

  private emptySummary(
    period: ReturnType<typeof resolveReportPeriod>,
    previousPeriod: ReturnType<typeof previousReportPeriod>,
  ): BusinessAnalyticsSummaryDto {
    return {
      currencyCode: 'EUR',
      period: { from: period.from, to: period.to, dayCount: period.dayCount },
      previousPeriod: {
        from: previousPeriod.from,
        to: previousPeriod.to,
        dayCount: previousPeriod.dayCount,
      },
      revenue: {
        totalMinor: 0,
        shopifyMinor: 0,
        manualMinor: 0,
        previousTotalMinor: 0,
        changePercent: null,
      },
      sales: { transactionCount: 0, unitsSold: 0, avgTicketMinor: null },
      margin: { grossMinor: null, grossPercent: null, costCoveragePercent: 0 },
      inventory: {
        stockValueMinor: 0,
        stockCostMinor: null,
        stockMarginMinor: null,
        stockMarginPercent: null,
        availableUnits: 0,
        lowStockCount: 0,
      },
      forecast: {
        avgDailyRevenueMinor: 0,
        projectedMonthRevenueMinor: 0,
        daysOfCover: null,
      },
      channels: [],
      topProducts: [],
      dailyRevenue: enumeratePeriodDates(period.from, period.to).map((date) => ({
        date,
        revenueMinor: 0,
      })),
    };
  }

  /**
   * Valorizzazione magazzino: usa il costo VARIANTE CORRENTE (§③ — dice quanto
   * vale il magazzino oggi, quindi il costo attuale è quello giusto). Non passa
   * al costo di riferimento dell'articolo.
   */
  private async aggregateInventoryValuation(
    tenantId: string,
    inventoryScope: Prisma.InventoryLevelWhereInput,
  ): Promise<{
    stockValueMinor: number;
    stockCostMinor: number | null;
    availableUnits: number;
  }> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, ...inventoryScope },
      select: {
        available: true,
        variant: {
          select: { sellingPriceMinor: true, purchasePriceMinor: true },
        },
      },
    });

    let stockValueMinor = 0;
    let stockCostMinor = 0;
    let availableUnits = 0;
    let missingCost = false;

    for (const level of levels) {
      const qty = Math.max(0, level.available);
      availableUnits += level.available;
      // Prezzo a sei decimali: si somma il valore esatto e si arrotonda una
      // volta sola, alla fine (§sei decimali).
      stockValueMinor += qty * Number(level.variant.sellingPriceMinor);
      if (level.variant.purchasePriceMinor === null) {
        missingCost = true;
      } else {
        stockCostMinor += qty * level.variant.purchasePriceMinor;
      }
    }

    return {
      stockValueMinor,
      stockCostMinor: missingCost && stockCostMinor === 0 ? null : stockCostMinor,
      availableUnits,
    };
  }

  private buildMargin(current: SalesAggregate): BusinessAnalyticsSummaryDto['margin'] {
    const costCoveragePercent =
      current.revenueMinor > 0
        ? Math.round((current.costKnownRevenueMinor / current.revenueMinor) * 1000) / 10
        : 0;

    if (current.costKnownRevenueMinor <= 0) {
      return { grossMinor: null, grossPercent: null, costCoveragePercent };
    }

    const grossMinor = current.costKnownRevenueMinor - current.costMinor;
    const grossPercent = Math.round((grossMinor / current.costKnownRevenueMinor) * 1000) / 10;

    return { grossMinor, grossPercent, costCoveragePercent };
  }

  private daysInCurrentMonth(reference: Date = new Date()): number {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }
}
