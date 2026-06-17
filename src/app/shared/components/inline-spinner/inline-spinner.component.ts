import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Spinner inline riutilizzabile (bottoni, banner di stato). */
@Component({
  selector: 'app-inline-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="app-inline-spinner"
    [class.app-inline-spinner--md]="size() === 'md'"
    aria-hidden="true"
  ></span>`,
  styleUrl: './inline-spinner.component.scss',
})
export class InlineSpinnerComponent {
  readonly size = input<'sm' | 'md'>('sm');
}
