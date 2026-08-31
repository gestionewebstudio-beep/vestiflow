import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { colonnaVisibile, valoreCard } from '@shared/models/list-card-fields.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

import { stockStatusLabel, stockStatusTone } from '../../models/inventory-labels.util';
import type { InventorySituationRow } from '@domain/inventory/models/inventory-situation.model';

/**
 * Tabella Situazione magazzino. Dumb puro: righe aggregate per variante, con
 * selezione per il riordino (Nuovo ordine fornitore).
 *
 * ⭐ **Sul motore comune** dal 30/08/2026 — ultimo elenco a entrarci.
 */
@Component({
  selector: 'app-situation-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './situation-table.component.html',
  styleUrl: './situation-table.component.scss',
})
export class SituationTableComponent {
  readonly rows = input.required<readonly InventorySituationRow[]>();

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
  readonly selectedIds = input.required<ReadonlySet<string>>();

  readonly rowToggle = output<InventorySituationRow>();
  readonly pageToggle = output<boolean>();

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;

  /*
    ⛔ **`select` non è una colonna di dati**: la casella la disegna il motore
    (`selectionMode`), fuori dal modello. Resta fra le voci del selettore Colonne
    perché ci è sempre stata, e continua ad accendere e spegnere quello che
    accendeva prima.
  */
  protected readonly engineColumns = computed<readonly ResolvedTableColumn[]>(() =>
    this.columns().filter((column) => column.id !== 'select'),
  );

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<InventorySituationRow>[]>(() => [
    { id: 'situazione', rows: this.righe() },
  ]);
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  /** ⚠️ In cima a una card un trattino è un segno nudo: si omette. */
  protected readonly valoreCard = valoreCard;

  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.engineColumns(), columnId);
  }

  protected readonly rowId = (row: InventorySituationRow): string => row.variantId;

  protected readonly selectionLabel = (row: InventorySituationRow): string =>
    `Seleziona ${row.title}`;

  /*
    ⭐ **I filtri di colonna** (`14` §0.2). Otto colonne numeriche più i due
    prezzi: senza estrattore i campi da–a comparirebbero senza restringere.

    ⚠️ **I prezzi si confrontano in unità MINORI**, non sul testo formattato:
    «1.250,00 €» come stringa sta dopo «9,00 €».
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.rows,
    cellText: (row, columnId) => this.cellText(row, columnId),
    numeroDi: (row, columnId) => {
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
          return row.minThreshold;
        case 'totalIn':
          return row.totalIn;
        case 'totalOut':
          return row.totalOut;
        case 'purchasePrice':
          return row.purchasePriceMinor ?? null;
        case 'sellingPrice':
          return row.sellingPriceMinor ?? null;
        default:
          return null;
      }
    },
  });

  /*
    ⭐ **Le quantità si sommano, i PREZZI no.**

    ⛔ Prezzo d'acquisto e prezzo di vendita sono valori **unitari**: sommarli fra
    varianti diverse dà un numero che non è né un valore di magazzino né un
    listino — è la somma di etichette. Il valore di magazzino sarebbe
    `quantità × costo`, che è un calcolo, e questa riga somma: non calcola.
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const q = (n: number): string => String(n);
    return totaliDiElenco(this.righe(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.engineColumns(),
      campi: {
        available: { valore: (r) => r.available, formato: q },
        onHand: { valore: (r) => r.onHand, formato: q },
        committed: { valore: (r) => r.committed, formato: q },
        incoming: { valore: (r) => r.incoming, formato: q },
        totalIn: { valore: (r) => r.totalIn, formato: q },
        totalOut: { valore: (r) => r.totalOut, formato: q },
      },
    });
  });

  /*
    ⭐ **Dodici colonne su quindici sono testo o numeri**, e stanno tutte qui.
  */
  protected readonly cellText = (row: InventorySituationRow, columnId: string): string => {
    switch (columnId) {
      case 'title':
        return row.title;
      case 'code':
        return row.code || '—';
      case 'sku':
        return row.sku || '—';
      case 'category':
        return row.category || '—';
      case 'supplier':
        return row.supplierName || '—';
      case 'available':
        return String(row.available);
      case 'onHand':
        return String(row.onHand);
      case 'committed':
        return String(row.committed);
      case 'incoming':
        return String(row.incoming);
      case 'minThreshold':
        return String(row.minThreshold);
      case 'purchasePrice':
        return this.money(row.purchasePriceMinor, row.currency);
      case 'sellingPrice':
        return this.money(row.sellingPriceMinor, row.currency);
      case 'totalIn':
        return String(row.totalIn);
      case 'totalOut':
        return String(row.totalOut);
      default:
        return '';
    }
  };

  /** ⚠️ `null` è «non impostato», non zero: si legge come trattino. */
  private money(amountMinor: number | null, currency: string): string {
    if (amountMinor === null) {
      return '—';
    }
    return formatMoney({ amountMinor, currencyCode: currency || DEFAULT_CURRENCY });
  }
}
