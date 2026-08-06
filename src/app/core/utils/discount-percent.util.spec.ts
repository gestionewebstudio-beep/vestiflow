import { describe, expect, it } from 'vitest';

import {
  applyCascadeDiscountMinor,
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

  // La cascata e' la regola: 4%, poi 10% su quel che resta. Arrotondare a 14
  // faceva valere il documento salvato meno dell'anteprima che l'operatore
  // aveva davanti — e l'anteprima aveva ragione.
  it('calcola sconti a cascata SENZA arrotondarli', () => {
    expect(parseEffectiveDiscountPercent('4+10%')).toBe(13.6);
    expect(parseEffectiveDiscountPercent('2+5+8%')).toBeCloseTo(14.348, 10);
  });

  it('accetta la virgola e ignora le parti non valide', () => {
    expect(parseEffectiveDiscountPercent('12,5%')).toBe(12.5);
    expect(parseEffectiveDiscountPercent('abc')).toBe(0);
    expect(parseEffectiveDiscountPercent('10%+abc')).toBe(10);
  });

  it("e' la percentuale dello stesso sconto che applica il moltiplicatore", () => {
    for (const input of ['', '10%', '4+10%', '2+5+8%', '12,5%', '33%']) {
      const fromPercent = 1 - parseEffectiveDiscountPercent(input) / 100;
      expect(fromPercent).toBeCloseTo(cascadeDiscountMultiplier(input), 6);
    }
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
