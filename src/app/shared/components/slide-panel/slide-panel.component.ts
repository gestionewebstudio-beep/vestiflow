import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Pannello laterale modale: mantiene il contesto della pagina sottostante e
 * intrappola il focus finché aperto.
 */
@Component({
  selector: 'app-slide-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './slide-panel.component.html',
  styleUrl: './slide-panel.component.scss',
})
export class SlidePanelComponent {
  private readonly document = inject(DOCUMENT);

  readonly open = input(false);
  readonly title = input.required<string>();
  readonly ariaLabel = input<string>();
  /** `narrow` = larghezza compatta adatta a contenuti stretti (es. ricerca prodotto). */
  readonly size = input<'default' | 'narrow'>('default');

  readonly closed = output<void>();

  private readonly restoreFocusEl = signal<HTMLElement | null>(null);

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const body = this.document.body;
      if (isOpen) {
        this.restoreFocusEl.set(this.document.activeElement as HTMLElement | null);
        body.style.overflow = 'hidden';
        return;
      }
      body.style.removeProperty('overflow');
      const el = this.restoreFocusEl();
      if (el?.focus) {
        el.focus();
      }
      this.restoreFocusEl.set(null);
    });
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onCloseClick(): void {
    this.closed.emit();
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    }
  }
}
