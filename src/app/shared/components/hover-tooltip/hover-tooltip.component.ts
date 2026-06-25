import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-hover-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hover-tooltip.component.html',
  styleUrl: './hover-tooltip.component.scss',
})
export class HoverTooltipComponent {
  readonly text = input.required<string>();
  readonly position = input<'top' | 'bottom'>('top');

  protected readonly tooltipLines = computed(() => {
    const value = this.text().trim();
    const match = value.match(/^(.+?)\s(\([^)]+\)\.?)$/);
    if (!match) {
      return { body: value, note: null as string | null };
    }
    return { body: match[1], note: match[2] };
  });
}
