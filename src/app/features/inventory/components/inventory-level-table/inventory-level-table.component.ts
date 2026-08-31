import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { stockStatusLabel, stockStatusTone } from '../../models/inventory-labels.util';
import type { InventoryLevelRow } from '../../models/inventory-view.model';

/**
 * Tabella giacenze per variante × sede. Dumb puro: riceve righe già join-ate.
 *
 * ⭐ **Sul motore comune** dal 30/08/2026. Qui resta solo ciò che è DELLE
 * GIACENZE: come si legge il testo di ogni colonna, e le due celle che non sono
 * testo — la quantità impegnata, che è un comando, e lo stato.
 */
@Component({
  selector: 'app-inventory-level-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './inventory-level-table.component.html',
  styleUrl: './inventory-level-table.component.scss',
})
export class InventoryLevelTableComponent {
  readonly rows = input.required<readonly InventoryLevelRow[]>();

  /**
   * ⭐ **Sotto `lg` il tocco SELEZIONA invece di aprire**, quando la modalità
   * «Seleziona» del telaio è accesa.
   *
   * ⚠️ Input di passaggio: la tabella non decide, inoltra al motore. La modalità
   * la possiede la pagina (`createSelectionMode`), che è anche l'unica a poter
   * azzerare la selezione quando si spegne.
   */
  readonly rowClickSelects = input(false);
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly committedClick = output<InventoryLevelRow>();
  readonly selectionToggle = output<{ readonly rowId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<InventoryLevelRow>[]>(() => [
    { id: 'giacenze', rows: this.rows() },
  ]);
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return this.columns().some((column) => column.id === columnId);
  }

  /*
    ⚠️ **L'identità è la COPPIA variante-sede**, non la variante: la stessa
    variante compare una volta per ogni sede in cui esiste, e usare il solo
    `variantId` farebbe selezionare tutte le sue righe insieme.
  */
  protected readonly rowId = (row: InventoryLevelRow): string =>
    `${row.variantId}-${row.locationId}`;

  protected readonly selectionLabel = (row: InventoryLevelRow): string =>
    `Seleziona ${row.title} in ${row.locationName}`;

  /*
    ⭐ **Le quantità si sommano, ed è il dato che si va a leggere**: filtrando per
    sede o per articolo, «quanti pezzi in tutto» è la domanda.

    ⚠️ **La soglia minima NON si somma.** È un parametro per riga, non una
    grandezza: sommare le soglie di venti varianti dà un numero che non
    corrisponde a niente.
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const q = (n: number): string => String(n);
    return totaliDiElenco(this.rows(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.columns(),
      campi: {
        available: { valore: (r) => r.available, formato: q },
        onHand: { valore: (r) => r.onHand, formato: q },
        committed: { valore: (r) => r.committed, formato: q },
        incoming: { valore: (r) => r.incoming, formato: q },
      },
    });
  });

  /*
    ⭐ **Sette colonne su nove sono testo o numeri**, e stanno tutte qui: dare a
    ognuna un `ng-template` sarebbe stato ripetere sette volte la stessa riga.
  */
  protected readonly cellText = (row: InventoryLevelRow, columnId: string): string => {
    switch (columnId) {
      case 'title':
        return row.title;
      case 'sku':
        // ⚠️ Il codice articolo VestiFlow, con lo SKU della variante come ripiego.
        return row.articleCode || row.sku || '—';
      case 'locationName':
        return row.locationName;
      case 'available':
        return String(row.available);
      case 'onHand':
        return String(row.onHand);
      case 'committed':
        return String(row.committed);
      case 'incoming':
        return String(row.incoming);
      case 'minThreshold':
        return row.minThreshold === null || row.minThreshold === undefined
          ? '—'
          : String(row.minThreshold);
      default:
        return '';
    }
  };

  protected onCommittedClick(row: InventoryLevelRow): void {
    this.committedClick.emit(row);
  }
}
