import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import type { LocationReportRow } from '../../models/report-view.model';

/**
 * Report giacenze per sede (dumb puro): numeri a destra, tabular-nums.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A10, 11/09/2026): era una `<table>` a mano.
 *    Con la **riga totali**: varianti tracciate, pezzi, sotto soglia e valore
 *    sono grandezze additive, e la somma delle sedi è il dato dell'azienda
 *    intera — l'unico posto dove si legge. Senza vista di colonne né filtri: una
 *    riga per sede, e le sedi sono poche.
 */
@Component({
  selector: 'app-report-location-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './report-location-table.component.html',
  styleUrl: './report-location-table.component.scss',
})
export class ReportLocationTableComponent {
  readonly rows = input.required<readonly LocationReportRow[]>();

  protected readonly formatMoney = formatMoney;
  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (row: LocationReportRow): string => row.locationId;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    { ...colonna('location', { defaultVisible: true, cardTitle: true }), pinned: false },
    {
      id: 'trackedVariants',
      label: 'Varianti tracciate',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 150,
      pinned: false,
    },
    {
      id: 'availableUnits',
      label: 'Pezzi disponibili',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 140,
      pinned: false,
    },
    {
      id: 'lowStockCount',
      label: 'Sotto soglia',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 120,
      pinned: false,
    },
    {
      id: 'stockValue',
      label: 'Valore stock',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 140,
      pinned: false,
    },
  ];

  protected readonly testoCella = (row: LocationReportRow, colonna: string): string => {
    switch (colonna) {
      case 'location':
        return row.locationName;
      case 'trackedVariants':
        return String(row.trackedVariants);
      case 'availableUnits':
        return String(row.availableUnits);
      case 'lowStockCount':
        return String(row.lowStockCount);
      case 'stockValue':
        return formatMoney(row.stockValue);
      default:
        return '';
    }
  };

  private readonly numeroDi = (row: LocationReportRow, colonna: string): number | null => {
    switch (colonna) {
      case 'trackedVariants':
        return row.trackedVariants;
      case 'availableUnits':
        return row.availableUnits;
      case 'lowStockCount':
        return row.lowStockCount;
      case 'stockValue':
        return row.stockValue.amountMinor;
      default:
        return null;
    }
  };

  private readonly righeOrdinate = computed(() =>
    ordinaPerColonne(this.rows(), this.ordine(), {
      cellText: this.testoCella,
      numeroDi: this.numeroDi,
    }),
  );

  protected readonly sezioni = computed<readonly DataTableSection<LocationReportRow>[]>(() => [
    { id: 'sedi', rows: this.righeOrdinate() },
  ]);

  /** La somma delle sedi è l'azienda intera: il valore si somma in unità minori e si formatta all'uscita. */
  protected readonly totali = computed<DataTableTotals>(() => {
    const valuta = this.rows()[0]?.stockValue.currencyCode ?? 'EUR';
    return totaliDiElenco(this.righeOrdinate(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.colonne,
      campi: {
        trackedVariants: { valore: (r) => r.trackedVariants, formato: String },
        availableUnits: { valore: (r) => r.availableUnits, formato: String },
        lowStockCount: { valore: (r) => r.lowStockCount, formato: String },
        stockValue: {
          valore: (r) => r.stockValue.amountMinor,
          formato: (n) => formatMoney({ amountMinor: n, currencyCode: valuta }),
        },
      },
    });
  });
}
