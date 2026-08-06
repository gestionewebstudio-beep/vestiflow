import { describe, expect, it } from 'vitest';

import { ReportPeriodPreset } from './report-list-query.model';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  resolveReportDateRange,
} from './report-list-query.model';

describe('report-list-query.model', () => {
  const reference = new Date('2026-06-22T15:00:00.000Z');

  it('parseReportListQuery usa default 30 giorni', () => {
    const query = parseReportListQuery({
      get: () => null,
      has: () => false,
      getAll: () => [],
      keys: [],
    });

    expect(query.period).toBe(ReportPeriodPreset.Last30Days);
  });

  it('resolveReportDateRange calcola ultimi 7 giorni inclusivi', () => {
    const range = resolveReportDateRange({ period: ReportPeriodPreset.Last7Days }, reference);
    expect(range.placedFrom).toBe('2026-06-16');
    expect(range.placedTo).toBe('2026-06-22');
  });

  it('resolveReportDateRange gestisce custom con date invertite', () => {
    const range = resolveReportDateRange(
      {
        period: ReportPeriodPreset.Custom,
        dateFrom: '2026-06-10',
        dateTo: '2026-06-01',
      },
      reference,
    );
    expect(range.placedFrom).toBe('2026-06-01');
    expect(range.placedTo).toBe('2026-06-10');
  });

  it('formatReportPeriodLabel mostra intervallo', () => {
    const label = formatReportPeriodLabel({ period: ReportPeriodPreset.Last7Days }, reference);
    expect(label).toContain('–');
  });
});
