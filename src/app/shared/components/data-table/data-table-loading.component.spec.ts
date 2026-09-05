import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableComponent } from './data-table.component';
import { DataTableCellDirective } from './data-table-cell.directive';
import type { DataTableSection } from './data-table.model';

interface Row {
  readonly id: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DataTableCellDirective],
  template: `
    <app-data-table
      [columns]="columns"
      [sections]="sections()"
      [rowId]="rowId"
      [cellText]="text"
      [virtualizza]="true"
      [selectionMode]="selectionMode()"
      [selectedIds]="selectedIds()"
      (selectAllChange)="selectAll($event)"
    >
      <ng-template appCell="id" let-row>{{ row.id }}</ng-template>
    </app-data-table>
  `,
})
class LoadingTableComponent {
  readonly columns = [{ id: 'id', label: 'ID', pinned: false }];
  readonly sections = signal<readonly DataTableSection<Row>[]>([{ id: 'all', rows: [] }]);
  readonly rowId = (row: Row): string => row.id;
  readonly selectionMode = signal<'none' | 'multiple'>('none');
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  selectAll(selected: boolean): void {
    this.selectedIds.set(
      new Set(selected ? this.sections().flatMap((s) => s.rows.map(this.rowId)) : []),
    );
  }
  readonly visited = new Set<string>();
  readonly text = (row: Row): string => {
    this.visited.add(row.id);
    return row.id;
  };
}

describe('DataTable: dati arrivati mentre il contenitore non è misurabile', () => {
  beforeEach(() => {
    // jsdom restituisce clientHeight=0, come lo slot dati staccato durante il loading.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          /* La misura iniziale è già eseguita da afterNextRender. */
        }
        disconnect(): void {
          /* Nessun osservatore del browser in jsdom. */
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('non visita tutte le righe fra lo stato vuoto e la prima misura valida', async () => {
    const { fixture, container } = await render(LoadingTableComponent);
    const host = fixture.componentInstance;
    host.sections.set([
      { id: 'all', rows: Array.from({ length: 1_000 }, (_, i) => ({ id: `r-${i}` })) },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.visited.size).toBeGreaterThan(0);
    expect(host.visited.size).toBeLessThan(120);
    expect(container.querySelectorAll('.data-table__row').length).toBeLessThan(120);
    expect(container.querySelector('table')?.getAttribute('aria-rowcount')).toBe('1001');
  });

  it('seleziona tutto include le righe fuori finestra e conserva le identità dopo il riordino', async () => {
    const { fixture, container } = await render(LoadingTableComponent);
    const host = fixture.componentInstance;
    const rows = Array.from({ length: 1_000 }, (_, i) => ({ id: `r-${i}` }));
    host.selectionMode.set('multiple');
    host.sections.set([{ id: 'all', rows }]);
    host.selectedIds.set(new Set(rows.slice(0, -1).map(host.rowId)));
    fixture.detectChanges();
    await fixture.whenStable();
    const all = screen.getByRole('checkbox', { name: 'Seleziona tutte le righe della pagina' });
    // Tutte le righe visibili sono selezionate, ma l'ultima fuori finestra no.
    expect(all).toBePartiallyChecked();
    fireEvent.click(all);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.selectedIds().size).toBe(1_000);
    expect(host.selectedIds().has('r-999')).toBe(true);
    host.selectedIds.set(new Set(['r-999']));
    host.sections.set([{ id: 'all', rows: [...rows].reverse() }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      container.querySelector('.data-table__row.is-selected')?.getAttribute('data-row-id'),
    ).toBe('r-999');
    expect(container.querySelectorAll('.data-table__row.is-selected')).toHaveLength(1);
  });

  it('con testate e piedi di sezione conserva il rendering completo', async () => {
    const { fixture, container } = await render(LoadingTableComponent);
    fixture.componentInstance.sections.set([
      {
        id: 'first',
        header: 'Prima sezione',
        rows: [{ id: 'one' }],
        footer: { label: 'Primo totale', values: {} },
      },
      {
        id: 'second',
        header: 'Seconda sezione',
        rows: [{ id: 'two' }],
        footer: { label: 'Secondo totale', values: {} },
      },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(container.querySelectorAll('.data-table__row')).toHaveLength(2);
    expect(container.querySelectorAll('.data-table__section-head')).toHaveLength(2);
    expect(container.querySelectorAll('.data-table__section-total')).toHaveLength(2);
    expect(container.querySelectorAll('.data-table__spacer')).toHaveLength(0);
  });
});
