import type { Money } from '@core/models/common.model';

/** Dati visualizzati su un'etichetta prodotto/variante per la cassa. */
export interface ProductLabelViewModel {
  readonly variantId: string;
  readonly productName: string;
  readonly brand: string;
  readonly sku: string;
  readonly barcode: string;
  readonly sellingPrice: Money;
  readonly compareAtPrice?: Money;
}
