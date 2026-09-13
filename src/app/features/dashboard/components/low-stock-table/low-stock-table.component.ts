import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import type { LowStockRow } from '../../models/dashboard-view.model';

/**
 * Varianti sotto soglia (dumb puro): numero sempre leggibile, mai solo colore.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A8, 11/09/2026): era una `<table>` a mano
 *    con la propria griglia. È un'ANTEPRIMA della dashboard — poche righe, il
 *    collegamento «Vedi tutte» porta all'elenco vero — quindi senza vista di
 *    colonne, senza filtri e senza riga totali: comandi senza significato su
 *    un'anteprima. Restano grammatica, ordinamento e card sotto `lg`.
 */
@Component({
  selector: 'app-low-stock-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './low-stock-table.component.html',
  styleUrl: './low-stock-table.component.scss',
})
export class LowStockTableComponent {
  readonly rows = input.required<readonly LowStockRow[]>();

  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (row: LowStockRow): string => `${row.variantId}·${row.locationId}`;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    { id: 'variant', label: 'Variante', defaultVisible: true, cardTitle: true, pinned: false },
    { ...colonna('sku', { defaultVisible: true, defaultWidthPx: 140 }), pinned: false },
    { ...colonna('location', { defaultVisible: true, defaultWidthPx: 160 }), pinned: false },
    { ...colonna('available', { defaultVisible: true, defaultWidthPx: 110 }), pinned: false },
    { ...colonna('minThreshold', { defaultVisible: true, defaultWidthPx: 100 }), pinned: false },
  ];

  protected readonly testoCella = (row: LowStockRow, colonna: string): string => {
    switch (colonna) {
      case 'variant':
        return row.title;
      case 'sku':
        return row.sku;
      case 'location':
        return row.locationName;
      case 'available':
        return String(row.available);
      case 'minThreshold':
        return String(row.minThreshold);
      default:
        return '';
    }
  };

  private readonly numeroDi = (row: LowStockRow, colonna: string): number | null => {
    if (colonna === 'available') {
      return row.available;
    }
    if (colonna === 'minThreshold') {
      return row.minThreshold;
    }
    return null;
  };

  protected readonly sezioni = computed<readonly DataTableSection<LowStockRow>[]>(() => [
    {
      id: 'sotto-scorta',
      rows: ordinaPerColonne(this.rows(), this.ordine(), {
        cellText: this.testoCella,
        numeroDi: this.numeroDi,
      }),
    },
  ]);
}
