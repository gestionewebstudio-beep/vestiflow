import { describe, expect, it } from 'vitest';

import {
  applyCascadeDiscountMinor,
  applyDiscountMinor,
  cascadeDiscountMultiplier,
  parseEffectiveDiscountPercent,
} from './discount-percent.util';

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

describe('cascadeDiscountMultiplier (Ordine cliente, cascata ESATTA)', () => {
  it('"4+10%" → 0.96 × 0.90, MAI arrotondato a 14%', () => {
    expect(cascadeDiscountMultiplier('4+10%')).toBeCloseTo(0.864, 10);
  });

  it('"2+5+8%" → sequenza sul residuo', () => {
    expect(cascadeDiscountMultiplier('2+5+8%')).toBeCloseTo(0.98 * 0.95 * 0.92, 10);
  });

  it('vuoto/non valido → nessuno sconto', () => {
    expect(cascadeDiscountMultiplier('')).toBe(1);
    expect(cascadeDiscountMultiplier(null)).toBe(1);
    expect(cascadeDiscountMultiplier('abc')).toBe(1);
  });
});

describe('applyCascadeDiscountMinor', () => {
  it('arrotonda al centesimo solo alla fine', () => {
    // 100,00 € con 4+10% → 86,40 € (con la % arrotondata sarebbe 86,00 €).
    expect(applyCascadeDiscountMinor(10_000, '4+10%')).toBe(8_640);
  });
});
