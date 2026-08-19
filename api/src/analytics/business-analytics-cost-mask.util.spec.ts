import { describe, expect, it } from 'vitest';

import { maskCostSensitiveSummary } from './business-analytics-cost-mask.util';

import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';

const summary: BusinessAnalyticsSummaryDto = {
  currencyCode: 'EUR',
  period: { from: '2026-08-01', to: '2026-08-07', dayCount: 7 },
  previousPeriod: { from: '2026-07-25', to: '2026-07-31', dayCount: 7 },
  revenue: {
    totalMinor: 100_000,
    shopifyMinor: 40_000,
    manualMinor: 60_000,
    previousTotalMinor: 90_000,
    changePercent: 11.1,
  },
  sales: { transactionCount: 12, unitsSold: 30, avgTicketMinor: 8_333 },
  margin: { grossMinor: 45_000, grossPercent: 45, costCoveragePercent: 92.5 },
  inventory: {
    stockValueMinor: 500_000,
    stockCostMinor: 280_000,
    stockMarginMinor: 220_000,
    stockMarginPercent: 44,
    availableUnits: 120,
    lowStockCount: 3,
  },
  forecast: { avgDailyRevenueMinor: 14_286, projectedMonthRevenueMinor: 442_866, daysOfCover: 28 },
  channels: [],
  topProducts: [],
  dailyRevenue: [],
};

describe('maskCostSensitiveSummary', () => {
  it('azzera margini e valorizzazione al costo (il costo si ricava per sottrazione)', () => {
    const masked = maskCostSensitiveSummary(summary);

    expect(masked.margin).toEqual({ grossMinor: null, grossPercent: null, costCoveragePercent: 0 });
    expect(masked.inventory.stockCostMinor).toBeNull();
    expect(masked.inventory.stockMarginMinor).toBeNull();
    expect(masked.inventory.stockMarginPercent).toBeNull();
  });

  it('lascia integro tutto ciò che non deriva dal costo', () => {
    const masked = maskCostSensitiveSummary(summary);

    expect(masked.revenue).toEqual(summary.revenue);
    expect(masked.sales).toEqual(summary.sales);
    expect(masked.inventory.stockValueMinor).toBe(500_000);
    expect(masked.inventory.availableUnits).toBe(120);
    expect(masked.inventory.lowStockCount).toBe(3);
    expect(masked.forecast).toEqual(summary.forecast);
  });
});
