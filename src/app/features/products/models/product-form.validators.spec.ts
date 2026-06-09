import { describe, expect, it } from 'vitest';

import {
  compareAtPriceError,
  findDuplicateAxisNames,
  findDuplicateSkus,
  isBarcodeDistinct,
  isValidAxisName,
  isValidSku,
  normalizeSku,
} from './product-form.validators';

describe('normalizeSku', () => {
  it('applica trim e maiuscolo', () => {
    expect(normalizeSku('  ts-001-m ')).toBe('TS-001-M');
  });
});

describe('isValidSku', () => {
  it('accetta alfanumerico con trattini', () => {
    expect(isValidSku('TS-001-M')).toBe(true);
    expect(isValidSku('1ABC')).toBe(true);
  });

  it('rifiuta spazi, vuoto e primo carattere non alfanumerico', () => {
    expect(isValidSku('')).toBe(false);
    expect(isValidSku('TS 001')).toBe(false);
    expect(isValidSku('-TS001')).toBe(false);
  });
});

describe('findDuplicateSkus', () => {
  it('trova i duplicati case-insensitive normalizzati', () => {
    expect(findDuplicateSkus(['ts-001', 'TS-001', 'TS-002'])).toEqual(['TS-001']);
  });

  it('ignora gli SKU vuoti e ritorna lista vuota senza duplicati', () => {
    expect(findDuplicateSkus(['', '  ', 'TS-001'])).toEqual([]);
  });
});

describe('isValidAxisName / findDuplicateAxisNames', () => {
  it('nome asse valido se non vuoto dopo trim', () => {
    expect(isValidAxisName('Taglia')).toBe(true);
    expect(isValidAxisName('   ')).toBe(false);
  });

  it('trova i nomi asse duplicati case-insensitive', () => {
    expect(findDuplicateAxisNames(['Taglia', 'taglia ', 'Colore'])).toEqual(['taglia']);
    expect(findDuplicateAxisNames(['Taglia', 'Colore'])).toEqual([]);
  });
});

describe('compareAtPriceError', () => {
  it('campo vuoto: opzionale, nessun errore', () => {
    expect(compareAtPriceError(19.9, '')).toBeNull();
    expect(compareAtPriceError(19.9, '   ')).toBeNull();
  });

  it('input non parsabile: errore di formato', () => {
    expect(compareAtPriceError(19.9, 'abc')).toBe('format');
  });

  it('non maggiore del prezzo: notHigher', () => {
    expect(compareAtPriceError(19.9, '19,90')).toBe('notHigher');
    expect(compareAtPriceError(19.9, '15,00')).toBe('notHigher');
  });

  it('valido se strettamente maggiore', () => {
    expect(compareAtPriceError(19.9, '29,90')).toBeNull();
  });
});

describe('isBarcodeDistinct', () => {
  it('barcode vuoto e sempre ammesso', () => {
    expect(isBarcodeDistinct('TS-001', '')).toBe(true);
  });

  it('barcode uguale allo SKU (case-insensitive) non e ammesso', () => {
    expect(isBarcodeDistinct('TS-001', 'ts-001')).toBe(false);
    expect(isBarcodeDistinct('TS-001', '8001234567890')).toBe(true);
  });
});
