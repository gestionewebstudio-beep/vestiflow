import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { PageMeta } from '@core/models/api.model';
import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Paginazione lista (dumb puro). Coerente con la paginazione server-side
 * simulata: lavora sui PageMeta e emette page/pageSize richiesti.
 */
@Component({
  selector: 'app-product-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './product-pagination.component.html',
  styleUrl: './product-pagination.component.scss',
})
export class ProductPaginationComponent {
  readonly meta = input.required<PageMeta>();
  readonly pageSizeOptions = input.required<readonly number[]>();

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

  protected onPageSizeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.pageSizeChange.emit(Number(target.value));
  }
}
