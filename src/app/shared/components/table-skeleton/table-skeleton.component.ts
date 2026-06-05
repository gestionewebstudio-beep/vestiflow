import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Skeleton di caricamento per tabelle. Dumb puro: numero di righe/colonne
 * configurabile. Decorativo per gli screen reader (annuncia solo "caricamento").
 */
@Component({
  selector: 'app-table-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-skeleton.component.html',
  styleUrl: './table-skeleton.component.scss',
})
export class TableSkeletonComponent {
  readonly rows = input<number>(5);
  readonly columns = input<number>(4);

  protected readonly rowList = computed(() => this.range(this.rows()));
  protected readonly columnList = computed(() => this.range(this.columns()));

  private range(count: number): readonly number[] {
    return Array.from({ length: Math.max(0, count) }, (_, index) => index);
  }
}
