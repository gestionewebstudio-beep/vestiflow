import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * Larghezza massima del bubble (px): decide da che distanza dal bordo
 * destro il tooltip si ancora al lato destro del trigger. Allineata al
 * max-inline-size del foglio di stile (--select-menu-width-wide, 22rem).
 */
const BUBBLE_MAX_WIDTH_PX = 352;

@Component({
  selector: 'app-hover-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.hover-tooltip-host--inline]': 'inline()',
  },
  templateUrl: './hover-tooltip.component.html',
  styleUrl: './hover-tooltip.component.scss',
})
export class HoverTooltipComponent {
  readonly text = input.required<string>();
  readonly position = input<'top' | 'bottom'>('top');
  /**
   * In linea col testo circostante (es. icona info accanto all'etichetta di
   * un campo): il wrapper non occupa più la riga intera.
   */
  readonly inline = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * true = il bubble si allinea al bordo destro del trigger (si estende verso
   * sinistra): scelto al volo quando a destra non c'è spazio sufficiente —
   * es. colonne vicine al bordo dello schermo, dove il tooltip diventava una
   * striscia verticale illeggibile.
   */
  protected readonly alignEnd = signal(false);

  protected readonly tooltipLines = computed(() => {
    const value = this.text().trim();
    const match = value.match(/^(.+?)\s(\([^)]+\)\.?)$/);
    if (!match) {
      return { body: value, note: null as string | null };
    }
    return { body: match[1], note: match[2] };
  });

  /** Misura lo spazio a destra PRIMA che il bubble diventi visibile (hover/focus). */
  protected updatePlacement(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    this.alignEnd.set(spaceRight < BUBBLE_MAX_WIDTH_PX);
  }
}
