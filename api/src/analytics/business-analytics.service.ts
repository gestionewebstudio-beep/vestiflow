import { Injectable } from '@nestjs/common';
import {
  MovementOrigin,
  Prisma,
  SalesOrderFinancialStatus,
  StockMovementType,
} from '@prisma/client';

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
  enumeratePeriodDates,
  periodDateTimeRange,
  previousReportPeriod,
  resolveReportPeriod,
  toUtcIsoDate,
} from './report-period.util';

interface RevenueAccumulator {
  revenueMinor: number;
  costMinor: number;
  costKnownRevenueMinor: number;
  unitsSold: number;
  transactionCount: number;
}

interface ProductAccumulator {
  sku: string;
  title: string;
  revenueMinor: number;
  unitsSold: number;
}

type ManualSalesAccumulator = RevenueAccumulator & {
  byOrigin: Partial<Record<MovementOrigin, { revenueMinor: number; unitsSold: number }>>;
  topProducts: Map<string, ProductAccumulator>;
};

type ShopifySalesAccumulator = RevenueAccumulator & {
  topProducts: Map<string, ProductAccumulator>;
};

const REVENUE_FINANCIAL_STATUSES: SalesOrderFinancialStatus[] = [
  SalesOrderFinancialStatus.paid,
  SalesOrderFinancialStatus.partially_refunded,
];

const MANUAL_ORIGINS: MovementOrigin[] = [
  MovementOrigin.vestiflow_pos,
  MovementOrigin.vestiflow_online,
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

    const [shopifyCurrent, shopifyPrevious, manualCurrent, manualPrevious, inventoryAgg, lowStockCount, dailyRevenue] =
      await Promise.all([
        this.aggregateShopifySales(tenantId, currentRange),
        this.aggregateShopifySales(tenantId, previousRange),
        this.aggregateManualSales(tenantId, currentRange, movementScope),
        this.aggregateManualSales(tenantId, previousRange, movementScope),
        this.aggregateInventoryValuation(tenantId, inventoryScope),
        this.prisma.inventoryLevel.count({
          where: {
            tenantId,
            ...inventoryScope,
            available: { lte: this.prisma.inventoryLevel.fields.minThreshold },
          },
        }),
        this.aggregateDailyRevenue(tenantId, currentRange, period, movementScope),
      ]);

    const current = this.mergeAccumulators(shopifyCurrent, manualCurrent);
    const previous = this.mergeAccumulators(shopifyPrevious, manualPrevious);

    const changePercent =
      previous.revenueMinor > 0
        ? Math.round(((current.revenueMinor - previous.revenueMinor) / previous.revenueMinor) * 1000) /
          10
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

    const channels: BusinessAnalyticsSummaryDto['channels'] = [
      {
        channel: 'shopify',
        label: 'Shopify',
        revenueMinor: shopifyCurrent.revenueMinor,
        unitsSold: shopifyCurrent.unitsSold,
      },
      {
        channel: 'pos',
        label: 'Negozio fisico',
        revenueMinor: manualCurrent.byOrigin[MovementOrigin.vestiflow_pos]?.revenueMinor ?? 0,
        unitsSold: manualCurrent.byOrigin[MovementOrigin.vestiflow_pos]?.unitsSold ?? 0,
      },
      {
        channel: 'online_manual',
        label: onlineLabel,
        revenueMinor: manualCurrent.byOrigin[MovementOrigin.vestiflow_online]?.revenueMinor ?? 0,
        unitsSold: manualCurrent.byOrigin[MovementOrigin.vestiflow_online]?.unitsSold ?? 0,
      },
    ].filter((row) => row.revenueMinor !== 0 || row.unitsSold !== 0);

    const topProducts = this.mergeTopProducts(shopifyCurrent.topProducts, manualCurrent.topProducts);

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
        shopifyMinor: shopifyCurrent.revenueMinor,
        manualMinor: manualCurrent.revenueMinor,
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
      topProducts,
      dailyRevenue,
    };
  }

  private async aggregateDailyRevenue(
    tenantId: string,
    range: { gte: Date; lte: Date },
    period: ReturnType<typeof resolveReportPeriod>,
    movementScope: Prisma.StockMovementWhereInput,
  ): Promise<BusinessAnalyticsSummaryDto['dailyRevenue']> {
    const [orders, movements] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: {
          tenantId,
          financialStatus: { in: REVENUE_FINANCIAL_STATUSES },
          placedAt: range,
        },
        select: { placedAt: true, totalMinor: true },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...movementScope,
          type: { in: [StockMovementType.sale, StockMovementType.return] },
          origin: { in: MANUAL_ORIGINS },
          createdAt: range,
        },
        select: {
          type: true,
          quantity: true,
          createdAt: true,
          variant: { select: { sellingPriceMinor: true } },
        },
      }),
    ]);

    const buckets = new Map<string, number>(
      enumeratePeriodDates(period.from, period.to).map((date) => [date, 0]),
    );

    for (const order of orders) {
      const date = toUtcIsoDate(order.placedAt);
      if (buckets.has(date)) {
        buckets.set(date, (buckets.get(date) ?? 0) + order.totalMinor);
      }
    }

    for (const movement of movements) {
      const date = toUtcIsoDate(movement.createdAt);
      if (!buckets.has(date)) {
        continue;
      }
      const sign = movement.type === StockMovementType.sale ? 1 : -1;
      const lineRevenue = sign * movement.quantity * movement.variant.sellingPriceMinor;
      buckets.set(date, (buckets.get(date) ?? 0) + lineRevenue);
    }

    return enumeratePeriodDates(period.from, period.to).map((date) => ({
      date,
      revenueMinor: buckets.get(date) ?? 0,
    }));
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

  private async aggregateShopifySales(
    tenantId: string,
    range: { gte: Date; lte: Date },
  ): Promise<ShopifySalesAccumulator> {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        financialStatus: { in: REVENUE_FINANCIAL_STATUSES },
        placedAt: range,
      },
      select: {
        totalMinor: true,
        lines: {
          select: {
            sku: true,
            title: true,
            quantity: true,
            totalMinor: true,
            variantId: true,
          },
        },
      },
    });

    const variantIds = [
      ...new Set(
        orders.flatMap((order) => order.lines.map((line) => line.variantId).filter(Boolean)),
      ),
    ] as string[];

    const purchaseByVariant = new Map<string, number>();
    if (variantIds.length > 0) {
      const variants = await this.prisma.productVariant.findMany({
        where: { tenantId, id: { in: variantIds } },
        select: { id: true, purchasePriceMinor: true },
      });
      for (const variant of variants) {
        if (variant.purchasePriceMinor !== null) {
          purchaseByVariant.set(variant.id, variant.purchasePriceMinor);
        }
      }
    }

    const acc: ShopifySalesAccumulator = {
      revenueMinor: 0,
      costMinor: 0,
      costKnownRevenueMinor: 0,
      unitsSold: 0,
      transactionCount: 0,
      topProducts: new Map(),
    };

    for (const order of orders) {
      acc.transactionCount += 1;
      acc.revenueMinor += order.totalMinor;

      for (const line of order.lines) {
        acc.unitsSold += line.quantity;
        this.addProductRow(acc.topProducts, line.sku, line.title, line.totalMinor, line.quantity);

        const purchase = line.variantId ? purchaseByVariant.get(line.variantId) : undefined;
        if (purchase !== undefined) {
          acc.costMinor += purchase * line.quantity;
          acc.costKnownRevenueMinor += line.totalMinor;
        }
      }
    }

    return acc;
  }

  private async aggregateManualSales(
    tenantId: string,
    range: { gte: Date; lte: Date },
    movementScope: Prisma.StockMovementWhereInput,
  ): Promise<ManualSalesAccumulator> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...movementScope,
        type: { in: [StockMovementType.sale, StockMovementType.return] },
        origin: { in: MANUAL_ORIGINS },
        createdAt: range,
      },
      select: {
        type: true,
        origin: true,
        quantity: true,
        sku: true,
        variant: {
          select: {
            sellingPriceMinor: true,
            purchasePriceMinor: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    const acc: ManualSalesAccumulator = {
      revenueMinor: 0,
      costMinor: 0,
      costKnownRevenueMinor: 0,
      unitsSold: 0,
      transactionCount: 0,
      byOrigin: {},
      topProducts: new Map(),
    };

    for (const movement of movements) {
      const sign = movement.type === StockMovementType.sale ? 1 : -1;
      const lineRevenue = sign * movement.quantity * movement.variant.sellingPriceMinor;
      const lineUnits = sign * movement.quantity;
      const title = movement.variant.product.name;

      acc.transactionCount += 1;
      acc.revenueMinor += lineRevenue;
      acc.unitsSold += lineUnits;
      this.addProductRow(acc.topProducts, movement.sku, title, lineRevenue, lineUnits);

      const origin = movement.origin;
      const bucket = acc.byOrigin[origin] ?? { revenueMinor: 0, unitsSold: 0 };
      bucket.revenueMinor += lineRevenue;
      bucket.unitsSold += lineUnits;
      acc.byOrigin[origin] = bucket;

      if (movement.variant.purchasePriceMinor !== null) {
        acc.costMinor += sign * movement.quantity * movement.variant.purchasePriceMinor;
        acc.costKnownRevenueMinor += lineRevenue;
      }
    }

    return acc;
  }

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
      stockValueMinor += qty * level.variant.sellingPriceMinor;
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

  private mergeAccumulators(
    shopify: RevenueAccumulator,
    manual: RevenueAccumulator,
  ): RevenueAccumulator {
    return {
      revenueMinor: shopify.revenueMinor + manual.revenueMinor,
      costMinor: shopify.costMinor + manual.costMinor,
      costKnownRevenueMinor: shopify.costKnownRevenueMinor + manual.costKnownRevenueMinor,
      unitsSold: shopify.unitsSold + manual.unitsSold,
      transactionCount: shopify.transactionCount + manual.transactionCount,
    };
  }

  private buildMargin(current: RevenueAccumulator): BusinessAnalyticsSummaryDto['margin'] {
    const costCoveragePercent =
      current.revenueMinor > 0
        ? Math.round((current.costKnownRevenueMinor / current.revenueMinor) * 1000) / 10
        : 0;

    if (current.costKnownRevenueMinor <= 0) {
      return { grossMinor: null, grossPercent: null, costCoveragePercent };
    }

    const grossMinor = current.costKnownRevenueMinor - current.costMinor;
    const grossPercent =
      Math.round((grossMinor / current.costKnownRevenueMinor) * 1000) / 10;

    return { grossMinor, grossPercent, costCoveragePercent };
  }

  private addProductRow(
    map: Map<string, ProductAccumulator>,
    sku: string,
    title: string,
    revenueMinor: number,
    unitsSold: number,
  ): void {
    const existing = map.get(sku);
    if (existing) {
      existing.revenueMinor += revenueMinor;
      existing.unitsSold += unitsSold;
      return;
    }
    map.set(sku, { sku, title, revenueMinor, unitsSold });
  }

  private mergeTopProducts(
    shopify: Map<string, ProductAccumulator>,
    manual: Map<string, ProductAccumulator>,
  ): BusinessAnalyticsSummaryDto['topProducts'] {
    const merged = new Map<string, ProductAccumulator>();
    for (const map of [shopify, manual]) {
      for (const [sku, row] of map) {
        const existing = merged.get(sku);
        if (existing) {
          existing.revenueMinor += row.revenueMinor;
          existing.unitsSold += row.unitsSold;
        } else {
          merged.set(sku, { ...row });
        }
      }
    }

    return [...merged.values()]
      .filter((row) => row.revenueMinor > 0)
      .sort((a, b) => b.revenueMinor - a.revenueMinor)
      .slice(0, 10);
  }

  private daysInCurrentMonth(reference: Date = new Date()): number {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }
}
