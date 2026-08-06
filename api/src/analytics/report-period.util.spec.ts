import { describe, expect, it } from 'vitest';

import {
  enumeratePeriodDates,
  previousReportPeriod,
  ReportPeriodPreset,
  resolveReportPeriod,
} from './report-period.util';

describe('report-period.util', () => {
  it('resolveReportPeriod ultimi 30 giorni', () => {
    const period = resolveReportPeriod(
      { period: ReportPeriodPreset.Last30Days },
      new Date('2026-06-30T12:00:00.000Z'),
    );
    expect(period.from).toBe('2026-06-01');
    expect(period.to).toBe('2026-06-30');
    expect(period.dayCount).toBe(30);
  });

  it('previousReportPeriod mantiene la stessa durata', () => {
    const current = resolveReportPeriod(
      { period: ReportPeriodPreset.Last7Days },
      new Date('2026-06-30T12:00:00.000Z'),
    );
    const previous = previousReportPeriod(current);
    expect(previous.dayCount).toBe(current.dayCount);
    expect(previous.to).toBe('2026-06-23');
  });

  it('enumeratePeriodDates elenca i giorni inclusivi', () => {
    expect(enumeratePeriodDates('2026-06-28', '2026-06-30')).toEqual([
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
    ]);
  });
});
