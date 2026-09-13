import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { DataTableComponent } from './data-table.component';
import type { DataTableSection } from './data-table.model';

/**
 * ⭐ **Le sezioni COMPRIMIBILI del motore** (`docs/26` D3, 11/09/2026).
 *
 * Aggiunte per i Codici IVA raggruppati per Natura, che si leggono un gruppo
 * alla volta. ⛔ **Nascono spente**: una sezione che non dichiara `collapsible`
 * non ha nessun pulsante e rende come prima — è ciò che tiene ferme le tabelle
 * raggruppate di oggi (i documenti per giorno).
 */

interface Riga {
  readonly id: string;
  readonly codice: string;
}

const COLONNE: readonly ResolvedTableColumn[] = [{ id: 'code', label: 'Codice', pinned: false }];

@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [columns]="colonne"
      [sections]="sezioni"
      [rowId]="rowId"
      [cellText]="cellText"
    />
  `,
})
class OspiteComponent {
  readonly colonne = COLONNE;
  readonly sezioni: readonly DataTableSection<Riga>[] = [
    {
      id: 'ordinaria',
      header: 'IVA ordinaria',
      collapsible: true,
      rows: [
        { id: 'a', codice: '22' },
        { id: 'b', codice: '10' },
      ],
    },
    {
      id: 'esente',
      header: 'Esente',
      rows: [{ id: 'c', codice: 'N4' }],
    },
  ];
  readonly rowId = (r: Riga): string => r.id;
  readonly cellText = (r: Riga): string => r.codice;
}

const righe = () => document.querySelectorAll('tbody tr.data-table__row').length;

describe('sezioni comprimibili', () => {
  it('⭐ una sezione `collapsible` ha il titolo come pulsante, aperta per default', async () => {
    await render(OspiteComponent);

    const pulsante = screen.getByRole('button', { name: 'IVA ordinaria' });
    expect(pulsante.getAttribute('aria-expanded')).toBe('true');
    expect(righe()).toBe(3);
  });

  it('⭐ chiusa non rende le righe, riaperta le rende di nuovo', async () => {
    await render(OspiteComponent);
    const pulsante = screen.getByRole('button', { name: 'IVA ordinaria' });

    await userEvent.click(pulsante);
    expect(pulsante.getAttribute('aria-expanded')).toBe('false');
    // Restano le righe dell'altra sezione: chiudere un gruppo non tocca gli altri.
    expect(righe()).toBe(1);
    expect(screen.queryByText('22')).toBeNull();
    expect(screen.getAllByText('N4').length).toBeGreaterThan(0);

    await userEvent.click(pulsante);
    expect(righe()).toBe(3);
  });

  it('⛔ una sezione senza `collapsible` non ha nessun pulsante: rende come prima', async () => {
    await render(OspiteComponent);

    expect(screen.queryByRole('button', { name: 'Esente' })).toBeNull();
    expect(screen.getByText('Esente')).toBeVisible();
  });
});
