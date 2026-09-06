import { describe, expect, it } from 'vitest';

import { documentLineEconomicTotals } from './document-line-economic-totals.util';

/**
 * I TOTALI DETERMINATI di una riga documento (§5.2 di `docs/24`).
 *
 * ⛔ Ogni prova asserisce il VALORE ESATTO, mai «non è nullo»: le colonne hanno
 * `@default(0)`, quindi un test che si accontenta di «definito» tornerebbe
 * verde anche sul difetto che stiamo chiudendo. È la ragione per cui il
 * proprietario l'ha vietato esplicitamente.
 */
describe('documentLineEconomicTotals', () => {
  it('IVA ordinaria: 2 pezzi da 10,00 € al 22% fanno 4,40 € di imposta', () => {
    // 2 × 1000 = 2000 netto. Lordo = round(2000 × 1,22) = 2440. Imposta = 440.
    const totali = documentLineEconomicTotals({
      netExactMinor: 2000,
      totalMinor: 2000,
      ratePercent: 22,
    });

    expect(totali.lineVatTotalMinor).toBe(440);
    expect(totali.lineGrossTotalMinor).toBe(2440);
  });

  it('IVA 0% valida: imposta zero perché l’aliquota è zero, e il lordo resta l’imponibile', () => {
    const totali = documentLineEconomicTotals({
      netExactMinor: 5000,
      totalMinor: 5000,
      ratePercent: 0,
    });

    // ⭐ È lo zero LEGITTIMO: il calcolo produce davvero zero. Si distingue dal
    // «campo non compilato» perché il lordo vale l'imponibile, non zero.
    expect(totali.lineVatTotalMinor).toBe(0);
    expect(totali.lineGrossTotalMinor).toBe(5000);
  });

  it('nessuna aliquota risolta: imposta zero, lordo pari all’imponibile', () => {
    const totali = documentLineEconomicTotals({
      netExactMinor: 4500,
      totalMinor: 4500,
      ratePercent: null,
    });

    expect(totali.lineVatTotalMinor).toBe(0);
    expect(totali.lineGrossTotalMinor).toBe(4500);
  });

  it('sconto di riga: lo sconto è già nell’imponibile, e l’imposta lo segue', () => {
    // 1 × 10000 scontato del 10% = 9000 netto. Lordo = round(9000 × 1,22) = 10980.
    const totali = documentLineEconomicTotals({
      netExactMinor: 9000,
      totalMinor: 9000,
      ratePercent: 22,
    });

    expect(totali.lineVatTotalMinor).toBe(1980);
    expect(totali.lineGrossTotalMinor).toBe(10980);
  });

  it('coda decimale: l’imposta nasce dall’imponibile ESATTO, non da quello arrotondato', () => {
    // 1 × 1234 scontato del 3,5% = 1190,81 esatti, che si persistono come 1191.
    // Lordo  = round(1190,81 × 1,22) = round(1452,7882) = 1453
    // Imposta = 1453 − round(1190,81) = 1453 − 1191 = 262
    const totali = documentLineEconomicTotals({
      netExactMinor: 1190.81,
      totalMinor: 1191,
      ratePercent: 22,
    });

    expect(totali.lineVatTotalMinor).toBe(262);
    expect(totali.lineGrossTotalMinor).toBe(1453);
    // L'invariante che tiene insieme le tre colonne persistite.
    expect(totali.lineGrossTotalMinor).toBe(1191 + totali.lineVatTotalMinor);
  });

  it('aliquota ridotta: 100,00 € al 10% fanno 10,00 € di imposta', () => {
    const totali = documentLineEconomicTotals({
      netExactMinor: 10000,
      totalMinor: 10000,
      ratePercent: 10,
    });

    expect(totali.lineVatTotalMinor).toBe(1000);
    expect(totali.lineGrossTotalMinor).toBe(11000);
  });

  it('riga descrittiva a zero: imposta e lordo zero, senza divisioni per zero', () => {
    const totali = documentLineEconomicTotals({
      netExactMinor: 0,
      totalMinor: 0,
      ratePercent: 22,
    });

    expect(totali.lineVatTotalMinor).toBe(0);
    expect(totali.lineGrossTotalMinor).toBe(0);
  });

  it('il lordo è SEMPRE imponibile persistito + imposta, a ogni aliquota', () => {
    for (const ratePercent of [4, 5, 10, 22]) {
      for (const netExactMinor of [1, 99, 1234.56, 98765, 100000]) {
        const totalMinor = Math.round(netExactMinor);
        const totali = documentLineEconomicTotals({ netExactMinor, totalMinor, ratePercent });

        expect(totali.lineGrossTotalMinor).toBe(totalMinor + totali.lineVatTotalMinor);
        // ⚠️ Sopra il centesimo l'imposta è positiva. Sotto no, ed è corretto:
        // 1 centesimo al 4% dà 0,04 centesimi, che arrotondati sono zero — un
        // altro zero legittimo, prodotto dal calcolo e non dal default.
        if (netExactMinor >= 100) {
          expect(totali.lineVatTotalMinor).toBeGreaterThan(0);
        }
      }
    }
  });
});
