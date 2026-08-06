import { describe, expect, it } from 'vitest';

import { detectBarcodeFormat } from './barcode.util';

describe('detectBarcodeFormat', () => {
  it('rileva EAN-13, UPC e EAN-8', () => {
    expect(detectBarcodeFormat('5901234123457')).toBe('EAN13');
    expect(detectBarcodeFormat('012345678905')).toBe('UPC');
    expect(detectBarcodeFormat('96385074')).toBe('EAN8');
  });

  it('usa Code 128 per valori alfanumerici', () => {
    expect(detectBarcodeFormat('TEST-123')).toBe('CODE128');
  });
});
