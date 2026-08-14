import type { ParamMap } from '@angular/router';

import { SalesOrderFinancialStatus, SalesOrderSource } from '@core/models/sales-order.model';

/**
 * Preset periodo per i report vendite (query param `period`).
 *
 * Due famiglie, e la differenza conta:
 *
 * - **relativi** (`7d`, `30d`, `month`, `last_month`, `year`) — si spostano col
 *   tempo, e non chiedono nient'altro. Un collegamento condiviso oggi mostrerà
 *   il mese corrente anche il mese prossimo.
 * - **di calendario** (`cal_month`, `cal_quarter`, `cal_year`) — indicano un
 *   periodo preciso e chiedono l'anno, più il mese o il trimestre.
 *
 * I selettori secondari compaiono **solo** per la famiglia che li richiede: è
 * ciò che impedisce combinazioni prive di senso come «mese corrente del 2025».
 * Stesso schema di `custom`, dove Dal/Al compaiono solo quando serve.
 *
 * Ogni preset resta **soltanto un modo di scrivere un intervallo**: la
 * traduzione avviene in un punto unico (`resolveReportDateRange`), così
 * «2° trimestre 2026» e le date scritte a mano non possono divergere.
 */
export const ReportPeriodPreset = {
  Last7Days: '7d',
  Last30Days: '30d',
  ThisMonth: 'month',
  LastMonth: 'last_month',
  ThisYear: 'year',
  CalendarMonth: 'cal_month',
  CalendarQuarter: 'cal_quarter',
  CalendarYear: 'cal_year',
  Custom: 'custom',
} as const;

export type ReportPeriodPreset = (typeof ReportPeriodPreset)[keyof typeof ReportPeriodPreset];

export interface ReportListQuery {
  readonly period: ReportPeriodPreset;
  /** YYYY-MM-DD — usato con preset `custom`. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
  /** Anno dei preset di calendario. Assente ⇒ anno corrente. */
  readonly year?: number;
  /** 1-12, solo con `cal_month`. Assente ⇒ mese corrente. */
  readonly month?: number;
  /** 1-4, solo con `cal_quarter`. Assente ⇒ trimestre corrente. */
  readonly quarter?: number;
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
    year: parseBoundedInt(params.get('year'), 2000, 2100),
    month: parseBoundedInt(params.get('month'), 1, 12),
    quarter: parseBoundedInt(params.get('quarter'), 1, 4),
    financialStatus: FINANCIAL_VALUES.has(financialStatus)
      ? (financialStatus as SalesOrderFinancialStatus)
      : undefined,
    source: SOURCE_VALUES.has(source) ? (source as SalesOrderSource) : undefined,
  };
}

/**
 * Un numero dalla barra degli indirizzi entra solo se è davvero quel numero.
 * Fuori intervallo o non numerico ⇒ `undefined`, e il periodo ricade sul
 * corrente: meglio un valore ragionevole che un intervallo assurdo costruito
 * su `?month=99`.
 */
function parseBoundedInt(raw: string | null, min: number, max: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
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
    // I periodi di calendario coprono l'intervallo INTERO, anche quando non è
    // ancora finito: «anno 2026» significa gennaio-dicembre, non «finora».
    // Un registro fiscale ragiona per periodi chiusi, e nel futuro non ci sono
    // vendite da contare.
    case ReportPeriodPreset.CalendarMonth: {
      const year = query.year ?? referenceDate.getUTCFullYear();
      const month = query.month ?? referenceDate.getUTCMonth() + 1;
      return {
        placedFrom: toIsoDate(new Date(Date.UTC(year, month - 1, 1))),
        // Giorno 0 del mese successivo = ultimo giorno di questo.
        placedTo: toIsoDate(new Date(Date.UTC(year, month, 0))),
      };
    }
    case ReportPeriodPreset.CalendarQuarter: {
      const year = query.year ?? referenceDate.getUTCFullYear();
      const quarter = query.quarter ?? Math.floor(referenceDate.getUTCMonth() / 3) + 1;
      const firstMonth = (quarter - 1) * 3;
      return {
        placedFrom: toIsoDate(new Date(Date.UTC(year, firstMonth, 1))),
        placedTo: toIsoDate(new Date(Date.UTC(year, firstMonth + 3, 0))),
      };
    }
    case ReportPeriodPreset.CalendarYear: {
      const year = query.year ?? referenceDate.getUTCFullYear();
      return {
        placedFrom: toIsoDate(new Date(Date.UTC(year, 0, 1))),
        placedTo: toIsoDate(new Date(Date.UTC(year, 12, 0))),
      };
    }
    default:
      return { placedFrom: shiftIsoDate(referenceDate, -29), placedTo };
  }
}

/** I preset che chiedono un anno, e quindi mostrano i selettori di calendario. */
export function periodNeedsYear(period: ReportPeriodPreset): boolean {
  return (
    period === ReportPeriodPreset.CalendarMonth ||
    period === ReportPeriodPreset.CalendarQuarter ||
    period === ReportPeriodPreset.CalendarYear
  );
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
