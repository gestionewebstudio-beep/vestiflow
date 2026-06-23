import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { SelectMenuOption } from './select-menu.model';

/**
 * Menu a tendina custom (Polaris-like). Dumb: nessun service, solo input/output.
 * Sostituisce il <select> nativo dove serve controllo visivo sul pannello opzioni.
 */
@Component({
  selector: 'app-select-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'select-menu-host',
    '[class.select-menu-host--full]': 'fullWidth()',
    '[class.select-menu-host--toolbar]': 'toolbarChip()',
    '[class.select-menu-host--match-input]': 'matchInputHeight()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  templateUrl: './select-menu.component.html',
  styleUrl: './select-menu.component.scss',
})
export class SelectMenuComponent {
  // REASON: ElementRef.nativeElement e' tipizzato any in Angular; il host e' sempre HTMLElement.
  private readonly hostElement: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement as HTMLElement;

  readonly options = input.required<readonly SelectMenuOption[]>();
  /** Valore selezionato; stringa vuota o null = opzione placeholder. */
  readonly value = input<string | null>(null);
  readonly ariaLabel = input.required<string>();
  /** Etichetta mostrata quando value e' null o vuoto. */
  readonly placeholder = input.required<string>();
  /** Classe PrimeIcons opzionale sul trigger (es. `pi-shop`). */
  readonly triggerIcon = input<string>();
  readonly compact = input<boolean>(false);
  /** Altezza allineata ai chip della topbar (location + sync + tema). */
  readonly toolbarChip = input<boolean>(false);
  /** Trigger e pannello a larghezza piena del contenitore (es. filtri mobile). */
  readonly fullWidth = input<boolean>(false);
  /** Voce placeholder con valore vuoto (es. "Tutti"); disabilita per select obbligati. */
  readonly includeEmptyOption = input<boolean>(true);
  readonly matchInputHeight = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly describedBy = input<string>();

  readonly valueChange = output<string | null>();

  protected readonly open = signal(false);

  protected readonly selectedOption = computed(() => {
    const current = this.value() ?? '';
    return this.options().find((option) => option.value === current) ?? null;
  });

  protected readonly selectedLabel = computed(
    () => this.selectedOption()?.label ?? this.placeholder(),
  );

  protected readonly selectedSwatchCssColor = computed(() => this.selectedOption()?.swatchCssColor);

  protected readonly isEmptySelected = computed(() => (this.value() ?? '') === '');

  protected isSelected(option: SelectMenuOption): boolean {
    return (this.value() ?? '') === option.value;
  }

  protected toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected select(option: SelectMenuOption): void {
    this.valueChange.emit(option.value || null);
    this.close();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!this.hostElement.contains(target)) {
      this.close();
    }
  }
}
