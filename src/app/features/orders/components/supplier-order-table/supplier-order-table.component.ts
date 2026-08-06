import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { SupplierOrder } from '@core/models/supplier-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  supplierOrderStatusLabel,
  supplierOrderStatusTone,
} from '../../models/supplier-order-labels.util';

/**
 * Tabella ordini fornitori (dumb puro). Row click verso il dettaglio;
 * importi a destra in tabular-nums; mobile come card impilate.
 */
@Component({
  selector: 'app-supplier-order-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './supplier-order-table.component.html',
  styleUrl: './supplier-order-table.component.scss',
})
export class SupplierOrderTableComponent {
  readonly orders = input.required<readonly SupplierOrder[]>();

  readonly rowClick = output<SupplierOrder>();

  protected readonly statusLabel = supplierOrderStatusLabel;
  protected readonly statusTone = supplierOrderStatusTone;
  protected readonly formatMoney = formatMoney;

  protected rowLabel(order: SupplierOrder): string {
    return `Apri ordine ${order.reference} di ${order.supplierName}`;
  }

  protected expectedLabel(order: SupplierOrder): string {
    return order.expectedAt ? formatDate(order.expectedAt) : '—';
  }

  protected lineCount(order: SupplierOrder): number {
    return order.lineCount ?? order.lines.length;
  }
}
