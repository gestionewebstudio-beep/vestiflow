import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

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
  imports: [BarcodeScannerComponent, ButtonComponent, SelectMenuComponent],
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
  readonly barcodeScannerEnabled = input<boolean>(false);

  readonly searchChange = output<string>();
  readonly filterChange = output<ProductFilterChange>();
  readonly resetFilters = output<void>();
  readonly barcodeScanned = output<string>();

  protected readonly categoryOptions = computed<readonly SelectMenuOption[]>(() =>
    this.categories().map((category) => ({ value: category, label: category })),
  );

  protected readonly brandOptions = computed<readonly SelectMenuOption[]>(() =>
    this.brands().map((brand) => ({ value: brand, label: brand })),
  );

  protected readonly seasonOptions = computed<readonly SelectMenuOption[]>(() =>
    this.seasons().map((season) => ({ value: season, label: season })),
  );

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchChange.emit(target.value);
  }

  protected onFilterChange(key: keyof ProductFilters, value: string | null): void {
    this.filterChange.emit({ key, value });
  }
}
