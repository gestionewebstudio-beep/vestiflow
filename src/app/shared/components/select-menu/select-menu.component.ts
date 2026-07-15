import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { filterSelectMenuOptions } from '@shared/utils/select-menu-filter.util';

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
    '[class.select-menu-host--chip]': 'filterChip()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  templateUrl: './select-menu.component.html',
  styleUrl: './select-menu.component.scss',
})
export class SelectMenuComponent {
  private static nextInstanceId = 0;

  // REASON: ElementRef.nativeElement e' tipizzato any in Angular; il host e' sempre HTMLElement.
  private readonly hostElement: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement as HTMLElement;
  protected readonly searchInputId = `select-menu-search-${++SelectMenuComponent.nextInstanceId}`;

  readonly options = input.required<readonly SelectMenuOption[]>();
  /** Valore selezionato; stringa vuota o null = opzione placeholder. */
  readonly value = input<string | null>(null);
  /** Se true, consente più valori (`values` / `valuesChange`). */
  readonly multiple = input<boolean>(false);
  /** Valori selezionati in modalità multipla. */
  readonly values = input<readonly string[]>([]);
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
  /**
   * Filtro inline a chip (restyle spec §Liste): quando un valore e' selezionato
   * il trigger prende la tinta accento e la chevron lascia il posto alla × che
   * azzera il filtro.
   */
  readonly filterChip = input<boolean>(false);
  /**
   * Etichetta mostrata dentro il chip prima del valore (es. «Categoria: Tutte»),
   * come nei mockup 1b/2b. Sostituisce la label esterna sopra il controllo.
   */
  readonly chipLabel = input<string>();
  readonly invalid = input<boolean>(false);
  readonly describedBy = input<string>();
  /** Campo ricerca sticky nel pannello (utile per liste lunghe, es. varianti). */
  readonly searchable = input<boolean>(false);
  readonly searchPlaceholder = input<string>('Cerca…');
  readonly searchAriaLabel = input<string>('Cerca nelle opzioni');
  /** Se false, la ricerca emette `searchChange` senza filtrare le opzioni in locale (es. lookup server-side). */
  readonly filterOptionsLocally = input<boolean>(true);

  readonly valueChange = output<string | null>();
  readonly valuesChange = output<readonly string[]>();
  readonly searchChange = output<string>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly open = signal(false);
  protected readonly searchQuery = signal('');

  protected readonly visibleOptions = computed(() => {
    if (!this.searchable()) {
      return this.options();
    }
    if (!this.filterOptionsLocally()) {
      return this.options();
    }
    return filterSelectMenuOptions(this.options(), this.searchQuery());
  });

  protected readonly showSearchEmptyState = computed(
    () =>
      this.searchable() &&
      this.searchQuery().trim().length > 0 &&
      this.visibleOptions().length === 0,
  );

  protected readonly selectedOption = computed(() => {
    const current = this.value() ?? '';
    return this.options().find((option) => option.value === current) ?? null;
  });

  protected readonly selectedLabel = computed(() => {
    if (this.multiple()) {
      const selectedIds = this.values();
      if (selectedIds.length === 0) {
        return this.placeholder();
      }
      const labels = selectedIds.flatMap((id) => {
        const label = this.options().find((option) => option.value === id)?.label;
        return label ? [label] : [];
      });
      if (labels.length === 0) {
        return this.placeholder();
      }
      if (labels.length <= 2) {
        return labels.join(', ');
      }
      return `${labels.length} selezionati`;
    }
    return this.selectedOption()?.label ?? this.placeholder();
  });

  protected readonly selectedSwatchCssColor = computed(() => {
    if (this.multiple()) {
      return this.values().length === 1
        ? this.options().find((option) => option.value === this.values()[0])?.swatchCssColor
        : undefined;
    }
    return this.selectedOption()?.swatchCssColor;
  });

  protected readonly isEmptySelected = computed(() => {
    if (this.multiple()) {
      return this.values().length === 0;
    }
    return (this.value() ?? '') === '';
  });

  /** Chip filtro attivo: modalita' chip + almeno un valore selezionato. */
  protected readonly chipActive = computed(() => this.filterChip() && !this.isEmptySelected());

  /** Azzera il filtro dalla × del chip, senza aprire il pannello. */
  protected clearFilter(event: MouseEvent): void {
    event.stopPropagation();
    if (this.multiple()) {
      this.valuesChange.emit([]);
    } else {
      this.valueChange.emit(null);
    }
    this.close();
  }

  protected isSelected(option: SelectMenuOption): boolean {
    if (this.multiple()) {
      return this.values().includes(option.value);
    }
    return (this.value() ?? '') === option.value;
  }

  protected optionAriaLabel(option: SelectMenuOption): string {
    if (option.detail) {
      return `${option.label}, SKU ${option.detail}`;
    }
    return option.label;
  }

  protected toggle(): void {
    const willOpen = !this.open();
    if (willOpen && this.searchable()) {
      this.searchQuery.set('');
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    }
    if (!willOpen) {
      this.searchQuery.set('');
    }
    this.open.set(willOpen);
  }

  protected close(): void {
    this.open.set(false);
    this.searchQuery.set('');
  }

  protected onSearchInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.searchQuery.set(target.value);
    if (!this.filterOptionsLocally()) {
      this.searchChange.emit(target.value);
    }
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  protected select(option: SelectMenuOption): void {
    if (this.multiple()) {
      if (!option.value) {
        this.valuesChange.emit([]);
        this.close();
        return;
      }
      const current = this.values();
      const next = current.includes(option.value)
        ? current.filter((entry) => entry !== option.value)
        : [...current, option.value];
      this.valuesChange.emit(next);
      return;
    }

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
