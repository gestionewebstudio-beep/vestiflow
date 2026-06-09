import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Money } from '@core/models/common.model';
import type { SupplierOrderLine } from '@core/models/supplier-order.model';
import { formatMoney } from '@core/utils/money.util';

/**
 * Righe di un ordine fornitore (dumb puro): ordinato vs ricevuto a confronto,
 * costi allineati a destra in tabular-nums.
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

  protected lineTotal(line: SupplierOrderLine): Money {
    return {
      amountMinor: line.orderedQuantity * line.unitCost.amountMinor,
      currencyCode: line.unitCost.currencyCode,
    };
  }
}
