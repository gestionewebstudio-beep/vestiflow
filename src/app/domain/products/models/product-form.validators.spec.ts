import { describe, expect, it } from 'vitest';

import {
  compareAtPriceError,
  findDuplicateAxisNames,
  findDuplicateBarcodes,
  findDuplicateSkus,
  isBarcodeDistinct,
  isValidArticleCodeFormat,
  isValidAxisName,
  isValidSku,
  normalizeArticleCode,
  normalizeBarcode,
  normalizeSku,
} from './product-form.validators';

describe('normalizeSku', () => {
  it('applica trim e maiuscolo', () => {
    expect(normalizeSku('  ts-001-m ')).toBe('TS-001-M');
  });
});

describe('normalizeArticleCode', () => {
  it('applica trim e maiuscolo (§Codice articolo, case-insensitive)', () => {
    expect(normalizeArticleCode('  abc001 ')).toBe('ABC001');
    expect(normalizeArticleCode('')).toBe('');
  });
});

describe('isValidArticleCodeFormat', () => {
  it('accetta lettere, cifre, trattino, underscore e slash', () => {
    expect(isValidArticleCodeFormat('ABC-001_X/2')).toBe(true);
    expect(isValidArticleCodeFormat('00001')).toBe(true);
  });

  it('accetta il codice vuoto: obbligatorietà gestita dal form, non dal formato', () => {
    expect(isValidArticleCodeFormat('')).toBe(true);
    expect(isValidArticleCodeFormat('   ')).toBe(true);
  });

  it('rifiuta spazi e altri caratteri speciali', () => {
    expect(isValidArticleCodeFormat('AB C')).toBe(false);
    expect(isValidArticleCodeFormat('AB.C')).toBe(false);
    expect(isValidArticleCodeFormat('AB#1')).toBe(false);
  });
});

describe('isValidSku', () => {
  it('accetta alfanumerico con trattini', () => {
    expect(isValidSku('TS-001-M')).toBe(true);
    expect(isValidSku('1ABC')).toBe(true);
  });

  it('accetta lo SKU vuoto: facoltativo, mai bloccante (specifica cliente)', () => {
    expect(isValidSku('')).toBe(true);
    expect(isValidSku('   ')).toBe(true);
  });

  it('se valorizzato rifiuta spazi e primo carattere non alfanumerico', () => {
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
    expect(compareAtPriceError(19.9, null)).toBeNull();
  });

  it('non maggiore del prezzo: notHigher', () => {
    expect(compareAtPriceError(19.9, 19.9)).toBe('notHigher');
    expect(compareAtPriceError(19.9, 15)).toBe('notHigher');
  });

  it('valido se strettamente maggiore', () => {
    expect(compareAtPriceError(19.9, 29.9)).toBeNull();
  });
});

describe('findDuplicateBarcodes', () => {
  it('trova i duplicati case-insensitive normalizzati', () => {
    expect(findDuplicateBarcodes(['8001234567890', '8001234567890', '8009999999999'])).toEqual([
      '8001234567890',
    ]);
  });

  it('ignora i barcode vuoti e ritorna lista vuota senza duplicati', () => {
    expect(findDuplicateBarcodes(['', '  ', '8001234567890'])).toEqual([]);
  });
});

describe('normalizeBarcode', () => {
  it('applica trim e maiuscolo', () => {
    expect(normalizeBarcode(' 8001234567890 ')).toBe('8001234567890');
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
