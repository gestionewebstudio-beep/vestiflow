import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  InventoryCountStatus,
  type InventoryCountSession,
} from '@core/models/inventory-count.model';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowActionsDirective } from '@shared/components/data-table/data-table-row-actions.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import {
  inventoryCountStatusLabel,
  inventoryCountStatusTone,
} from '../../models/inventory-count-labels.util';

/**
 * Tabella sessioni di inventario fisico (dumb puro).
 *
 * ⭐ **Sul motore comune** dal 30/08/2026: qui resta ciò che è DELL'INVENTARIO —
 * come si legge ogni colonna, lo stato e il comando di eliminazione.
 */
@Component({
  selector: 'app-inventory-count-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    DataTableRowActionsDirective,
  ],
  templateUrl: './inventory-count-table.component.html',
  styleUrl: './inventory-count-table.component.scss',
})
export class InventoryCountTableComponent {
  readonly sessions = input.required<readonly InventoryCountSession[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly rowClick = output<InventoryCountSession>();
  readonly deleteClick = output<InventoryCountSession>();

  protected readonly InventoryCountStatus = InventoryCountStatus;
  protected readonly statusLabel = inventoryCountStatusLabel;
  protected readonly statusTone = inventoryCountStatusTone;

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<InventoryCountSession>[]>(() => [
    { id: 'sessioni', rows: this.sessions() },
  ]);
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return this.columns().some((column) => column.id === columnId);
  }

  protected readonly rowId = (session: InventoryCountSession): string => session.id;

  protected readonly rowLabelFor = (session: InventoryCountSession): string =>
    `Apri la sessione ${session.name}`;

  /*
    ⭐ **Si somma solo il numero di DIFFERENZE**: è il dato per cui si guarda
    questo elenco — quante righe non tornano, in tutto.

    ⛔ **«Progresso» non si somma**: «3 / 39» non è un numero, è un rapporto. La
    somma di due rapporti non è un rapporto.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.sessions(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.columns(),
      campi: {
        deltas: { valore: (s) => s.linesWithDelta, formato: (n) => String(n) },
      },
    }),
  );

  protected readonly cellText = (session: InventoryCountSession, columnId: string): string => {
    switch (columnId) {
      case 'name':
        return session.name;
      case 'location':
        return session.locationName;
      case 'progress':
        return this.progress(session);
      case 'deltas':
        return String(session.linesWithDelta);
      case 'createdAt':
        return formatDateTime(session.createdAt);
      default:
        return '';
    }
  };

  /** ⚠️ Senza righe è «0 / 0», non vuoto: una sessione appena creata esiste. */
  private progress(session: InventoryCountSession): string {
    if (session.lineCount === 0) {
      return '0 / 0';
    }
    return `${session.linesCounted} / ${session.lineCount}`;
  }

  protected onDeleteClick(event: Event, session: InventoryCountSession): void {
    event.stopPropagation();
    this.deleteClick.emit(session);
  }
}
