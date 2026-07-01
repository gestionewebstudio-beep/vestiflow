import { describe, expect, it } from 'vitest';

import { parseTableViewStateJson } from './table-view-state.util';

describe('table-view-state.util', () => {
  it('parsa state valido', () => {
    expect(
      parseTableViewStateJson(
        JSON.stringify({
          presetId: 'warehouse',
          columnOrder: ['sku'],
          hiddenColumnIds: [],
          pinnedColumnIds: ['sku'],
        }),
      ),
    ).toEqual({
      presetId: 'warehouse',
      columnOrder: ['sku'],
      hiddenColumnIds: [],
      pinnedColumnIds: ['sku'],
    });
  });

  it('ritorna null su JSON invalido', () => {
    expect(parseTableViewStateJson('not-json')).toBeNull();
    expect(parseTableViewStateJson('{"presetId":"unknown"}')).toBeNull();
  });
});
