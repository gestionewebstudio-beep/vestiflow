import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';

import type { CorrispettiviSummary } from '../../models/corrispettivi.model';

@Component({
  selector: 'app-corrispettivi-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './corrispettivi-summary.component.html',
  styleUrl: './corrispettivi-summary.component.scss',
})
export class CorrispettiviSummaryComponent {
  readonly summary = input.required<CorrispettiviSummary>();
  readonly periodLabel = input.required<string>();

  protected readonly formatMoney = formatMoney;
}
