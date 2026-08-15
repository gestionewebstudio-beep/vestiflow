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

  describe('periodi di calendario', () => {
    it('un mese preciso copre il mese intero, anche di 31 giorni', () => {
      expect(
        resolveReportDateRange(
          { period: ReportPeriodPreset.CalendarMonth, year: 2026, month: 3 },
          reference,
        ),
      ).toEqual({ placedFrom: '2026-03-01', placedTo: '2026-03-31' });
    });

    it('febbraio bisestile finisce il 29', () => {
      expect(
        resolveReportDateRange(
          { period: ReportPeriodPreset.CalendarMonth, year: 2024, month: 2 },
          reference,
        ),
      ).toEqual({ placedFrom: '2024-02-01', placedTo: '2024-02-29' });
    });

    it('i quattro trimestri coprono l anno senza buchi né sovrapposizioni', () => {
      const ranges = [1, 2, 3, 4].map((quarter) =>
        resolveReportDateRange(
          { period: ReportPeriodPreset.CalendarQuarter, year: 2026, quarter },
          reference,
        ),
      );

      expect(ranges).toEqual([
        { placedFrom: '2026-01-01', placedTo: '2026-03-31' },
        { placedFrom: '2026-04-01', placedTo: '2026-06-30' },
        { placedFrom: '2026-07-01', placedTo: '2026-09-30' },
        { placedFrom: '2026-10-01', placedTo: '2026-12-31' },
      ]);
      // Il giorno dopo la fine di un trimestre è l'inizio del successivo.
      for (let i = 0; i < 3; i += 1) {
        const dayAfter = new Date(`${ranges[i]!.placedTo}T00:00:00.000Z`);
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
        expect(dayAfter.toISOString().slice(0, 10)).toBe(ranges[i + 1]!.placedFrom);
      }
    });

    it('un anno preciso va da gennaio a dicembre, non «finora»', () => {
      // Il riferimento è giugno 2026: un preset di calendario rappresenta
      // l'intero intervallo del periodo scelto, non la parte già trascorsa.
      expect(
        resolveReportDateRange({ period: ReportPeriodPreset.CalendarYear, year: 2026 }, reference),
      ).toEqual({ placedFrom: '2026-01-01', placedTo: '2026-12-31' });
    });

    it('senza anno o mese ricade sul periodo corrente', () => {
      expect(
        resolveReportDateRange({ period: ReportPeriodPreset.CalendarMonth }, reference),
      ).toEqual({ placedFrom: '2026-06-01', placedTo: '2026-06-30' });
      expect(
        resolveReportDateRange({ period: ReportPeriodPreset.CalendarQuarter }, reference),
      ).toEqual({ placedFrom: '2026-04-01', placedTo: '2026-06-30' });
    });

    it('un mese di calendario e le stesse date scritte a mano danno lo stesso intervallo', () => {
      // È la ragione per cui la traduzione vive in un punto solo: se divergessero,
      // «marzo» e «01/03 → 31/03» darebbero due registri diversi.
      const daPreset = resolveReportDateRange(
        { period: ReportPeriodPreset.CalendarMonth, year: 2026, month: 3 },
        reference,
      );
      const daMano = resolveReportDateRange(
        { period: ReportPeriodPreset.Custom, dateFrom: '2026-03-01', dateTo: '2026-03-31' },
        reference,
      );
      expect(daPreset).toEqual(daMano);
    });

    it('un parametro fuori intervallo non costruisce un periodo assurdo', () => {
      const params = new Map([
        ['period', 'cal_month'],
        ['month', '99'],
        ['year', '1234'],
      ]);
      const query = parseReportListQuery({
        get: (key: string) => params.get(key) ?? null,
        has: (key: string) => params.has(key),
        getAll: () => [],
        keys: [...params.keys()],
      });

      expect(query.month).toBeUndefined();
      expect(query.year).toBeUndefined();
      // Ricade sul mese corrente invece di inventarsi un mese 99.
      expect(resolveReportDateRange(query, reference)).toEqual({
        placedFrom: '2026-06-01',
        placedTo: '2026-06-30',
      });
    });
  });
});
