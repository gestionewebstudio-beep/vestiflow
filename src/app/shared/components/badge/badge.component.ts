import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'vestiflow';

/**
 * Badge per stati/label brevi. Dumb puro, non cliccabile. Il testo (label)
 * resta sempre leggibile: il colore e' un rinforzo, non l'unico significato.
 */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
}
