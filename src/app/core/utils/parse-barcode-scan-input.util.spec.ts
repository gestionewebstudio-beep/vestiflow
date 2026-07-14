import { describe, expect, it } from 'vitest';

import { parseBarcodeScanInput } from './parse-barcode-scan-input.util';

describe('parseBarcodeScanInput', () => {
  it('usa quantità 1 se manca il prefisso numerico', () => {
    expect(parseBarcodeScanInput('8001234567890')).toEqual({
      quantity: 1,
      code: '8001234567890',
    });
  });

  it('parsa prefisso quantità con asterisco (EasyFatt)', () => {
    expect(parseBarcodeScanInput('148*8001234567890')).toEqual({
      quantity: 148,
      code: '8001234567890',
    });
  });

  it('ignora prefisso non valido', () => {
    expect(parseBarcodeScanInput('0*ABC')).toEqual({ quantity: 1, code: '0*ABC' });
  });
});
