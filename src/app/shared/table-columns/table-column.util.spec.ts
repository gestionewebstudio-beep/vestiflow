import { describe, expect, it } from 'vitest';

import { TableViewPresetId } from './table-column.model';
import {
  applyPresetToState,
  createDefaultViewState,
  reconcileStateWithDefs,
  resolveVisibleColumns,
  toggleColumnVisibility,
} from './table-column.util';
import type { TableViewState } from './table-column.model';

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

  it('reconcileStateWithDefs rende renderizzabili le colonne aggiunte dopo il salvataggio', () => {
    // Stato persistito prima che esistessero le colonne 'b' e 'c'.
    const stale: TableViewState = {
      presetId: 'custom',
      columnOrder: ['a'],
      hiddenColumnIds: [],
      pinnedColumnIds: [],
      columnWidths: {},
    };
    const reconciled = reconcileStateWithDefs(stale, DEFS);
    // Colonne mancanti appese all'ordine; la defaultVisible:false nascosta.
    expect(reconciled.columnOrder).toEqual(['a', 'b', 'c']);
    expect(reconciled.hiddenColumnIds).toContain('c');
    expect(reconciled.hiddenColumnIds).not.toContain('b');
    // 'b' (defaultVisible:true) ora effettivamente renderizzata.
    expect(resolveVisibleColumns(DEFS, reconciled).map((col) => col.id)).toEqual(['a', 'b']);
  });

  it('reconcileStateWithDefs rispetta le scelte utente e ripulisce gli id sconosciuti', () => {
    const state: TableViewState = {
      presetId: 'custom',
      columnOrder: ['a', 'b', 'obsoleto'],
      hiddenColumnIds: ['b'],
      pinnedColumnIds: [],
      columnWidths: {},
    };
    const reconciled = reconcileStateWithDefs(state, DEFS);
    // 'obsoleto' rimosso, 'c' appesa e nascosta, scelta su 'b' preservata.
    expect(reconciled.columnOrder).toEqual(['a', 'b', 'c']);
    expect(reconciled.hiddenColumnIds).toContain('b');
    expect(resolveVisibleColumns(DEFS, reconciled).map((col) => col.id)).toEqual(['a']);
  });
});
