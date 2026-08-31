import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
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
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
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
    { id: 'situazione', rows: this.rows() },
  ]);
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return this.engineColumns().some((column) => column.id === columnId);
  }

  protected readonly rowId = (row: InventorySituationRow): string => row.variantId;

  protected readonly selectionLabel = (row: InventorySituationRow): string =>
    `Seleziona ${row.title}`;

  /*
    ⭐ **Le quantità si sommano, i PREZZI no.**

    ⛔ Prezzo d'acquisto e prezzo di vendita sono valori **unitari**: sommarli fra
    varianti diverse dà un numero che non è né un valore di magazzino né un
    listino — è la somma di etichette. Il valore di magazzino sarebbe
    `quantità × costo`, che è un calcolo, e questa riga somma: non calcola.
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const q = (n: number): string => String(n);
    return totaliDiElenco(this.rows(), {
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
