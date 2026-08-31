import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Supplier } from '@core/models/supplier.model';
import { colonnaVisibile, valoreCard } from '@shared/models/list-card-fields.util';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

/**
 * Tabella fornitori (dumb puro).
 *
 * ⭐ **Sul motore comune** dal 31/08/2026, ultimo dei dodici elenchi. Qui resta
 * solo come si legge il testo di ogni colonna: nessuna cella è altro che testo.
 */
@Component({
  selector: 'app-supplier-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DataTableRowCardDirective],
  templateUrl: './supplier-table.component.html',
  styleUrl: './supplier-table.component.scss',
})
export class SupplierTableComponent {
  readonly suppliers = input.required<readonly Supplier[]>();

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

  /**
   * ⭐ **La vista, e con essa i filtri di colonna** (`14` §0.2).
   *
   * Un input solo: lo stato dei filtri vive nello store per vista, quindi non
   * c'è niente da cablare fra pagina, tabella e motore.
   */
  readonly viewId = input<TableViewId>();
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<Supplier>();
  readonly selectionToggle = output<{ readonly supplierId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  /*
    ⚠️ **Si filtra QUI, una volta sola**, e da qui discendono sezioni, riga totali
    e card. Filtrare nel motore lascerebbe i totali sulle righe intere: la regola
    chiede il totale del risultato filtrato.
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.suppliers,
    cellText: (supplier, columnId) => this.cellText(supplier, columnId),
  });

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<Supplier>[]>(() => [
    { id: 'fornitori', rows: this.righe() },
  ]);

  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.columns(), columnId);
  }

  protected readonly rowId = (supplier: Supplier): string => supplier.id;

  protected readonly rowLabelFor = (supplier: Supplier): string => this.rowLabel(supplier);

  protected readonly selectionLabel = (supplier: Supplier): string => `Seleziona ${supplier.name}`;

  /*
    ⚠️ **Nessuna colonna dei fornitori si somma**, e la riga totali resta comunque:
    dice «N voci», che su un'anagrafica filtrata è il dato che si cerca per primo.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righe(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.columns(),
      campi: {},
    }),
  );

  /*
    ⭐ **Otto colonne su otto sono testo**, e stanno tutte qui: dare a ognuna un
    `ng-template` sarebbe stato ripetere otto volte la stessa riga.
  */
  protected readonly cellText = (supplier: Supplier, columnId: string): string => {
    switch (columnId) {
      case 'code':
        return this.displayCode(supplier);
      case 'name':
        return supplier.name;
      case 'vatNumber':
        return this.displayVat(supplier);
      case 'email':
        return supplier.email ?? '—';
      case 'city':
        return this.displayCity(supplier);
      case 'phone':
        return supplier.phone?.trim() || '—';
      case 'paymentTerms':
        return supplier.paymentTerms?.trim() || '—';
      case 'roleStatus':
        return supplier.isActive ? 'Attivo' : 'Disattivato';
      default:
        return '';
    }
  };

  /** ⚠️ Il trattino lungo per il vuoto è la convenzione già in uso qui. */
  /** ⚠️ In cima a una card un trattino è un segno nudo: si omette. */
  protected readonly valoreCard = valoreCard;

  protected displayCode(supplier: Supplier): string {
    return supplier.code?.trim() || '—';
  }

  protected displayVat(supplier: Supplier): string {
    return supplier.vatNumber?.trim() || '—';
  }

  protected displayCity(supplier: Supplier): string {
    return supplier.city?.trim() || '—';
  }

  private rowLabel(supplier: Supplier): string {
    return `Apri fornitore ${supplier.name}`;
  }
}
