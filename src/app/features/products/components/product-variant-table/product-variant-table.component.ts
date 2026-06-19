import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { EntityId } from '@core/models/common.model';
import type { Money } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { ProductOption } from '@core/models/product.model';
import { formatMoney } from '@core/utils/money.util';

import { selectedOptionValue } from '../../models/product-variant.util';

/**
 * Tabella varianti (dumb puro). Read-only: SKU, colonne opzione dinamiche
 * (da `options`), prezzo (con compareAtPrice barrato se presente), barcode. Lo
 * stock per negozio NON vive qui: e' responsabilita' della feature Magazzino.
 * Responsive: tabella su desktop, card impilate su mobile.
 */
@Component({
  selector: 'app-product-variant-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './product-variant-table.component.html',
  styleUrl: './product-variant-table.component.scss',
})
export class ProductVariantTableComponent {
  readonly variants = input.required<readonly ProductVariant[]>();
  /** Opzioni del prodotto: definiscono le colonne (nome) in ordine. */
  readonly options = input<readonly ProductOption[]>([]);
  /** Se valorizzato, mostra il link stampa etichetta per ogni variante. */
  readonly productId = input<EntityId | null>(null);

  protected readonly optionNames = computed(() => this.options().map((option) => option.name));

  protected optionValue(variant: ProductVariant, name: string): string {
    return selectedOptionValue(variant.optionValues, name) || '—';
  }

  protected formatPrice(value: Money): string {
    return formatMoney(value);
  }
}
