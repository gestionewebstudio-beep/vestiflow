import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Money } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import { BarcodeSvgComponent } from '@shared/components/barcode-svg/barcode-svg.component';

import { PRODUCT_LABEL_BARCODE } from '../../models/product-label.constants';

/**
 * Etichetta prodotto per stampa (dumb). Una variante = un'etichetta con dati
 * per la cassa: nome, brand, SKU, barcode e prezzi.
 */
@Component({
  selector: 'app-product-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarcodeSvgComponent],
  templateUrl: './product-label.component.html',
  styleUrl: './product-label.component.scss',
})
export class ProductLabelComponent {
  readonly productName = input.required<string>();
  readonly brand = input.required<string>();
  readonly sku = input.required<string>();
  readonly barcode = input<string>('');
  readonly sellingPrice = input.required<Money>();
  readonly compareAtPrice = input<Money>();

  protected readonly barcodeHeight = PRODUCT_LABEL_BARCODE.height;
  protected readonly barcodeWidth = PRODUCT_LABEL_BARCODE.width;

  protected formatPrice(value: Money): string {
    return formatMoney(value);
  }
}
