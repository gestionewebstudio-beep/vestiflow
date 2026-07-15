import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { PageMeta } from '@core/models/api.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Paginazione lista (dumb puro, shared). Promossa da features/products perché
 * riusata da più liste (prodotti, vendite, clienti, ordini). Lavora sui
 * PageMeta della paginazione server-side simulata ed emette page/pageSize.
 */
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  readonly meta = input.required<PageMeta>();
  readonly pageSizeOptions = input.required<readonly number[]>();
  /** Etichetta aria della nav (es. 'Paginazione prodotti'). */
  readonly label = input<string>('Paginazione');

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  /** Indice del primo elemento mostrato (1-based); 0 se la lista e' vuota. */
  protected readonly rangeStart = computed(() => {
    const { page, pageSize, total } = this.meta();
    return total === 0 ? 0 : (page - 1) * pageSize + 1;
  });

  /** Indice dell'ultimo elemento mostrato nella pagina corrente. */
  protected readonly rangeEnd = computed(() => {
    const { page, pageSize, total } = this.meta();
    return Math.min(page * pageSize, total);
  });

  protected readonly canPrev = computed(() => this.meta().page > 1);
  protected readonly canNext = computed(() => this.meta().page < this.meta().totalPages);

  protected readonly pageSizeSelectOptions = computed<readonly SelectMenuOption[]>(() =>
    this.pageSizeOptions().map((size) => ({
      value: String(size),
      label: String(size),
    })),
  );

  protected readonly pageSizeValue = computed(() => String(this.meta().pageSize));

  /**
   * Pagine da mostrare come pill numerate (mockup 1b/2b: « 1 2 3 … 52 »):
   * prima e ultima sempre visibili, finestra di 2 attorno alla corrente,
   * ellissi al posto dei salti.
   */
  protected readonly pageItems = computed<readonly (number | 'ellipsis')[]>(() => {
    const { page, totalPages } = this.meta();
    if (totalPages <= 1) {
      return [];
    }
    const pages = new Set<number>([1, totalPages]);
    for (let p = page - 2; p <= page + 2; p++) {
      if (p >= 1 && p <= totalPages) {
        pages.add(p);
      }
    }
    const items: (number | 'ellipsis')[] = [];
    let previous = 0;
    for (const current of [...pages].sort((a, b) => a - b)) {
      if (previous && current - previous > 1) {
        items.push('ellipsis');
      }
      items.push(current);
      previous = current;
    }
    return items;
  });

  protected goTo(page: number): void {
    if (page !== this.meta().page) {
      this.pageChange.emit(page);
    }
  }

  protected prev(): void {
    if (this.canPrev()) {
      this.pageChange.emit(this.meta().page - 1);
    }
  }

  protected next(): void {
    if (this.canNext()) {
      this.pageChange.emit(this.meta().page + 1);
    }
  }

  protected onPageSizeSelect(value: string | null): void {
    if (!value) {
      return;
    }
    this.pageSizeChange.emit(Number(value));
  }
}
