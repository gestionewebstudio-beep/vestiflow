import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { SalesOrderLine } from '@core/models/sales-order.model';
import { formatMoney } from '@core/utils/money.util';

/**
 * Righe di una vendita (dumb puro): snapshot sku/titolo, quantità e importi
 * allineati a destra in tabular-nums.
 */
@Component({
  selector: 'app-sales-order-lines-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-order-lines-table.component.html',
  styleUrl: './sales-order-lines-table.component.scss',
})
export class SalesOrderLinesTableComponent {
  readonly lines = input.required<readonly SalesOrderLine[]>();

  protected readonly formatMoney = formatMoney;
}
