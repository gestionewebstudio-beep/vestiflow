import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Money } from '@core/models/money.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  corrispettivoStatusLabel,
  corrispettivoStatusTone,
  onlineSaleInventoryStatusLabel,
  onlineSaleInventoryStatusTone,
} from '@features/sales-orders/models/sales-order-labels.util';

import type { OnlineSaleRow } from '../../models/online-sale.model';

/**
 * Tabella registro Vendite online (dumb puro, fase 3 §4). Row click verso il
 * dettaglio; importi a destra in tabular-nums; mobile come card impilate.
 */
@Component({
  selector: 'app-online-sale-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './online-sale-table.component.html',
  styleUrl: './online-sale-table.component.scss',
})
export class OnlineSaleTableComponent {
  readonly sales = input.required<readonly OnlineSaleRow[]>();

  readonly rowClick = output<OnlineSaleRow>();

  protected readonly formatDate = formatDate;
  protected readonly inventoryLabel = onlineSaleInventoryStatusLabel;
  protected readonly inventoryTone = onlineSaleInventoryStatusTone;
  protected readonly corrispettivoLabel = corrispettivoStatusLabel;
  protected readonly corrispettivoTone = corrispettivoStatusTone;

  protected total(sale: OnlineSaleRow): string {
    const money: Money = { amountMinor: sale.totalMinor, currencyCode: sale.currency };
    return formatMoney(money);
  }

  protected refundLabel(sale: OnlineSaleRow): string {
    return sale.refundedAt ? `Rimborso ${formatDate(sale.refundedAt)}` : '—';
  }

  protected rowLabel(sale: OnlineSaleRow): string {
    return `Apri vendita online ${sale.reference} dell'ordine ${sale.orderNumber}`;
  }
}
