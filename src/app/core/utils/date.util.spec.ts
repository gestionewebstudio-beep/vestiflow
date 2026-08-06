import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from './date.util';

describe('date.util', () => {
  it('formatDate produce una stringa leggibile in locale it-IT', () => {
    const result = formatDate('2026-06-09T12:00:00.000Z');
    expect(result).toMatch(/9.*giu.*2026/i);
  });

  it('formatDateTime include data e ora', () => {
    const result = formatDateTime('2026-06-09T14:30:00.000Z');
    expect(result).toMatch(/9.*giu.*2026/i);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
