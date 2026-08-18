import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';

import type { CorrispettiviSummary } from '../../models/corrispettivi.model';

@Component({
  imports: [HoverTooltipComponent],
  selector: 'app-corrispettivi-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './corrispettivi-summary.component.html',
  styleUrl: './corrispettivi-summary.component.scss',
})
export class CorrispettiviSummaryComponent {
  readonly summary = input.required<CorrispettiviSummary>();
  readonly periodLabel = input.required<string>();

  /*
   * ⚠️ Il conteggio righe NON sta qui (18/08/2026). Ha attraversato tre posti
   * prima di trovare il suo: accanto al titolo rubava la larghezza alla CTA su
   * mobile; in questa banda si leggeva come un addendo della riconciliazione,
   * che non è — è quante card hai davanti. Vive ora in coda all'elenco, dove
   * risponde alla domanda che ci si fa lì: «le ho viste tutte?».
   */

  protected readonly formatMoney = formatMoney;
}
