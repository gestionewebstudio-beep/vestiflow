import { SalesOrderFinancialStatus } from '@core/models/sales-order.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import type { Money } from '@core/models/common.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type { SalesReportRow } from './report-view.model';

export interface SalesReportSummary {
  readonly revenueMinor: number;
  readonly orderCount: number;
  readonly unitsSold: number;
}

/** Fatturato lordo: ordini pagati o con rimborso parziale. */
export function computeSalesReportSummary(orders: readonly SalesOrder[]): SalesReportSummary {
  let revenueMinor = 0;
  let orderCount = 0;
  let unitsSold = 0;

  for (const order of orders) {
    orderCount += 1;
    const countsTowardRevenue =
      order.financialStatus === SalesOrderFinancialStatus.Paid ||
      order.financialStatus === SalesOrderFinancialStatus.PartiallyRefunded;

    if (countsTowardRevenue) {
      revenueMinor += order.total.amountMinor;
    }

    const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (countsTowardRevenue) {
      unitsSold += units;
    }
  }

  return { revenueMinor, orderCount, unitsSold };
}

export function aggregateSalesReportRows(orders: readonly SalesOrder[]): readonly SalesReportRow[] {
  const byStatus = new Map<SalesOrder['financialStatus'], SalesReportRow>();

  for (const order of orders) {
    const existing = byStatus.get(order.financialStatus);
    const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);

    if (existing) {
      byStatus.set(order.financialStatus, {
        status: order.financialStatus,
        orders: existing.orders + 1,
        units: existing.units + units,
        total: {
          amountMinor: existing.total.amountMinor + order.total.amountMinor,
          currencyCode: existing.total.currencyCode,
        },
      });
    } else {
      byStatus.set(order.financialStatus, {
        status: order.financialStatus,
        orders: 1,
        units,
        total: order.total,
      });
    }
  }

  return [...byStatus.values()].sort((a, b) => b.total.amountMinor - a.total.amountMinor);
}

export function eurMoney(amountMinor: number): Money {
  return { amountMinor, currencyCode: DEFAULT_CURRENCY };
}
