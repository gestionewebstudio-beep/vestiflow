import { describe, expect, it } from 'vitest';

import {
  minorToDecimalString,
  roundToMinor,
  sameAmountAtCent,
  sameNullableAmountAtCent,
} from './money.util';

describe('roundToMinor', () => {
  it('arrotonda al centesimo: e il gesto dell uscita, non dei passaggi intermedi', () => {
    expect(roundToMinor(10161.4754)).toBe(10161);
    expect(roundToMinor(10161.5)).toBe(10162);
    expect(roundToMinor(2990)).toBe(2990);
  });
});

describe('sameAmountAtCent', () => {
  // Una coda decimale diversa non e una modifica per chi guarda: non deve far
  // scattare storici prezzi, conflitti di catalogo o propagazioni ai canali.
  it('due importi che si mostrano uguali sono lo stesso importo', () => {
    expect(sameAmountAtCent(10161.4754, 10161)).toBe(true);
    expect(sameAmountAtCent(10161.4754, 10161.4999)).toBe(true);
    expect(sameAmountAtCent(10161.4754, 10162)).toBe(false);
  });

  it('due assenze sono lo stesso importo, un assenza e un valore no', () => {
    expect(sameNullableAmountAtCent(null, null)).toBe(true);
    expect(sameNullableAmountAtCent(null, 0)).toBe(false);
    expect(sameNullableAmountAtCent(2990, 2990.4)).toBe(true);
  });
});

describe('minorToDecimalString', () => {
  // Il denaro esce verso i canali esterni da qui: Shopify (via
  // minorToShopifyDecimal) e TikTok usano questa sola conversione, cosi lo
  // stesso prezzo non puo essere pubblicato con un centesimo di differenza.
  it('converte le unita minori in stringa decimale', () => {
    expect(minorToDecimalString(2990)).toBe('29.90');
    expect(minorToDecimalString(99)).toBe('0.99');
    expect(minorToDecimalString(10000)).toBe('100.00');
    expect(minorToDecimalString(-1050)).toBe('-10.50');
  });

  it('arrotonda la coda decimale del netto scorporato', () => {
    expect(minorToDecimalString(10161.4754)).toBe('101.61');
    expect(minorToDecimalString(2049.1803)).toBe('20.49');
  });

  // `toFixed(2)` sul valore in euro sembra equivalente e non lo e: su mezzo
  // centesimo dipende da come il float rappresenta `x,xx5`, che a volte cade
  // sotto. Su 20.001 mezzi centesimi le due forme divergono quasi la meta delle
  // volte — abbastanza da pubblicare lo stesso prezzo con un centesimo di
  // differenza su due canali.
  it('arrotonda le unita minori, non il valore in euro', () => {
    expect(minorToDecimalString(1.5)).toBe('0.02');
    expect((1.5 / 100).toFixed(2)).toBe('0.01');
    expect(minorToDecimalString(4.5)).toBe('0.05');
    expect((4.5 / 100).toFixed(2)).toBe('0.04');

    let divergenti = 0;
    for (let minor = 0; minor <= 20000; minor++) {
      const mezzoCentesimo = minor + 0.5;
      if (minorToDecimalString(mezzoCentesimo) !== (mezzoCentesimo / 100).toFixed(2)) {
        divergenti++;
      }
    }
    expect(divergenti).toBeGreaterThan(1000);
  });
});
