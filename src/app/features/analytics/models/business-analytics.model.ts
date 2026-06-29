import type { Money } from '@core/models/common.model';

export interface BusinessAnalyticsPeriod {
  readonly from: string;
  readonly to: string;
  readonly dayCount: number;
}

export interface BusinessAnalyticsRevenue {
  readonly totalMinor: number;
  readonly shopifyMinor: number;
  readonly manualMinor: number;
  readonly previousTotalMinor: number;
  readonly changePercent: number | null;
}

export interface BusinessAnalyticsSales {
  readonly transactionCount: number;
  readonly unitsSold: number;
  readonly avgTicketMinor: number | null;
}

export interface BusinessAnalyticsMargin {
  readonly grossMinor: number | null;
  readonly grossPercent: number | null;
  readonly costCoveragePercent: number;
}

export interface BusinessAnalyticsInventory {
  readonly stockValueMinor: number;
  readonly stockCostMinor: number | null;
  readonly stockMarginMinor: number | null;
  readonly stockMarginPercent: number | null;
  readonly availableUnits: number;
  readonly lowStockCount: number;
}

export interface BusinessAnalyticsForecast {
  readonly avgDailyRevenueMinor: number;
  readonly projectedMonthRevenueMinor: number;
  readonly daysOfCover: number | null;
}

export interface BusinessAnalyticsChannelRow {
  readonly channel: string;
  readonly label: string;
  readonly revenueMinor: number;
  readonly unitsSold: number;
}

export interface BusinessAnalyticsTopProduct {
  readonly sku: string;
  readonly title: string;
  readonly revenueMinor: number;
  readonly unitsSold: number;
}

export interface BusinessAnalyticsDailyRevenue {
  readonly date: string;
  readonly revenueMinor: number;
}

export interface BusinessAnalyticsSummary {
  readonly currencyCode: string;
  readonly period: BusinessAnalyticsPeriod;
  readonly previousPeriod: BusinessAnalyticsPeriod;
  readonly revenue: BusinessAnalyticsRevenue;
  readonly sales: BusinessAnalyticsSales;
  readonly margin: BusinessAnalyticsMargin;
  readonly inventory: BusinessAnalyticsInventory;
  readonly forecast: BusinessAnalyticsForecast;
  readonly channels: readonly BusinessAnalyticsChannelRow[];
  readonly topProducts: readonly BusinessAnalyticsTopProduct[];
  readonly dailyRevenue: readonly BusinessAnalyticsDailyRevenue[];
}

export interface BusinessAnalyticsQuery {
  readonly period?: string;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: string;
}

export interface BusinessAnalyticsChannelDisplayRow extends BusinessAnalyticsChannelRow {
  readonly revenue: Money;
}

export interface BusinessAnalyticsTopProductDisplayRow extends BusinessAnalyticsTopProduct {
  readonly revenue: Money;
}
