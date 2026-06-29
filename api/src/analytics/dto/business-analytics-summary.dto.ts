export interface BusinessAnalyticsPeriodDto {
  readonly from: string;
  readonly to: string;
  readonly dayCount: number;
}

export interface BusinessAnalyticsRevenueDto {
  readonly totalMinor: number;
  readonly shopifyMinor: number;
  readonly manualMinor: number;
  readonly previousTotalMinor: number;
  readonly changePercent: number | null;
}

export interface BusinessAnalyticsSalesDto {
  readonly transactionCount: number;
  readonly unitsSold: number;
  readonly avgTicketMinor: number | null;
}

export interface BusinessAnalyticsMarginDto {
  readonly grossMinor: number | null;
  readonly grossPercent: number | null;
  /** Quota del fatturato con costo d'acquisto noto (0–100). */
  readonly costCoveragePercent: number;
}

export interface BusinessAnalyticsInventoryDto {
  readonly stockValueMinor: number;
  readonly stockCostMinor: number | null;
  readonly stockMarginMinor: number | null;
  readonly stockMarginPercent: number | null;
  readonly availableUnits: number;
  readonly lowStockCount: number;
}

export interface BusinessAnalyticsForecastDto {
  readonly avgDailyRevenueMinor: number;
  readonly projectedMonthRevenueMinor: number;
  readonly daysOfCover: number | null;
}

export interface BusinessAnalyticsChannelRowDto {
  readonly channel: string;
  readonly label: string;
  readonly revenueMinor: number;
  readonly unitsSold: number;
}

export interface BusinessAnalyticsTopProductDto {
  readonly sku: string;
  readonly title: string;
  readonly revenueMinor: number;
  readonly unitsSold: number;
}

export interface BusinessAnalyticsDailyRevenueDto {
  readonly date: string;
  readonly revenueMinor: number;
}

export interface BusinessAnalyticsSummaryDto {
  readonly currencyCode: string;
  readonly period: BusinessAnalyticsPeriodDto;
  readonly previousPeriod: BusinessAnalyticsPeriodDto;
  readonly revenue: BusinessAnalyticsRevenueDto;
  readonly sales: BusinessAnalyticsSalesDto;
  readonly margin: BusinessAnalyticsMarginDto;
  readonly inventory: BusinessAnalyticsInventoryDto;
  readonly forecast: BusinessAnalyticsForecastDto;
  readonly channels: readonly BusinessAnalyticsChannelRowDto[];
  readonly topProducts: readonly BusinessAnalyticsTopProductDto[];
  readonly dailyRevenue: readonly BusinessAnalyticsDailyRevenueDto[];
}
