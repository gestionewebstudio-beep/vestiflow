import { describe, expect, it } from 'vitest';

import { parseTableViewState, parseTableViewStateJson } from './table-view-state.util';

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
      columnWidths: {},
    });
  });

  it('ritorna null su JSON invalido', () => {
    expect(parseTableViewStateJson('not-json')).toBeNull();
    expect(parseTableViewStateJson('{"presetId":"unknown"}')).toBeNull();
  });

  /**
   * ⛔ **I limiti erano in PIXEL su valori che sono PESI**, e scartavano in
   * silenzio: una colonna al proprio minimo reso vale, su una tabella larga, un
   * peso sotto 48. Al ricaricamento tornava alla misura di serie mentre le
   * altre restavano dove l'operatore le aveva messe.
   */
  it('⭐ un peso sotto i 48 sopravvive: è un rapporto, non una misura', () => {
    const stato = parseTableViewState({
      presetId: 'default',
      columnOrder: ['sku'],
      hiddenColumnIds: [],
      pinnedColumnIds: [],
      columnWidths: { sku: 40, name: 900 },
    });

    expect(stato?.columnWidths).toEqual({ sku: 40, name: 900 });
  });

  it('⚠️ ma un valore assurdo resta fuori: questo è un parse difensivo', () => {
    const stato = parseTableViewState({
      presetId: 'default',
      columnOrder: ['sku'],
      hiddenColumnIds: [],
      pinnedColumnIds: [],
      columnWidths: { zero: 0, negativa: -10, enorme: 99_999, testo: 'x' },
    });

    expect(stato?.columnWidths).toEqual({});
  });
});
