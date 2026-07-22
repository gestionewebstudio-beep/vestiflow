import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '@core/auth';

import type {
  ResolvedTableColumn,
  TableColumnDef,
  TableViewId,
  TableViewPresetId,
  TableViewState,
} from './table-column.model';
import { TableViewPresetId as PresetId } from './table-column.model';
import type { TableViewPresetMap } from './table-column.model';
import {
  createDefaultViewState,
  reconcileStateWithDefs,
  resolveVisibleColumns,
  toggleColumnPin,
  toggleColumnVisibility,
  moveColumn,
  applyPresetToState,
} from './table-column.util';
import { parseTableViewStateJson } from './table-view-state.util';
import { TableViewPreferenceApiService } from './table-view-preference-api.service';

interface ViewRegistryEntry {
  readonly defs: readonly TableColumnDef[];
  readonly presets: TableViewPresetMap;
}

/**
 * Preferenze colonne tabella per utente/tenant (localStorage + sync server C3).
 */
@Injectable({ providedIn: 'root' })
export class TableColumnPreferenceService {
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(TableViewPreferenceApiService);

  private readonly registry = new Map<TableViewId, ViewRegistryEntry>();
  private readonly states = new Map<TableViewId, WritableSignal<TableViewState>>();

  registerView(
    viewId: TableViewId,
    defs: readonly TableColumnDef[],
    presets: TableViewPresetMap,
  ): void {
    if (this.registry.has(viewId)) {
      return;
    }
    this.registry.set(viewId, { defs, presets });
    this.states.set(viewId, signal(this.loadState(viewId, defs, presets)));
    void this.hydrateFromServer(viewId, defs, presets);
  }

  visibleColumns(viewId: TableViewId): Signal<readonly ResolvedTableColumn[]> {
    const entry = this.registry.get(viewId);
    if (!entry) {
      throw new Error(`Vista tabella non registrata: ${viewId}`);
    }
    const stateSignal = this.states.get(viewId)!;
    return computed(() => resolveVisibleColumns(entry.defs, stateSignal()));
  }

  state(viewId: TableViewId): Signal<TableViewState> {
    return this.states.get(viewId)!.asReadonly();
  }

  columnDefs(viewId: TableViewId): readonly TableColumnDef[] {
    return this.registry.get(viewId)?.defs ?? [];
  }

  presetMap(viewId: TableViewId): TableViewPresetMap {
    return this.registry.get(viewId)!.presets;
  }

  applyPreset(viewId: TableViewId, presetId: TableViewPresetId): void {
    const entry = this.registry.get(viewId);
    if (!entry) {
      return;
    }
    const next = applyPresetToState(entry.defs, entry.presets, presetId);
    this.commit(viewId, next);
  }

  toggleColumn(viewId: TableViewId, columnId: string): void {
    const current = this.readState(viewId);
    this.commit(viewId, toggleColumnVisibility(current, columnId));
  }

  moveColumn(viewId: TableViewId, columnId: string, direction: -1 | 1): void {
    const current = this.readState(viewId);
    this.commit(viewId, moveColumn(current, columnId, direction));
  }

  togglePin(viewId: TableViewId, columnId: string): void {
    const current = this.readState(viewId);
    this.commit(viewId, toggleColumnPin(current, columnId));
  }

  resetToDefault(viewId: TableViewId): void {
    const entry = this.registry.get(viewId);
    if (!entry) {
      return;
    }
    this.applyPreset(viewId, PresetId.Default);
  }

  setColumnWidth(viewId: TableViewId, columnId: string, widthPx: number): void {
    const current = this.readState(viewId);
    this.commit(viewId, {
      ...current,
      presetId: 'custom',
      columnWidths: { ...current.columnWidths, [columnId]: widthPx },
    });
  }

  columnWidth(viewId: TableViewId, columnId: string, fallbackPx: number): number {
    return this.readState(viewId).columnWidths[columnId] ?? fallbackPx;
  }

  isColumnVisible(viewId: TableViewId, columnId: string): boolean {
    const state = this.readState(viewId);
    return !state.hiddenColumnIds.includes(columnId);
  }

  visibleColumnIds(viewId: TableViewId): readonly string[] {
    return this.visibleColumns(viewId)().map((col) => col.id);
  }

  private readState(viewId: TableViewId): TableViewState {
    const stateSignal = this.states.get(viewId);
    if (!stateSignal) {
      throw new Error(`Vista tabella non registrata: ${viewId}`);
    }
    return stateSignal();
  }

  private commit(viewId: TableViewId, state: TableViewState): void {
    this.states.get(viewId)!.set(state);
    this.persistLocal(viewId, state);
    void this.persistRemote(viewId, state);
  }

  private async hydrateFromServer(
    viewId: TableViewId,
    defs: readonly TableColumnDef[],
    presets: TableViewPresetMap,
  ): Promise<void> {
    if (!this.storageKey(viewId)) {
      return;
    }
    const remote = await firstValueFrom(this.api.load(viewId));
    if (!remote) {
      return;
    }
    const fallback = createDefaultViewState(defs, presets);
    const merged: TableViewState = reconcileStateWithDefs(
      {
        presetId: remote.presetId ?? PresetId.Default,
        columnOrder: remote.columnOrder?.length ? remote.columnOrder : fallback.columnOrder,
        hiddenColumnIds: remote.hiddenColumnIds ?? [],
        pinnedColumnIds: remote.pinnedColumnIds ?? [],
        columnWidths: remote.columnWidths ?? fallback.columnWidths,
      },
      defs,
    );
    this.states.get(viewId)!.set(merged);
    this.persistLocal(viewId, merged);
  }

  private async persistRemote(viewId: TableViewId, state: TableViewState): Promise<void> {
    if (!this.storageKey(viewId)) {
      return;
    }
    await firstValueFrom(this.api.save(viewId, state));
  }

  private storageKey(viewId: TableViewId): string | null {
    const user = this.authService.currentUser();
    if (!user?.id || !user.tenantId) {
      return null;
    }
    return `vf-table-view:${user.id}:${user.tenantId}:${viewId}`;
  }

  private loadState(
    viewId: TableViewId,
    defs: readonly TableColumnDef[],
    presets: TableViewPresetMap,
  ): TableViewState {
    const fallback = createDefaultViewState(defs, presets);
    const key = this.storageKey(viewId);
    if (!key) {
      return fallback;
    }
    try {
      const raw = this.document.defaultView?.localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      const parsed = parseTableViewStateJson(raw);
      if (!parsed) {
        return fallback;
      }
      return reconcileStateWithDefs(
        {
          presetId: parsed.presetId ?? PresetId.Default,
          columnOrder: parsed.columnOrder.length ? parsed.columnOrder : fallback.columnOrder,
          hiddenColumnIds: parsed.hiddenColumnIds,
          pinnedColumnIds: parsed.pinnedColumnIds,
          columnWidths: parsed.columnWidths,
        },
        defs,
      );
    } catch {
      return fallback;
    }
  }

  private persistLocal(viewId: TableViewId, state: TableViewState): void {
    const key = this.storageKey(viewId);
    if (!key) {
      return;
    }
    try {
      this.document.defaultView?.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // localStorage non disponibile: preferenza solo in sessione.
    }
  }
}
