/** Preset periodo allineati al frontend (`report-list-query.model.ts`). */
export const ReportPeriodPreset = {
  Last7Days: '7d',
  Last30Days: '30d',
  ThisMonth: 'month',
  LastMonth: 'last_month',
  ThisYear: 'year',
  Custom: 'custom',
} as const;

export type ReportPeriodPreset = (typeof ReportPeriodPreset)[keyof typeof ReportPeriodPreset];

const PRESET_VALUES = new Set<string>(Object.values(ReportPeriodPreset));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedReportPeriod {
  readonly preset: ReportPeriodPreset;
  readonly from: string;
  readonly to: string;
  readonly dayCount: number;
}

export interface BusinessAnalyticsQueryPeriod {
  readonly period?: string;
  readonly from?: string;
  readonly to?: string;
}

export function parseReportPeriodPreset(value: string | undefined): ReportPeriodPreset {
  if (value && PRESET_VALUES.has(value)) {
    return value as ReportPeriodPreset;
  }
  return ReportPeriodPreset.Last30Days;
}

export function resolveReportPeriod(
  query: BusinessAnalyticsQueryPeriod,
  referenceDate: Date = new Date(),
): ResolvedReportPeriod {
  const preset = parseReportPeriodPreset(query.period);

  if (preset === ReportPeriodPreset.Custom) {
    const from = query.from && ISO_DATE.test(query.from) ? query.from : toIsoDate(referenceDate);
    const to = query.to && ISO_DATE.test(query.to) ? query.to : from;
    const normalized = from <= to ? { from, to } : { from: to, to: from };
    return {
      preset,
      from: normalized.from,
      to: normalized.to,
      dayCount: inclusiveDayCount(normalized.from, normalized.to),
    };
  }

  const to = toIsoDate(referenceDate);

  switch (preset) {
    case ReportPeriodPreset.Last7Days:
      return {
        preset,
        from: shiftIsoDate(referenceDate, -6),
        to,
        dayCount: 7,
      };
    case ReportPeriodPreset.ThisMonth:
      return {
        preset,
        from: toIsoDate(
          new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)),
        ),
        to,
        dayCount: inclusiveDayCount(
          toIsoDate(
            new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)),
          ),
          to,
        ),
      };
    case ReportPeriodPreset.LastMonth: {
      const firstThisMonth = new Date(
        Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
      );
      const lastPrevMonth = new Date(firstThisMonth.getTime() - 86_400_000);
      const firstPrevMonth = new Date(
        Date.UTC(lastPrevMonth.getUTCFullYear(), lastPrevMonth.getUTCMonth(), 1),
      );
      const from = toIsoDate(firstPrevMonth);
      const last = toIsoDate(lastPrevMonth);
      return { preset, from, to: last, dayCount: inclusiveDayCount(from, last) };
    }
    case ReportPeriodPreset.ThisYear:
      return {
        preset,
        from: toIsoDate(new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1))),
        to,
        dayCount: inclusiveDayCount(
          toIsoDate(new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1))),
          to,
        ),
      };
    case ReportPeriodPreset.Last30Days:
    default:
      return {
        preset: ReportPeriodPreset.Last30Days,
        from: shiftIsoDate(referenceDate, -29),
        to,
        dayCount: 30,
      };
  }
}

/** Periodo precedente della stessa durata, immediatamente prima del corrente. */
export function previousReportPeriod(current: ResolvedReportPeriod): ResolvedReportPeriod {
  const start = parseUtcDate(current.from);
  const end = parseUtcDate(current.to);
  const spanMs = end.getTime() - start.getTime() + 86_400_000;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - spanMs + 86_400_000);
  const from = toIsoDate(previousStart);
  const to = toIsoDate(previousEnd);
  return {
    preset: current.preset,
    from,
    to,
    dayCount: inclusiveDayCount(from, to),
  };
}

export function periodDateTimeRange(period: ResolvedReportPeriod): {
  readonly gte: Date;
  readonly lte: Date;
} {
  return {
    gte: new Date(`${period.from}T00:00:00.000Z`),
    lte: new Date(`${period.to}T23:59:59.999Z`),
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(reference: Date, dayOffset: number): string {
  const shifted = new Date(reference);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return toIsoDate(shifted);
}

function parseUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function inclusiveDayCount(from: string, to: string): number {
  const start = parseUtcDate(from);
  const end = parseUtcDate(to);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** Giorni ISO inclusivi da `from` a `to` (UTC). */
export function enumeratePeriodDates(from: string, to: string): readonly string[] {
  const dates: string[] = [];
  const cursor = parseUtcDate(from);
  const end = parseUtcDate(to);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function toUtcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
