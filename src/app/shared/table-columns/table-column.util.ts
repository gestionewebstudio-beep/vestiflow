import type {
  ResolvedTableColumn,
  TableColumnDef,
  TableViewPresetId,
  TableViewPresetMap,
  TableViewState,
} from './table-column.model';
import { TableViewPresetId as PresetId } from './table-column.model';

export function defaultColumnOrder(defs: readonly TableColumnDef[]): readonly string[] {
  return defs.map((def) => def.id);
}

export function defaultHiddenColumnIds(defs: readonly TableColumnDef[]): readonly string[] {
  return defs.filter((def) => def.defaultVisible === false).map((def) => def.id);
}

export function createDefaultViewState(
  defs: readonly TableColumnDef[],
  presets?: TableViewPresetMap,
): TableViewState {
  if (presets) {
    return applyPresetToState(defs, presets, PresetId.Default);
  }
  return {
    presetId: PresetId.Default,
    columnOrder: defaultColumnOrder(defs),
    hiddenColumnIds: defaultHiddenColumnIds(defs),
    pinnedColumnIds: [],
    columnWidths: {},
  };
}

export function applyPresetToState(
  defs: readonly TableColumnDef[],
  presets: TableViewPresetMap,
  presetId: TableViewPresetId,
): TableViewState {
  const visibleIds = presets[presetId];
  const allIds = defaultColumnOrder(defs);
  const hidden = allIds.filter((id) => !visibleIds.includes(id));
  return {
    presetId,
    columnOrder: [...visibleIds, ...allIds.filter((id) => !visibleIds.includes(id))],
    hiddenColumnIds: hidden,
    pinnedColumnIds: [],
    columnWidths: {},
  };
}

/**
 * Riconcilia uno stato persistito con le definizioni correnti: le colonne
 * aggiunte dopo il salvataggio delle preferenze mancano da `columnOrder` e,
 * senza questa riconciliazione, non verrebbero mai renderizzate anche se
 * l'utente le spunta (resolveVisibleColumns filtra su columnOrder). Le colonne
 * mancanti vengono appese in coda (ordine di definizione) e nascoste se hanno
 * `defaultVisible === false`; gli id ormai inesistenti vengono ripuliti. Le
 * scelte dell'utente sulle colonne già note restano invariate.
 */
export function reconcileStateWithDefs(
  state: TableViewState,
  defs: readonly TableColumnDef[],
): TableViewState {
  const knownIds = new Set(defs.map((def) => def.id));
  const inOrder = new Set(state.columnOrder);
  const missing = defs.filter((def) => !inOrder.has(def.id));
  if (missing.length === 0 && state.columnOrder.every((id) => knownIds.has(id))) {
    return state;
  }
  const columnOrder = [
    ...state.columnOrder.filter((id) => knownIds.has(id)),
    ...missing.map((def) => def.id),
  ];
  const hidden = new Set(state.hiddenColumnIds.filter((id) => knownIds.has(id)));
  for (const def of missing) {
    if (def.defaultVisible === false) {
      hidden.add(def.id);
    }
  }
  return {
    ...state,
    columnOrder,
    hiddenColumnIds: [...hidden],
    pinnedColumnIds: state.pinnedColumnIds.filter((id) => knownIds.has(id)),
  };
}

export function resolveVisibleColumns(
  defs: readonly TableColumnDef[],
  state: TableViewState,
): readonly ResolvedTableColumn[] {
  const hidden = new Set(state.hiddenColumnIds);
  const pinned = new Set(state.pinnedColumnIds);
  /*
    ⭐ **L'ORDINE È QUELLO DICHIARATO, sempre** — deciso dal proprietario il
    01/09/2026: «lasciamo solo default e personalizzata, e queste incidono solo
    su quali sono attive e quali no».

    ⛔ **Qui si leggeva `state.columnOrder`, e produceva DUE sequenze per la
    stessa schermata**: finché si stava su un preset valeva l'ordine del preset,
    al primo tocco su una spunta la vista diventava «Personalizzata» e l'ordine
    saltava a quello delle definizioni. «Nel momento in cui spunto o deseleziono
    una colonna cambia tutto, anche l'ordinamento» — ed era esatto.

    ⚠️ **Le frecce di riordino sono state tolte insieme a questa riga**, e non
    era una funzione sacrificata: spostavano la colonna nella TABELLA mentre le
    righe del pannello restano in ordine di definizione, quindi si premeva senza
    vedere niente muoversi. E poiché `columnOrder` contiene anche le colonne
    NASCOSTE, una pressione su due scambiava con una colonna invisibile e non
    accadeva nulla nemmeno dietro.

    ⭐ Il blocco a sinistra (`pinned`) resta e continua a precedere le altre:
    quello è un ordine che l'operatore vede mentre lo decide.
  */
  const resolved = defs
    .filter((def) => !hidden.has(def.id))
    .map((def) => ({ ...def, pinned: pinned.has(def.id) }));
  const pinnedCols = resolved.filter((col) => col.pinned);
  const rest = resolved.filter((col) => !col.pinned);
  return [...pinnedCols, ...rest];
}

export function toggleColumnVisibility(state: TableViewState, columnId: string): TableViewState {
  const hidden = new Set(state.hiddenColumnIds);
  if (hidden.has(columnId)) {
    hidden.delete(columnId);
  } else {
    hidden.add(columnId);
  }
  return { ...state, presetId: 'custom', hiddenColumnIds: [...hidden] };
}

export function moveColumn(
  state: TableViewState,
  columnId: string,
  direction: -1 | 1,
): TableViewState {
  const order = [...state.columnOrder];
  const index = order.indexOf(columnId);
  if (index < 0) {
    return state;
  }
  const target = index + direction;
  if (target < 0 || target >= order.length) {
    return state;
  }
  const [item] = order.splice(index, 1);
  order.splice(target, 0, item!);
  return { ...state, presetId: 'custom', columnOrder: order };
}

export function toggleColumnPin(state: TableViewState, columnId: string): TableViewState {
  const pinned = new Set(state.pinnedColumnIds);
  if (pinned.has(columnId)) {
    pinned.delete(columnId);
  } else {
    pinned.add(columnId);
  }
  return { ...state, presetId: 'custom', pinnedColumnIds: [...pinned] };
}
