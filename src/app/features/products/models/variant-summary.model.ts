import type { EntityId, Money } from '@core/models/common.model';

/**
 * Vista denormalizzata di una variante per consumer fuori dalla feature
 * Prodotti (magazzino, report, dashboard): lookup leggero senza caricare
 * l'intero Product. In un backend reale sarebbe un endpoint di ricerca varianti.
 */
export interface VariantSummary {
  readonly variantId: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  readonly productName: string;
  /** Display completo (es. 'T-shirt Basic — M / Bianco'). */
  readonly title: string;
  readonly barcode?: string;
  readonly sellingPrice: Money;
  readonly purchasePrice?: Money;
  readonly supplierSku?: string;
  readonly stockOnHand?: number | null;
  readonly category?: string;
  readonly unitOfMeasure?: string;
}
