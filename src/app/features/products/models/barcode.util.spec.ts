import { describe, expect, it } from 'vitest';

import {
  EAN13_LENGTH,
  calculateEan13CheckDigit,
  generateDistinctEan13Barcode,
  generateEan13Barcode,
} from './barcode.util';

describe('calculateEan13CheckDigit', () => {
  it('calcola la cifra di controllo per un payload noto', () => {
    expect(calculateEan13CheckDigit('590123412345')).toBe('7');
  });
});

describe('generateEan13Barcode', () => {
  it('genera 13 cifre con check digit valido', () => {
    const barcode = generateEan13Barcode();
    expect(barcode).toMatch(/^\d{13}$/);
    expect(barcode.length).toBe(EAN13_LENGTH);
    expect(barcode.at(-1)).toBe(calculateEan13CheckDigit(barcode.slice(0, 12)));
  });
});

describe('generateDistinctEan13Barcode', () => {
  it('evita il valore escluso quando possibile', () => {
    const barcode = generateDistinctEan13Barcode('5901234123457');
    expect(barcode).not.toBe('5901234123457');
    expect(barcode.length).toBe(EAN13_LENGTH);
  });
});
