import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Stato di errore generico per fetch fallite. Dumb puro: titolo, descrizione,
 * icona e CTA di retry opzionali. Annuncia l'errore agli screen reader.
 */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss',
})
export class ErrorStateComponent {
  readonly title = input<string>('Si \u00e8 verificato un errore');
  readonly description = input<string>();
  /** Classe PrimeIcons (es. 'pi-exclamation-triangle'). */
  readonly icon = input<string>('pi-exclamation-triangle');
  /** Se valorizzata, mostra la CTA di retry. */
  readonly retryLabel = input<string>();

  readonly retry = output<void>();
}
