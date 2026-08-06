import type { ParamMap } from '@angular/router';

import { SalesOrderFinancialStatus, SalesOrderSource } from '@core/models/sales-order.model';

/** Preset periodo per i report vendite (query param `period`). */
export const ReportPeriodPreset = {
  Last7Days: '7d',
  Last30Days: '30d',
  ThisMonth: 'month',
  LastMonth: 'last_month',
  ThisYear: 'year',
  Custom: 'custom',
} as const;

export type ReportPeriodPreset = (typeof ReportPeriodPreset)[keyof typeof ReportPeriodPreset];

export interface ReportListQuery {
  readonly period: ReportPeriodPreset;
  /** YYYY-MM-DD — usato con preset `custom`. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly source?: SalesOrderSource;
  readonly financialStatus?: SalesOrderFinancialStatus;
}

export interface ReportDateRange {
  readonly placedFrom: string;
  readonly placedTo: string;
}

const PERIOD_VALUES = new Set<string>(Object.values(ReportPeriodPreset));
const FINANCIAL_VALUES = new Set<string>(Object.values(SalesOrderFinancialStatus));
const SOURCE_VALUES = new Set<string>(Object.values(SalesOrderSource));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_REPORT_PERIOD = ReportPeriodPreset.Last30Days;

export function parseReportListQuery(params: ParamMap): ReportListQuery {
  const periodParam = params.get('period') ?? DEFAULT_REPORT_PERIOD;
  const period = PERIOD_VALUES.has(periodParam)
    ? (periodParam as ReportPeriodPreset)
    : DEFAULT_REPORT_PERIOD;

  const dateFrom = params.get('from')?.trim();
  const dateTo = params.get('to')?.trim();
  const financialStatus = params.get('financialStatus') ?? '';
  const source = params.get('source') ?? '';

  return {
    period,
    dateFrom: dateFrom && ISO_DATE.test(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && ISO_DATE.test(dateTo) ? dateTo : undefined,
    financialStatus: FINANCIAL_VALUES.has(financialStatus)
      ? (financialStatus as SalesOrderFinancialStatus)
      : undefined,
    source: SOURCE_VALUES.has(source) ? (source as SalesOrderSource) : undefined,
  };
}

/** Converte preset + date custom in intervallo ISO inclusivo per l'API vendite. */
export function resolveReportDateRange(
  query: ReportListQuery,
  referenceDate: Date = new Date(),
): ReportDateRange {
  if (query.period === ReportPeriodPreset.Custom) {
    const placedFrom = query.dateFrom ?? toIsoDate(referenceDate);
    const placedTo = query.dateTo ?? placedFrom;
    return placedFrom <= placedTo
      ? { placedFrom, placedTo }
      : { placedFrom: placedTo, placedTo: placedFrom };
  }

  const placedTo = toIsoDate(referenceDate);

  switch (query.period) {
    case ReportPeriodPreset.Last7Days:
      return { placedFrom: shiftIsoDate(referenceDate, -6), placedTo };
    case ReportPeriodPreset.Last30Days:
      return { placedFrom: shiftIsoDate(referenceDate, -29), placedTo };
    case ReportPeriodPreset.ThisMonth:
      return {
        placedFrom: toIsoDate(
          new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)),
        ),
        placedTo,
      };
    case ReportPeriodPreset.LastMonth: {
      const firstThisMonth = new Date(
        Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
      );
      const lastPrevMonth = new Date(firstThisMonth.getTime() - 86_400_000);
      const firstPrevMonth = new Date(
        Date.UTC(lastPrevMonth.getUTCFullYear(), lastPrevMonth.getUTCMonth(), 1),
      );
      return { placedFrom: toIsoDate(firstPrevMonth), placedTo: toIsoDate(lastPrevMonth) };
    }
    case ReportPeriodPreset.ThisYear:
      return {
        placedFrom: toIsoDate(new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1))),
        placedTo,
      };
    default:
      return { placedFrom: shiftIsoDate(referenceDate, -29), placedTo };
  }
}

export function formatReportPeriodLabel(
  query: ReportListQuery,
  referenceDate: Date = new Date(),
): string {
  const range = resolveReportDateRange(query, referenceDate);
  const fromLabel = formatItalianDate(range.placedFrom);
  const toLabel = formatItalianDate(range.placedTo);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(reference: Date, dayOffset: number): string {
  const shifted = new Date(reference);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return toIsoDate(shifted);
}

function formatItalianDate(isoDate: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(
    new Date(`${isoDate}T12:00:00.000Z`),
  );
}

/** Periodo corrispettivi su route vendite (`corrPeriod`, `corrFrom`, `corrTo`). */
export function parseSalesCorrispettiviPeriodQuery(params: ParamMap): ReportListQuery {
  const periodParam = params.get('corrPeriod') ?? DEFAULT_REPORT_PERIOD;
  const period = PERIOD_VALUES.has(periodParam)
    ? (periodParam as ReportPeriodPreset)
    : DEFAULT_REPORT_PERIOD;

  const dateFrom = params.get('corrFrom')?.trim();
  const dateTo = params.get('corrTo')?.trim();

  return {
    period,
    dateFrom: dateFrom && ISO_DATE.test(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && ISO_DATE.test(dateTo) ? dateTo : undefined,
  };
}
