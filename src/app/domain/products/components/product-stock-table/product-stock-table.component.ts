import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

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

import type { VariantSummary } from '../../models/variant-summary.model';

/**
 * Le giacenze per variante nel tab Magazzino della scheda articolo: totali su
 * tutte le sedi, in sola lettura.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A26, 11/09/2026): era una `<table>` a mano
 *    con la propria griglia e nessun ripiego sotto `lg`. È un piccolo elenco di
 *    consultazione: colonne dal catalogo — «Giacenza», «Impegnata»,
 *    «Disponibile», le stesse parole delle Giacenze —, ordinamento, card sotto
 *    `lg`, e la riga totali sulle tre quantità: il totale dell'articolo è il
 *    numero che si cerca aprendo questo tab.
 *
 * ⚠️ L'impegnata è giacenza − disponibile, come la calcolava la scheda: il
 *    riepilogo delle varianti non porta la colonna.
 */
@Component({
  selector: 'app-product-stock-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DataTableRowCardDirective],
  templateUrl: './product-stock-table.component.html',
  styleUrl: './product-stock-table.component.scss',
})
export class ProductStockTableComponent {
  readonly rows = input.required<readonly VariantSummary[]>();

  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (r: VariantSummary): string => r.variantId;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    {
      id: 'title',
      label: 'Articolo',
      defaultVisible: true,
      cardTitle: true,
      pinned: false,
    },
    { ...colonna('sku', { defaultVisible: true, defaultWidthPx: 140 }), pinned: false },
    { ...colonna('onHand', { defaultVisible: true, defaultWidthPx: 100 }), pinned: false },
    { ...colonna('committed', { defaultVisible: true, defaultWidthPx: 100 }), pinned: false },
    { ...colonna('available', { defaultVisible: true, defaultWidthPx: 110 }), pinned: false },
  ];

  protected giacenza(r: VariantSummary): number {
    return r.stockOnHand ?? 0;
  }

  protected disponibile(r: VariantSummary): number {
    return r.stockAvailable ?? 0;
  }

  protected impegnata(r: VariantSummary): number {
    return this.giacenza(r) - this.disponibile(r);
  }

  protected readonly testoCella = (r: VariantSummary, id: string): string => {
    switch (id) {
      case 'title':
        return r.title;
      case 'sku':
        return r.sku || '—';
      case 'onHand':
        return String(this.giacenza(r));
      case 'committed':
        return String(this.impegnata(r));
      case 'available':
        return String(this.disponibile(r));
      default:
        return '';
    }
  };

  private readonly numeroDi = (r: VariantSummary, id: string): number | null => {
    switch (id) {
      case 'onHand':
        return this.giacenza(r);
      case 'committed':
        return this.impegnata(r);
      case 'available':
        return this.disponibile(r);
      default:
        return null;
    }
  };

  protected readonly sezioni = computed<readonly DataTableSection<VariantSummary>[]>(() => [
    {
      id: 'giacenze',
      rows: ordinaPerColonne(this.rows(), this.ordine(), {
        cellText: this.testoCella,
        numeroDi: this.numeroDi,
      }),
    },
  ]);

  protected readonly totali = computed<DataTableTotals>(() =>
    totaliDiElenco(this.rows(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.colonne,
      campi: {
        onHand: { valore: (r) => this.giacenza(r), formato: String },
        committed: { valore: (r) => this.impegnata(r), formato: String },
        available: { valore: (r) => this.disponibile(r), formato: String },
      },
    }),
  );
}
