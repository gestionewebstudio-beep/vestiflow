import { describe, expect, it } from 'vitest';

import { TableViewPresetId } from './table-column.model';
import {
  applyPresetToState,
  createDefaultViewState,
  resolveVisibleColumns,
  toggleColumnVisibility,
} from './table-column.util';

const DEFS = [
  { id: 'a', label: 'A', defaultVisible: true },
  { id: 'b', label: 'B', defaultVisible: true },
  { id: 'c', label: 'C', defaultVisible: false },
] as const;

const PRESETS = {
  [TableViewPresetId.Default]: ['a', 'b'],
  [TableViewPresetId.Warehouse]: ['a', 'c'],
  [TableViewPresetId.Accountant]: ['b'],
  [TableViewPresetId.Supplier]: ['a'],
  [TableViewPresetId.Analysis]: ['b', 'c'],
  [TableViewPresetId.Operational]: ['a', 'b'],
};

describe('table-column.util', () => {
  it('createDefaultViewState applica il preset default', () => {
    const state = createDefaultViewState(DEFS, PRESETS);
    expect(state.hiddenColumnIds).toContain('c');
    expect(resolveVisibleColumns(DEFS, state).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('toggleColumnVisibility passa a custom', () => {
    const base = applyPresetToState(DEFS, PRESETS, TableViewPresetId.Default);
    const next = toggleColumnVisibility(base, 'a');
    expect(next.presetId).toBe('custom');
    expect(next.hiddenColumnIds).toContain('a');
  });
});
