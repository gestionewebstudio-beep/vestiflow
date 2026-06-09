import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CURRENCY,
  currencyDecimals,
  decimalStringToMoney,
  formatMoney,
  isValidCompareAt,
  moneyFromMajor,
  moneyToDecimalString,
  moneyToMajor,
  parseMoneyInput,
  sameCurrency,
  zeroMoney,
} from './money.util';

describe('currencyDecimals', () => {
  it('usa 2 decimali come default ISO 4217', () => {
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('USD')).toBe(2);
  });

  it('gestisce le valute a 0 e 3 decimali', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('KWD')).toBe(3);
  });

  it('e case-insensitive', () => {
    expect(currencyDecimals('jpy')).toBe(0);
  });
});

describe('zeroMoney / moneyFromMajor / moneyToMajor', () => {
  it('crea uno zero nella valuta richiesta (default EUR)', () => {
    expect(zeroMoney()).toEqual({ amountMinor: 0, currencyCode: DEFAULT_CURRENCY });
    expect(zeroMoney('USD')).toEqual({ amountMinor: 0, currencyCode: 'USD' });
  });

  it('converte unita maggiori in minori e viceversa', () => {
    const money = moneyFromMajor(19.9);
    expect(money.amountMinor).toBe(1990);
    expect(moneyToMajor(money)).toBeCloseTo(19.9);
  });

  it('rispetta l esponente valuta nella conversione', () => {
    expect(moneyFromMajor(500, 'JPY').amountMinor).toBe(500);
    expect(moneyFromMajor(1.5, 'KWD').amountMinor).toBe(1500);
  });
});

describe('formatMoney', () => {
  it('formatta in valuta con locale it-IT', () => {
    const label = formatMoney({ amountMinor: 123450, currencyCode: 'EUR' });
    // Il dettaglio di formattazione (raggruppamento, spazi) dipende dai dati
    // ICU dell'ambiente: si verifica il wiring con l'output Intl di riferimento.
    const reference = new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(1234.5);
    expect(label).toBe(reference);
    expect(label).toContain('€');
    expect(label).toContain('234,50');
  });
});

describe('parseMoneyInput', () => {
  it('accetta virgola e punto come separatore decimale', () => {
    expect(parseMoneyInput('19,90')?.amountMinor).toBe(1990);
    expect(parseMoneyInput('19.90')?.amountMinor).toBe(1990);
  });

  it('interpreta l ultimo separatore come decimale e scarta le migliaia', () => {
    expect(parseMoneyInput('1.234,50')?.amountMinor).toBe(123450);
    expect(parseMoneyInput('1,234.50')?.amountMinor).toBe(123450);
  });

  it('pad e tronca la parte decimale all esponente valuta', () => {
    expect(parseMoneyInput('19,9')?.amountMinor).toBe(1990);
    expect(parseMoneyInput('19,999')?.amountMinor).toBe(1999);
  });

  it('gestisce numeri interi e valute a 0 decimali', () => {
    expect(parseMoneyInput('19')?.amountMinor).toBe(1900);
    expect(parseMoneyInput('500', 'JPY')?.amountMinor).toBe(500);
  });

  it('gestisce il segno negativo e la parte intera mancante', () => {
    expect(parseMoneyInput('-5,00')?.amountMinor).toBe(-500);
    expect(parseMoneyInput(',50')?.amountMinor).toBe(50);
  });

  it('rifiuta input non numerici', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('   ')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('19€')).toBeNull();
    expect(parseMoneyInput('--5')).toBeNull();
  });

  it('parser lenient: separatori multipli trattati come migliaia (ultimo = decimale)', () => {
    // Comportamento documentato: '19,9,9' -> 199,90 (gli altri separatori sono migliaia).
    expect(parseMoneyInput('19,9,9')?.amountMinor).toBe(19990);
  });
});

describe('moneyToDecimalString / decimalStringToMoney (confine Shopify)', () => {
  it('serializza in stringa decimale stile MoneyV2', () => {
    expect(moneyToDecimalString({ amountMinor: 1990, currencyCode: 'EUR' })).toBe('19.90');
    expect(moneyToDecimalString({ amountMinor: 5, currencyCode: 'EUR' })).toBe('0.05');
    expect(moneyToDecimalString({ amountMinor: -1990, currencyCode: 'EUR' })).toBe('-19.90');
    expect(moneyToDecimalString({ amountMinor: 500, currencyCode: 'JPY' })).toBe('500');
  });

  it('fa round-trip senza perdita', () => {
    const original = { amountMinor: 123456, currencyCode: 'EUR' };
    expect(decimalStringToMoney(moneyToDecimalString(original), 'EUR')).toEqual(original);
  });

  it('decimalStringToMoney cade su zero per input invalido', () => {
    expect(decimalStringToMoney('not-a-number', 'EUR')).toEqual(zeroMoney('EUR'));
  });
});

describe('sameCurrency / isValidCompareAt', () => {
  it('confronta le valute', () => {
    expect(
      sameCurrency(
        { amountMinor: 1, currencyCode: 'EUR' },
        { amountMinor: 2, currencyCode: 'EUR' },
      ),
    ).toBe(true);
    expect(
      sameCurrency(
        { amountMinor: 1, currencyCode: 'EUR' },
        { amountMinor: 2, currencyCode: 'USD' },
      ),
    ).toBe(false);
  });

  it('compareAt valido solo se stessa valuta e strettamente maggiore', () => {
    const price = { amountMinor: 1990, currencyCode: 'EUR' };
    expect(isValidCompareAt(price, { amountMinor: 2990, currencyCode: 'EUR' })).toBe(true);
    expect(isValidCompareAt(price, { amountMinor: 1990, currencyCode: 'EUR' })).toBe(false);
    expect(isValidCompareAt(price, { amountMinor: 1490, currencyCode: 'EUR' })).toBe(false);
    expect(isValidCompareAt(price, { amountMinor: 2990, currencyCode: 'USD' })).toBe(false);
  });
});
