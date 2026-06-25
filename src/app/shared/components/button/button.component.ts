import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonType = 'button' | 'submit';

/** `spinner`: cerchio dedicato; `icon`: anima le icone nel contenuto del bottone. */
type ButtonLoadingIndicator = 'spinner' | 'icon';

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

  /** Indicatore visivo durante il loading (default: spinner separato). */
  readonly loadingIndicator = input<ButtonLoadingIndicator>('spinner');

  readonly fullWidth = input<boolean>(false);

  /** Associa il submit a un form esterno (attributo HTML `form`). */
  readonly form = input<string | undefined>(undefined);
}
