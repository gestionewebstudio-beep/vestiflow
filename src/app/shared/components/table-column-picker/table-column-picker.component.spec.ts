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

describe('TableColumnPickerComponent — interruttore del riordino', () => {
  it('di default le frecce ci sono: gli elenchi leggono l’ordine salvato', async () => {
    await apri({});

    expect(screen.getAllByRole('button', { name: 'Sposta su' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Sposta giù' }).length).toBeGreaterThan(0);
  });

  // Sulle maschere documento le colonne sono rese in sequenza fissa nel
  // template: la freccia si premeva e non accadeva niente. Un comando che finge
  // di funzionare è peggio di un comando che manca — chi lo preme non conclude
  // «non si può», conclude «non ha funzionato», e ci riprova.
  it('spento, le frecce non ci sono', async () => {
    await apri({ reorderable: false });

    expect(screen.queryByRole('button', { name: 'Sposta su' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sposta giù' })).toBeNull();
  });

  it('spento, le spunte mostra/nascondi restano', async () => {
    await apri({ reorderable: false });

    expect(screen.getByLabelText('SKU')).toBeVisible();
    expect(screen.getByLabelText('Nome prodotto')).toBeVisible();
  });
});
