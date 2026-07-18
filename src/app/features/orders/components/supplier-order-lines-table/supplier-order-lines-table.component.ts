import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { SupplierOrderLine } from '@core/models/supplier-order.model';
import { formatMoney } from '@core/utils/money.util';

/**
 * Righe di un ordine fornitore (dumb puro): descrizione, sconto e IVA di
 * riga, costi allineati a destra in tabular-nums.
 */
@Component({
  selector: 'app-supplier-order-lines-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-order-lines-table.component.html',
  styleUrl: './supplier-order-lines-table.component.scss',
})
export class SupplierOrderLinesTableComponent {
  readonly lines = input.required<readonly SupplierOrderLine[]>();

  protected readonly formatMoney = formatMoney;
}
