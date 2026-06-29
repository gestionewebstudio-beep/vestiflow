import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

/**
 * Card KPI compatta per dashboard e report. Dumb puro: etichetta, valore già
 * formattato, icona e hint opzionali. Il valore resta sempre leggibile come
 * numero/testo: il tone e' un rinforzo visivo, non l'unico significato.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  readonly label = input.required<string>();
  /** Valore già formattato dal consumer (numero, valuta, percentuale...). */
  readonly value = input.required<string>();
  /** Suffisso inline più piccolo (es. percentuale accanto all'importo). */
  readonly valueSuffix = input<string>();
  /** Classe PrimeIcons (es. 'pi-box'). */
  readonly icon = input<string>();
  /** Riga secondaria opzionale (es. 'su 3 location'). */
  readonly hint = input<string>();
  /** Variazione rispetto al periodo precedente (es. "+12% vs periodo prec."). */
  readonly trendLabel = input<string>();
  readonly trendTone = input<StatTone>('neutral');
  readonly tone = input<StatTone>('neutral');
}
