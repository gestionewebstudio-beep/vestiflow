import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';

import type { LocationReportRow } from '../../models/report-view.model';

/** Report giacenze per location (dumb puro): numeri a destra, tabular-nums. */
@Component({
  selector: 'app-report-location-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-location-table.component.html',
  styleUrl: './report-location-table.component.scss',
})
export class ReportLocationTableComponent {
  readonly rows = input.required<readonly LocationReportRow[]>();

  protected readonly formatMoney = formatMoney;
}
