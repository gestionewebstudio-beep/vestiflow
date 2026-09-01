import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';

import { TableColumnPickerComponent } from './table-column-picker.component';

import { signal } from '@angular/core';

const COLONNE = [
  { id: 'sku', label: 'SKU', pinned: false, pinnable: false },
  { id: 'product', label: 'Nome prodotto', pinned: false, pinnable: false },
];

function preferenzeFinte() {
  return {
    registerView: vi.fn(),
    columnDefs: vi.fn(() => COLONNE),
    visibleColumns: vi.fn(() => signal(COLONNE).asReadonly()),
    visibleColumnIds: vi.fn(() => COLONNE.map((c) => c.id)),
    state: vi.fn(() =>
      signal({
        presetId: 'default',
        columnOrder: COLONNE.map((c) => c.id),
        hiddenColumnIds: [] as string[],
        pinnedColumnIds: [] as string[],
        columnWidths: {},
      }).asReadonly(),
    ),
    presetMap: vi.fn(() => ({})),
    isColumnVisible: vi.fn(() => true),
    moveColumn: vi.fn(),
    toggleColumn: vi.fn(),
    togglePin: vi.fn(),
    applyPreset: vi.fn(),
    resetToDefault: vi.fn(),
  };
}

async function apri(inputs: Record<string, unknown>) {
  const preferences = preferenzeFinte();
  await render(TableColumnPickerComponent, {
    inputs: { viewId: TableViewId.StockMovements, ...inputs },
    providers: [{ provide: TableColumnPreferenceService, useValue: preferences }],
  });
  await userEvent.setup().click(screen.getByRole('button', { name: /colonne/i }));
  return preferences;
}

/**
 * ⛔ **QUI C'ERANO TRE PROVE SULL'INTERRUTTORE DEL RIORDINO**, tolte insieme
 * alle frecce il 01/09/2026 — decisione del proprietario: «lasciamo solo
 * default e personalizzata, e queste incidono solo su quali sono attive».
 *
 * ⚠️ **Le prove passavano e la funzione era rotta lo stesso**, ed è la ragione
 * per cui vale la pena ricordarlo: verificavano che il bottone ci fosse o non
 * ci fosse, non che premerlo spostasse qualcosa di visibile. Le righe di questo
 * pannello sono sempre in ordine di DEFINIZIONE, mentre la freccia agiva su
 * `columnOrder`, cioè sulla tabella dietro al pannello.
 */
describe('TableColumnPickerComponent — il riordino non esiste più', () => {
  it('⛔ nessuna freccia: l’ordine delle colonne è quello dichiarato', async () => {
    await apri({});

    expect(screen.queryByRole('button', { name: 'Sposta su' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sposta giù' })).toBeNull();
  });

  it('⭐ restano le spunte, che sono ciò che il pannello serve a fare', async () => {
    await apri({});

    expect(screen.getByLabelText('SKU')).toBeVisible();
    expect(screen.getByLabelText('Nome prodotto')).toBeVisible();
  });
});
