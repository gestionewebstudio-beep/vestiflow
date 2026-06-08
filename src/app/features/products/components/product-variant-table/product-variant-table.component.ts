import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Money } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { ProductOption } from '@core/models/product.model';

import { selectedOptionValue } from '../../models/product-variant.util';

// Formattatore prezzo: per ora EUR fisso (la valuta per store arrivera' col contesto tenant).
const PRICE_FORMAT = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/**
 * Tabella varianti (dumb puro). Read-only: SKU, colonne opzione dinamiche
 * (da `options`), prezzo, barcode. Lo stock per negozio NON vive qui: e'
 * responsabilita' della feature Magazzino. Responsive: tabella su desktop,
 * card impilate su mobile.
 */
@Component({
  selector: 'app-product-variant-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-variant-table.component.html',
  styleUrl: './product-variant-table.component.scss',
})
export class ProductVariantTableComponent {
  readonly variants = input.required<readonly ProductVariant[]>();
  /** Opzioni del prodotto: definiscono le colonne (nome) in ordine. */
  readonly options = input<readonly ProductOption[]>([]);

  protected readonly optionNames = computed(() => this.options().map((option) => option.name));

  protected optionValue(variant: ProductVariant, name: string): string {
    return selectedOptionValue(variant.optionValues, name) || '—';
  }

  protected formatPrice(value: Money): string {
    return PRICE_FORMAT.format(value);
  }
}
