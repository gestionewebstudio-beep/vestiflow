import { describe, expect, it } from 'vitest';

import {
  buildCalendarMonthGrid,
  formatItalianInputDate,
  parseIsoDateLocal,
  parseItalianDateInput,
  toIsoDateLocal,
  viewMonthFromIso,
} from './calendar.util';

describe('calendar.util', () => {
  it('converte date locali in ISO', () => {
    expect(toIsoDateLocal(new Date(2026, 5, 24))).toBe('2026-06-24');
  });

  it('formatta ISO in dd/MM/yyyy', () => {
    expect(formatItalianInputDate('2026-06-24')).toBe('24/06/2026');
  });

  it('genera 42 celle con lunedì come primo giorno', () => {
    const grid = buildCalendarMonthGrid(2026, 5, '2026-06-24');
    expect(grid).toHaveLength(42);
    expect(grid.find((cell) => cell.isSelected)?.iso).toBe('2026-06-24');
  });

  it('viewMonthFromIso usa fallback su valore invalido', () => {
    const view = viewMonthFromIso('invalid', new Date(2026, 0, 15));
    expect(view).toEqual({ year: 2026, monthIndex: 0 });
  });

  it('parseIsoDateLocal rifiuta date invalide', () => {
    expect(parseIsoDateLocal('2026-02-31')).toBeNull();
  });

  describe('parseItalianDateInput', () => {
    it('accetta GG/MM/AAAA completo', () => {
      expect(parseItalianDateInput('11/07/2026')).toBe('2026-07-11');
    });

    it('normalizza G/M/AAAA in ISO senza slittamenti', () => {
      expect(parseItalianDateInput('1/7/2026')).toBe('2026-07-01');
    });

    it('accetta separatori . e -', () => {
      expect(parseItalianDateInput('11.07.2026')).toBe('2026-07-11');
      expect(parseItalianDateInput('11-07-2026')).toBe('2026-07-11');
    });

    it('espande anno a due cifre come 20xx', () => {
      expect(parseItalianDateInput('11/07/26')).toBe('2026-07-11');
    });

    it('rifiuta date inesistenti', () => {
      expect(parseItalianDateInput('31/02/2026')).toBeNull();
    });

    it('rifiuta date incomplete o testo libero', () => {
      expect(parseItalianDateInput('11/07')).toBeNull();
      expect(parseItalianDateInput('domani')).toBeNull();
      expect(parseItalianDateInput('')).toBeNull();
    });
  });
});
