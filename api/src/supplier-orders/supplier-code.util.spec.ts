import { describe, expect, it } from 'vitest';

import { nextNumericSupplierCode } from './supplier-code.util';

describe('nextNumericSupplierCode', () => {
  it('parte da 0001 senza codici numerici', () => {
    expect(nextNumericSupplierCode([])).toBe('0001');
    expect(nextNumericSupplierCode(['ACME', '', 'FORN-X'])).toBe('0001');
  });

  it('incrementa il massimo codice numerico esistente', () => {
    expect(nextNumericSupplierCode(['0001', '0012', 'ACME', '0003'])).toBe('0013');
  });
});
