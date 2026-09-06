import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import { DataTableCellDirective } from './data-table-cell.directive';
import { DataTableComponent } from './data-table.component';
import { DataTableRowActionsDirective } from './data-table-row-actions.directive';
import { DataTableRowCardDirective } from './data-table-row-card.directive';

interface Row {
  readonly id: string;
  readonly name: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    DataTableRowActionsDirective,
  ],
  template: `
    <app-data-table
      [columns]="columns"
      [sections]="sections"
      [rowId]="rowId"
      [cellText]="text"
      [rowClickable]="true"
      rowActionsLabel="Azioni"
      (rowClick)="open($event)"
    >
      @if (templatesVisible()) {
        <ng-template [appCell]="column()" let-row>
          <strong class="rich-cell">{{ prefix() }} {{ row.name }}</strong>
        </ng-template>
        <ng-template appRowCard let-row>
          <span class="rich-card">Card {{ prefix() }} {{ row.name }}</span>
        </ng-template>
        <ng-template appRowActions let-row>
          <button (click)="action(row)">Azione {{ row.name }}</button>
        </ng-template>
      }
    </app-data-table>
  `,
})
class TemplateTableComponent {
  readonly columns = [
    { id: 'name', label: 'Nome', pinned: false },
    { id: 'other', label: 'Altro', pinned: false },
  ];
  readonly sections = [
    { id: 'a', header: 'Gruppo A', rows: [{ id: '1', name: 'Alfa' }] },
    {
      id: 'b',
      rows: [{ id: '2', name: 'Beta' }],
      footer: { label: 'Totale B', values: { other: '10' } },
    },
  ];
  readonly rowId = (row: Row): string => row.id;
  readonly text = (row: Row): string => row.name;
  readonly templatesVisible = signal(true);
  readonly column = signal('name');
  readonly prefix = signal('Prima');
  readonly open = vi.fn();
  readonly action = vi.fn();
}

describe('DataTable: template proiettati reattivi con più sezioni', () => {
  it('aggiorna la colonna del template e i dati catturati senza cambiare le righe', async () => {
    const { fixture, container } = await render(TemplateTableComponent);
    expect(container.querySelectorAll('td[data-label="Nome"] .rich-cell')).toHaveLength(2);
    fixture.componentInstance.column.set('other');
    fixture.componentInstance.prefix.set('Dopo');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(container.querySelectorAll('td[data-label="Nome"] .rich-cell')).toHaveLength(0);
    expect(container.querySelectorAll('td[data-label="Altro"] .rich-cell')).toHaveLength(2);
    expect(container.querySelector('.rich-cell')?.textContent).toContain('Dopo Alfa');
    expect(container.querySelector('.rich-card')?.textContent).toContain('Dopo Alfa');
    expect(screen.getByText('Totale B')).toBeTruthy();
  });

  it('rimuove e ricrea celle, card e azioni condizionali; il comando non apre la riga', async () => {
    const { fixture, container } = await render(TemplateTableComponent);
    fireEvent.click(screen.getByRole('button', { name: 'Azione Beta' }));
    expect(fixture.componentInstance.action).toHaveBeenCalledWith({ id: '2', name: 'Beta' });
    expect(fixture.componentInstance.open).not.toHaveBeenCalled();
    fixture.componentInstance.templatesVisible.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(container.querySelectorAll('.rich-cell, .data-table__card')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Azione Beta' })).toBeNull();
    expect(container.querySelector('td[data-label="Nome"]')?.textContent).toContain('Alfa');
    fixture.componentInstance.templatesVisible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(container.querySelectorAll('.rich-cell')).toHaveLength(2);
    expect(container.querySelectorAll('.rich-card')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Azione Beta' })).toBeTruthy();
  });
});
