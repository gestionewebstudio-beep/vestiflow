import { describe, expect, it } from 'vitest';

import { parseSerialNumbersText } from './serial-numbers-input.util';

describe('parseSerialNumbersText', () => {
  it('splitta per virgola', () => {
    expect(parseSerialNumbersText('SN-1, SN-2')).toEqual(['SN-1', 'SN-2']);
  });

  it('splitta per newline e punto e virgola', () => {
    expect(parseSerialNumbersText('SN-1\nSN-2;SN-3')).toEqual(['SN-1', 'SN-2', 'SN-3']);
  });

  it('restituisce undefined se vuoto', () => {
    expect(parseSerialNumbersText('  ,  ')).toBeUndefined();
  });
});
