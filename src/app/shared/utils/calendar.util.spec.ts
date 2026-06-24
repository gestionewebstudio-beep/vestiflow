import { describe, expect, it } from 'vitest';

import {
  buildCalendarMonthGrid,
  formatItalianInputDate,
  parseIsoDateLocal,
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
});
