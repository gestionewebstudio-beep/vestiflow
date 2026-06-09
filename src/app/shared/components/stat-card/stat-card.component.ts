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
  /** Classe PrimeIcons (es. 'pi-box'). */
  readonly icon = input<string>();
  /** Riga secondaria opzionale (es. 'su 3 location'). */
  readonly hint = input<string>();
  readonly tone = input<StatTone>('neutral');
}
