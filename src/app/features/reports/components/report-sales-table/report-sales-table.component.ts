import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  financialStatusLabel,
  financialStatusTone,
} from '@features/sales-orders/models/sales-order-labels.util';

import type { SalesReportRow } from '../../models/report-view.model';

/** Report vendite per stato pagamento (dumb puro). */
@Component({
  selector: 'app-report-sales-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './report-sales-table.component.html',
  styleUrl: './report-sales-table.component.scss',
})
export class ReportSalesTableComponent {
  readonly rows = input.required<readonly SalesReportRow[]>();

  protected readonly statusLabel = financialStatusLabel;
  protected readonly statusTone = financialStatusTone;
  protected readonly formatMoney = formatMoney;
}
