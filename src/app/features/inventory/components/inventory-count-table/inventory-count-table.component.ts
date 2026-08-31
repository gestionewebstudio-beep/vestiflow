import { formatDate } from '@core/utils/date.util';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  InventoryCountStatus,
  type InventoryCountSession,
} from '@core/models/inventory-count.model';
import { formatDateTime } from '@core/utils/date.util';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowActionsDirective } from '@shared/components/data-table/data-table-row-actions.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { sezioniDiElenco } from '@shared/models/list-grouping.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

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

  /**
   * ⭐ **Raggruppare per giornata**, deciso dalla pagina che possiede il controllo
   * «Raggruppa». Qui arriva già risolto: la tabella non conosce il menu, sa solo
   * se piegare l'elenco per giorno.
   */
  readonly groupByDay = input(false);

  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<InventoryCountSession>();
  readonly deleteClick = output<InventoryCountSession>();
  readonly selectionToggle = output<{ readonly sessionId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  protected readonly InventoryCountStatus = InventoryCountStatus;
  protected readonly statusLabel = inventoryCountStatusLabel;
  protected readonly statusTone = inventoryCountStatusTone;

  /*
    ⭐ **I filtri di colonna** (`14` §0.2), coi due estrattori che servono qui:
    «Differenze» è numerica, «Creata il» e «Completata il» sono date.

    ⚠️ **«Progresso» resta fuori da entrambi**: «3 / 39» non è un numero, è un
    rapporto — si filtra come testo, che è la deduzione di serie.
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.sessions,
    cellText: (session, columnId) => this.cellText(session, columnId),
    numeroDi: (session, columnId) => (columnId === 'deltas' ? session.linesWithDelta : null),
    dataDi: (session, columnId) => {
      if (columnId === 'createdAt') {
        return session.createdAt;
      }
      return columnId === 'completedAt' ? (session.completedAt ?? null) : null;
    },
  });

  /**
   * ⚠️ **Il subtotale conta le righe con scostamento**, che è la domanda della
   * giornata su un inventario: quante differenze ha prodotto. ⛔ Non si somma la
   * percentuale di avanzamento — la somma di due rapporti non è un rapporto.
   */
  protected readonly sections = computed<readonly DataTableSection<InventoryCountSession>[]>(() =>
    sezioniDiElenco(this.righe(), this.groupByDay(), {
      idPiatto: 'sessioni',
      giornoDi: (session) => session.createdAt,
      columns: this.columns(),
      emphasis: 'deltas',
      campi: {
        deltas: { valore: (s) => s.linesWithDelta, formato: (n) => String(n) },
      },
    }),
  );
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.columns(), columnId);
  }

  protected readonly rowId = (session: InventoryCountSession): string => session.id;

  protected readonly rowLabelFor = (session: InventoryCountSession): string =>
    `Apri la sessione ${session.name}`;

  protected readonly selectionLabel = (session: InventoryCountSession): string =>
    `Seleziona ${session.name}`;

  /*
    ⭐ **Si somma solo il numero di DIFFERENZE**: è il dato per cui si guarda
    questo elenco — quante righe non tornano, in tutto.

    ⛔ **«Progresso» non si somma**: «3 / 39» non è un numero, è un rapporto. La
    somma di due rapporti non è un rapporto.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righe(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
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
      case 'completedAt':
        return session.completedAt ? formatDate(session.completedAt) : '—';
      case 'createdByName':
        return session.createdByName || '—';
      case 'notes':
        return session.notes?.trim() || '—';
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
