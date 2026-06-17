import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonType = 'button' | 'submit';

/**
 * Bottone condiviso. Dumb puro: stili centralizzati e varianti minime.
 * Renderizza un <button> nativo (il click risale naturalmente al consumer).
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InlineSpinnerComponent],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly type = input<ButtonType>('button');
  readonly disabled = input<boolean>(false);
  /** Stato di caricamento: disabilita e segnala aria-busy. */
  readonly loading = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
}
