import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
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

import {
  financialStatusLabel,
  financialStatusTone,
} from '@domain/sales-orders/models/sales-order-labels.util';

import type { RecentSaleRow } from '../../models/dashboard-view.model';

/**
 * Ultime vendite (dumb puro): row click verso il dettaglio vendita.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A9, 11/09/2026): era una `<table>` a mano.
 *    Anteprima della dashboard: niente vista di colonne, filtri o riga totali —
 *    il totale di «ultime cinque vendite» non è un numero che dica qualcosa.
 *    Colonne dal catalogo (Cliente, Stato, Data, Totale), ordinamento per
 *    numero, data e importo, card sotto `lg`.
 */
@Component({
  selector: 'app-recent-sales-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './recent-sales-table.component.html',
  styleUrl: './recent-sales-table.component.scss',
})
export class RecentSalesTableComponent {
  readonly rows = input.required<readonly RecentSaleRow[]>();

  readonly rowClick = output<RecentSaleRow>();

  protected readonly statusLabel = financialStatusLabel;
  protected readonly statusTone = financialStatusTone;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (row: RecentSaleRow): string => row.orderId;
  protected readonly rowLabel = (row: RecentSaleRow): string => `Apri vendita ${row.orderNumber}`;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    {
      id: 'order',
      label: 'Ordine',
      display: 'code',
      defaultVisible: true,
      cardTitle: true,
      defaultWidthPx: 110,
      pinned: false,
    },
    { ...colonna('customerName', { defaultVisible: true }), pinned: false },
    { ...colonna('status', { defaultVisible: true, defaultWidthPx: 130 }), pinned: false },
    { ...colonna('documentDate', { defaultVisible: true, defaultWidthPx: 120 }), pinned: false },
    { ...colonna('total', { defaultVisible: true, defaultWidthPx: 120 }), pinned: false },
  ];

  protected readonly testoCella = (row: RecentSaleRow, colonna: string): string => {
    switch (colonna) {
      case 'order':
        return row.orderNumber;
      case 'customerName':
        return row.customerName;
      case 'status':
        return financialStatusLabel(row.financialStatus);
      case 'documentDate':
        return formatDate(row.placedAt);
      case 'total':
        return formatMoney(row.total);
      default:
        return '';
    }
  };

  // ⚠️ Data e importo si ordinano sul VALORE, non sul testo formattato.
  private readonly numeroDi = (row: RecentSaleRow, colonna: string): number | null =>
    colonna === 'total' ? row.total.amountMinor : null;
  private readonly dataDi = (row: RecentSaleRow, colonna: string): string | null =>
    colonna === 'documentDate' ? row.placedAt : null;

  protected readonly sezioni = computed<readonly DataTableSection<RecentSaleRow>[]>(() => [
    {
      id: 'ultime-vendite',
      rows: ordinaPerColonne(this.rows(), this.ordine(), {
        cellText: this.testoCella,
        numeroDi: this.numeroDi,
        dataDi: this.dataDi,
      }),
    },
  ]);
}
