import { describe, expect, it } from 'vitest';

import { applyDiscountMinor, parseEffectiveDiscountPercent } from './discount-percent.util';

describe('parseEffectiveDiscountPercent', () => {
  it('restituisce 0 per input vuoto', () => {
    expect(parseEffectiveDiscountPercent('')).toBe(0);
  });

  it('interpreta una singola percentuale', () => {
    expect(parseEffectiveDiscountPercent('10%')).toBe(10);
    expect(parseEffectiveDiscountPercent('10')).toBe(10);
  });

  it('calcola sconti a cascata', () => {
    expect(parseEffectiveDiscountPercent('4+10%')).toBe(14);
    expect(parseEffectiveDiscountPercent('2+5+8%')).toBe(14);
  });
});

describe('applyDiscountMinor', () => {
  it('applica lo sconto effettivo', () => {
    expect(applyDiscountMinor(10_000, '10%')).toBe(9_000);
    expect(applyDiscountMinor(10_000, '4+10%')).toBe(8_600);
  });
});
