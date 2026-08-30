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

  /**
   * ⭐ **Quante righe ci sono davanti** — entrato nella fascia il 30/08/2026.
   *
   * Stava in coda al riquadro dell'elenco, allineato a destra e da solo su una
   * riga sua: costava una fascia di altezza per dire tre parole. È la voce che
   * `regole-stile-ui` («La riga TOTALI di un elenco») mette **a sinistra** nella
   * riga totali, ed è lì che risponde alla domanda giusta — «le ho viste tutte?»
   * — accanto ai numeri che quelle righe compongono.
   *
   * ⚠️ **Non è un addendo della riconciliazione**, ed è per questo che sta
   * dall'altro capo della fascia: gli importi si sommano fra loro, questo conta
   * le righe. La distanza fa il lavoro che faceva la riga separata.
   */
  readonly rowCount = input<number | null>(null);
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
