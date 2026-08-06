import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product } from '@core/models/product.model';
import { isValidCompareAt } from '@core/utils/money.util';

import type { ProductLabelViewModel } from './product-label.model';

/** Mappa prodotto + varianti nei dati visualizzati su un'etichetta. */
export function toProductLabelViewModels(
  product: Product,
  variants: readonly ProductVariant[],
  variantId?: string,
): readonly ProductLabelViewModel[] {
  const filtered =
    variantId != null && variantId !== ''
      ? variants.filter((variant) => variant.id === variantId)
      : variants;

  return filtered.map((variant) => {
    // Il prezzo barrato è un dato dell'ARTICOLO (unico): lo si mostra su ogni
    // etichetta se valido rispetto al prezzo di vendita della variante.
    const compareAtPrice =
      product.compareAtPrice && isValidCompareAt(variant.sellingPrice, product.compareAtPrice)
        ? product.compareAtPrice
        : undefined;

    return {
      variantId: variant.id,
      productName: product.name,
      brand: product.brand?.trim() || 'Senza brand',
      sku: variant.sku,
      barcode: variant.barcode?.trim() ?? '',
      sellingPrice: variant.sellingPrice,
      compareAtPrice,
    };
  });
}
