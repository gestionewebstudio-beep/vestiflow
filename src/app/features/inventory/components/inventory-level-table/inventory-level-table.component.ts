import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { colonnaVisibile, valoreCard } from '@shared/models/list-card-fields.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

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

  /** La vista, e con essa i filtri di colonna (`14` §0.2). */
  readonly viewId = input<TableViewId>();

  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly committedClick = output<InventoryLevelRow>();
  readonly selectionToggle = output<{ readonly rowId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;

  /** Lista piatta: una sezione senza intestazione né piede. */
  /**
   * ⭐ **L'ordinamento delle colonne**, chiesto il 01/09/2026: «nemmeno in
   * giacenze, situazione e inventario è possibile l'ordinamento interno delle
   * colonne». In memoria, perché l'elenco è caricato tutto.
   */
  readonly sortState = signal<readonly DataTableSort[]>([]);

  private readonly ordinate = computed(() =>
    ordinaPerColonne(this.righe(), this.sortState(), {
      cellText: (riga, columnId) => this.cellText(riga, columnId),
      numeroDi: (riga, columnId) => this.numeroDiColonna(riga, columnId),
    }),
  );

  /**
   * Il numero di una colonna, per il filtro a intervallo e per l'ordinamento.
   *
   * ⚠️ **Una funzione sola per i due**: erano lo stesso elenco di colonne, e
   * tenerne due copie è il modo in cui una colonna si filtra e non si ordina.
   */
  private numeroDiColonna(row: InventoryLevelRow, columnId: string): number | null {
    switch (columnId) {
      case 'available':
        return row.available;
      case 'onHand':
        return row.onHand;
      case 'committed':
        return row.committed;
      case 'incoming':
        return row.incoming;
      case 'minThreshold':
        return row.minThreshold ?? null;
      default:
        return null;
    }
  }

  protected readonly sections = computed<readonly DataTableSection<InventoryLevelRow>[]>(() => [
    { id: 'giacenze', rows: this.ordinate() },
  ]);
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  /** ⚠️ In cima a una card un trattino è un segno nudo: si omette. */
  protected readonly valoreCard = valoreCard;

  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.columns(), columnId);
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
    ⭐ **I filtri di colonna** (`14` §0.2). Le cinque colonne numeriche hanno il
    loro estrattore: senza, i due campi da–a compaiono e non restringono niente.
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.rows,
    cellText: (row, columnId) => this.cellText(row, columnId),
    numeroDi: (row, columnId) => this.numeroDiColonna(row, columnId),
  });

  /*
    ⭐ **Le quantità si sommano, ed è il dato che si va a leggere**: filtrando per
    sede o per articolo, «quanti pezzi in tutto» è la domanda.

    ⚠️ **La soglia minima NON si somma.** È un parametro per riga, non una
    grandezza: sommare le soglie di venti varianti dà un numero che non
    corrisponde a niente.
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const q = (n: number): string => String(n);
    return totaliDiElenco(this.righe(), {
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
