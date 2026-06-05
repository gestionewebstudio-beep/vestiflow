import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Stato vuoto generico per liste/tabelle. Dumb puro: titolo, descrizione,
 * icona e CTA opzionali. Riusabile in products, inventory, orders, ecc.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  /** Classe PrimeIcons (es. 'pi-inbox'). */
  readonly icon = input<string>('pi-inbox');
  /** Se valorizzata, mostra la CTA. */
  readonly ctaLabel = input<string>();

  readonly ctaClick = output<void>();
}
