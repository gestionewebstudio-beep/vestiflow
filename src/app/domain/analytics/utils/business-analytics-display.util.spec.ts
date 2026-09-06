import { describe, expect, it } from 'vitest';

import { marginHint } from './business-analytics-display.util';
import type { BusinessAnalyticsSummary } from '../models/business-analytics.model';

/**
 * ⛔ Qui si presidia la SPARIZIONE della vecchia semantica «costo noto».
 * Fino al 22/08/2026 il suggerimento sotto il margine diceva quanta parte del
 * fatturato avesse un costo conosciuto — distinzione che esisteva solo perché
 * il costo poteva essere NULL. Un costo non valorizzato vale zero, quindi la
 * copertura è sempre totale e raccontarla sarebbe raccontare un modello che il
 * database non ha più.
 */
function riepilogo(margin: BusinessAnalyticsSummary['margin'], revenueMinor: number) {
  return {
    margin,
    revenue: { totalMinor: revenueMinor },
  } as BusinessAnalyticsSummary;
}

describe('marginHint', () => {
  it('col margine calcolato non nomina più il «costo noto»', () => {
    const hint = marginHint(riepilogo({ grossMinor: 45_000, grossPercent: 45 }, 100_000));

    expect(hint).toBe('Margine lordo sul fatturato');
    expect(hint).not.toMatch(/costo noto|Compila i costi|stimato/i);
  });

  it('un margine ZERO è un margine, e si racconta come tale', () => {
    expect(marginHint(riepilogo({ grossMinor: 0, grossPercent: 0 }, 100_000))).toBe(
      'Margine lordo sul fatturato',
    );
  });

  /** `null` col fatturato: è il mascheramento per permessi, non un costo assente. */
  it('margine mascherato: dice che non è visibile, non che mancano i costi', () => {
    const hint = marginHint(riepilogo({ grossMinor: null, grossPercent: null }, 100_000));

    expect(hint).toBe('Margine non visibile con i tuoi permessi');
    expect(hint).not.toMatch(/Compila/i);
  });

  it('senza fatturato non parla né di permessi né di costi da compilare', () => {
    expect(marginHint(riepilogo({ grossMinor: null, grossPercent: null }, 0))).toBe(
      'Nessuna vendita nel periodo',
    );
  });
});
