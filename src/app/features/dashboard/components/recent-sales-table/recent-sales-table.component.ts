import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  financialStatusLabel,
  financialStatusTone,
} from '@features/sales-orders/models/sales-order-labels.util';

import type { RecentSaleRow } from '../../models/dashboard-view.model';

/** Ultime vendite (dumb puro): row click verso il dettaglio vendita. */
@Component({
  selector: 'app-recent-sales-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './recent-sales-table.component.html',
  styleUrl: './recent-sales-table.component.scss',
})
export class RecentSalesTableComponent {
  readonly rows = input.required<readonly RecentSaleRow[]>();

  readonly rowClick = output<RecentSaleRow>();

  protected readonly statusLabel = financialStatusLabel;
  protected readonly statusTone = financialStatusTone;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
}
