import type { EntityId, Money } from './common.model';
import type { SelectedOption } from './product.model';

/**
 * Variante = unita' minima di inventario (regole-gestionale).
 * Definita da 1-3 opzioni (es. Taglia/Colore) via `optionValues`, con SKU
 * univoco. La forma `optionValues` è allineata a `selectedOptions` di Shopify.
 */
export interface ProductVariant {
  readonly id: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  /** Valori opzione della variante (es. [{Taglia,M},{Colore,Rosso}]), 1-3 assi. */
  readonly optionValues: readonly SelectedOption[];
  readonly sellingPrice: Money;
  // Opzionali ma raccomandati:
  readonly barcode?: string;
  readonly purchasePrice?: Money;
  /** Prezzo "barrato" (precedente), più alto di sellingPrice. Shopify: compareAtPrice. */
  readonly compareAtPrice?: Money;
  readonly shopifyVariantId?: string;
  readonly shopifyInventoryItemId?: string;
}
