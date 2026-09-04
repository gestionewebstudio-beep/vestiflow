import { describe, expect, it } from 'vitest';

import {
  minorToDecimalString,
  roundToMinor,
  sameAmountAtCent,
  sameNullableAmountAtCent,
  sameUnitAmountAtContract,
  toStorableMinor,
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

/**
 * ⛔ **Il costo unitario non si confronta al centesimo**, e il difetto che
 * questo comparatore chiude era già armato: dopo la migration delle colonne di
 * costo a `NUMERIC(16,6)`, `sameAmountAtCent(84, 84.4262)` rispondeva «uguali»
 * — e un Arrivo merce a 1,03 € ivati al 22% avrebbe lasciato in anagrafica il
 * vecchio costo intero invece di scrivere quello preciso.
 */
describe('sameUnitAmountAtContract', () => {
  it('⭐ 84,0000 → 84,4262 è CAMBIATO (al centesimo sarebbe «uguale»)', () => {
    expect(sameUnitAmountAtContract(84, 84.4262)).toBe(false);
    // Il metro vecchio, per mostrare la differenza che questo test difende.
    expect(sameAmountAtCent(84, 84.4262)).toBe(true);
  });

  it('⭐ 2049,0000 → 2049,1803 è cambiato (25,00 € ivati al 22%)', () => {
    expect(sameUnitAmountAtContract(2049, 2049.1803)).toBe(false);
  });

  it('lo stesso valore è invariato: nessuna riscrittura inutile', () => {
    expect(sameUnitAmountAtContract(84.4262, 84.4262)).toBe(true);
  });

  it('⭐ valori grezzi diversi che il contratto rende identici sono invariati', () => {
    // Oltre le 4 cifre di centesimo non c'è precisione, c'è il rumore del
    // float: due valori che finiscono sulla stessa cifra memorizzabile SONO lo
    // stesso valore, e non devono far scattare una scrittura.
    expect(sameUnitAmountAtContract(84.42622950, 84.42621111)).toBe(true);
    expect(toStorableMinor(84.42622950)).toBe(toStorableMinor(84.42621111));
  });

  it('⛔ ma una differenza DENTRO il contratto si vede', () => {
    expect(sameUnitAmountAtContract(84.4262, 84.4263)).toBe(false);
  });

  it('null e null sono lo stesso: costo assente resta assente', () => {
    expect(sameUnitAmountAtContract(null, null)).toBe(true);
  });

  it('⛔ null e un valore sono diversi — anche se il valore è zero', () => {
    expect(sameUnitAmountAtContract(null, 84.4262)).toBe(false);
    // «costo sconosciuto» e «costa zero» non sono la stessa cosa.
    expect(sameUnitAmountAtContract(null, 0)).toBe(false);
  });
});
