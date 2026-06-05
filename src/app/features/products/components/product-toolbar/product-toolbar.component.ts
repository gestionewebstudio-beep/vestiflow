import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

import type { ProductFilters } from '../../models/product-list-query.model';

/** Opzione select per lo stato prodotto (value tecnico + label leggibile). */
export interface ProductStatusOption {
  readonly value: string;
  readonly label: string;
}

/** Cambio di un singolo filtro: chiave tipizzata + valore (null = rimosso). */
export interface ProductFilterChange {
  readonly key: keyof ProductFilters;
  readonly value: string | null;
}

/**
 * Toolbar lista prodotti (dumb puro): ricerca, filtri contestuali e reset.
 * Non conosce router ne' debounce: emette intenzioni, il container decide.
 */
@Component({
  selector: 'app-product-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './product-toolbar.component.html',
  styleUrl: './product-toolbar.component.scss',
})
export class ProductToolbarComponent {
  readonly search = input<string>('');
  readonly filters = input.required<ProductFilters>();
  readonly categories = input.required<readonly string[]>();
  readonly brands = input.required<readonly string[]>();
  readonly seasons = input.required<readonly string[]>();
  readonly statusOptions = input.required<readonly ProductStatusOption[]>();
  readonly hasActiveFilters = input<boolean>(false);

  readonly searchChange = output<string>();
  readonly filterChange = output<ProductFilterChange>();
  readonly resetFilters = output<void>();

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchChange.emit(target.value);
  }

  protected onFilterSelect(key: keyof ProductFilters, event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filterChange.emit({ key, value: target.value || null });
  }
}
