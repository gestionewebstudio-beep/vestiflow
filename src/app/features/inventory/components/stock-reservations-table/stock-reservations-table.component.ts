import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import {
  reservationChannelLabel,
  type StockReservationRow,
} from '@domain/inventory/models/stock-reservation.model';
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

/**
 * Gli ordini che compongono la quantità Impegnata di una variante in una sede,
 * nel pannello laterale delle Giacenze.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A20, 11/09/2026): era un `<ul>` di card
 *    scritte a mano. È un elenco di registrazioni: colonne dal catalogo
 *    (Origine, Sede), ordinamento, card sotto `lg`, e la riga totali sulla
 *    quantità — la somma delle righe deve tornare con l'Impegnata dichiarata
 *    in testa al pannello, ed è così che la si verifica.
 */
@Component({
  selector: 'app-stock-reservations-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DataTableRowCardDirective],
  templateUrl: './stock-reservations-table.component.html',
  styleUrl: './stock-reservations-table.component.scss',
})
export class StockReservationsTableComponent {
  readonly rows = input.required<readonly StockReservationRow[]>();

  protected readonly channelLabel = reservationChannelLabel;
  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (r: StockReservationRow): string => r.id;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    { ...colonna('source', { defaultVisible: true, defaultWidthPx: 110 }), pinned: false },
    {
      ...colonna('reference', {
        label: 'Ordine',
        display: 'code',
        defaultVisible: true,
        defaultWidthPx: 100,
        cardTitle: true,
      }),
      pinned: false,
    },
    {
      id: 'quantity',
      label: 'Quantità',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 90,
      pinned: false,
    },
    { ...colonna('location', { defaultVisible: true }), pinned: false },
  ];

  protected readonly testoCella = (r: StockReservationRow, id: string): string => {
    switch (id) {
      case 'source':
        return this.channelLabel(r.channel);
      case 'reference':
        return r.orderNumber;
      case 'quantity':
        return String(r.quantity);
      case 'location':
        return r.locationName;
      default:
        return '';
    }
  };

  protected readonly sezioni = computed<readonly DataTableSection<StockReservationRow>[]>(() => [
    {
      id: 'prenotazioni',
      rows: ordinaPerColonne(this.rows(), this.ordine(), {
        cellText: this.testoCella,
        numeroDi: (r, id) => (id === 'quantity' ? r.quantity : null),
      }),
    },
  ]);

  protected readonly totali = computed<DataTableTotals>(() =>
    totaliDiElenco(this.rows(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.colonne,
      campi: { quantity: { valore: (r) => r.quantity, formato: String } },
    }),
  );
}
