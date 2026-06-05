import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Money } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';

// Formattatore prezzo: per ora EUR fisso (la valuta per store arrivera' col contesto tenant).
const PRICE_FORMAT = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/**
 * Tabella varianti (dumb puro). Read-only: SKU, taglia, colore, prezzo, barcode.
 * Lo stock per negozio NON vive qui: e' responsabilita' della feature Magazzino.
 * Responsive: tabella su desktop, card impilate su mobile.
 */
@Component({
  selector: 'app-product-variant-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-variant-table.component.html',
  styleUrl: './product-variant-table.component.scss',
})
export class ProductVariantTableComponent {
  readonly variants = input.required<readonly ProductVariant[]>();

  protected formatPrice(value: Money): string {
    return PRICE_FORMAT.format(value);
  }
}
