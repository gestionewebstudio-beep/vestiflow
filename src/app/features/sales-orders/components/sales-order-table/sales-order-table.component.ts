import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { SalesOrder } from '@core/models/sales-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  financialStatusLabel,
  financialStatusTone,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  sourceLabel,
} from '../../models/sales-order-labels.util';

/**
 * Tabella vendite (dumb puro). Row click verso il dettaglio; importi a destra
 * in tabular-nums; mobile come card impilate.
 */
@Component({
  selector: 'app-sales-order-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './sales-order-table.component.html',
  styleUrl: './sales-order-table.component.scss',
})
export class SalesOrderTableComponent {
  readonly orders = input.required<readonly SalesOrder[]>();

  readonly rowClick = output<SalesOrder>();

  protected readonly financialLabel = financialStatusLabel;
  protected readonly financialTone = financialStatusTone;
  protected readonly fulfillmentLabel = fulfillmentStatusLabel;
  protected readonly fulfillmentTone = fulfillmentStatusTone;
  protected readonly sourceLabel = sourceLabel;
  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;

  protected rowLabel(order: SalesOrder): string {
    return `Apri vendita ${order.orderNumber} di ${order.customerName}`;
  }
}
