import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseAndValidateTableViewState,
  serializeTableViewState,
} from './table-view-state.util';

describe('table-view-state.util', () => {
  const validState = {
    presetId: 'default',
    columnOrder: ['sku', 'name'],
    hiddenColumnIds: ['notes'],
    pinnedColumnIds: ['sku'],
  };

  it('normalizza JSON valido', () => {
    const parsed = parseAndValidateTableViewState(JSON.stringify(validState));
    expect(parsed.presetId).toBe('default');
    expect(parsed.columnOrder).toEqual(['sku', 'name']);
    expect(serializeTableViewState(parsed)).toBe(JSON.stringify(validState));
  });

  it('rifiuta JSON malformato', () => {
    expect(() => parseAndValidateTableViewState('{')).toThrow(BadRequestException);
  });

  it('rifiuta presetId sconosciuto', () => {
    expect(() =>
      parseAndValidateTableViewState(JSON.stringify({ ...validState, presetId: 'unknown' })),
    ).toThrow(BadRequestException);
  });

  it('rifiuta id colonna duplicati', () => {
    expect(() =>
      parseAndValidateTableViewState(
        JSON.stringify({ ...validState, columnOrder: ['sku', 'sku'] }),
      ),
    ).toThrow(BadRequestException);
  });
});
