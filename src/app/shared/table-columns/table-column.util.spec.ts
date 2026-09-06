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

/**
 * ⭐ **L'ORDINE È QUELLO DICHIARATO, e non cambia mai** — deciso dal
 * proprietario il 01/09/2026, dopo aver visto la tabella rimescolarsi da sé:
 * «nel momento in cui spunto o deseleziono una colonna si passa alla vista
 * personalizzata e cambia tutto, anche l'ordinamento».
 *
 * ⛔ **Il difetto era che esistevano DUE sequenze** per la stessa schermata: su
 * un preset valeva l'ordine del preset, al primo tocco su una spunta valeva
 * quello delle definizioni. Queste prove tengono ferma la sequenza unica.
 */
describe('table-column.util — l’ordine viene dalle definizioni', () => {
  it('⛔ un `columnOrder` salvato al contrario NON riordina le colonne', () => {
    const state: TableViewState = {
      ...createDefaultViewState(DEFS, PRESETS),
      columnOrder: ['c', 'b', 'a'],
    };

    expect(resolveVisibleColumns(DEFS, state).map((col) => col.id)).toEqual(['a', 'b']);
  });

  it('⭐ accendere una colonna la mette al SUO posto, non in coda', () => {
    const base = applyPresetToState(DEFS, PRESETS, TableViewPresetId.Default);
    const conC = toggleColumnVisibility(base, 'c');

    // `c` è dichiarata dopo `b`: compare lì, non dove il preset l'avrebbe messa.
    expect(resolveVisibleColumns(DEFS, conC).map((col) => col.id)).toEqual(['a', 'b', 'c']);
  });

  it('⭐ spegnere e riaccendere riporta la colonna dov’era', () => {
    const base = applyPresetToState(DEFS, PRESETS, TableViewPresetId.Default);
    const senzaA = toggleColumnVisibility(base, 'a');
    const diNuovoA = toggleColumnVisibility(senzaA, 'a');

    expect(resolveVisibleColumns(DEFS, senzaA).map((col) => col.id)).toEqual(['b']);
    expect(resolveVisibleColumns(DEFS, diNuovoA).map((col) => col.id)).toEqual(['a', 'b']);
  });

  /*
    ⚠️ Il blocco a sinistra è l'unica cosa che scavalca la dichiarazione, ed è
    voluto: è un ordine che l'operatore vede mentre lo decide.
  */
  it('⚠️ la colonna bloccata a sinistra precede comunque le altre', () => {
    const state: TableViewState = {
      ...createDefaultViewState(DEFS, PRESETS),
      pinnedColumnIds: ['b'],
    };

    expect(resolveVisibleColumns(DEFS, state).map((col) => col.id)).toEqual(['b', 'a']);
  });
});
