import type { EntityId, Money } from './common.model';

/**
 * Variante = unita' minima di inventario (regole-gestionale).
 * Definita da combinazioni come taglia/colore, con SKU univoco.
 */
export interface ProductVariant {
  readonly id: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly sellingPrice: Money;
  // Opzionali ma raccomandati:
  readonly barcode?: string;
  readonly purchasePrice?: Money;
  readonly shopifyVariantId?: string;
  readonly shopifyInventoryItemId?: string;
}
