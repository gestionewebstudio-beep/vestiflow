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
  /**
   * Prezzo Shopify della variante (§B): valore proprio, per-taglia. Seed dal
   * prezzo variante alla creazione, poi indipendente. È il prezzo che la
   * pubblicazione Shopify legge per la variante.
   */
  readonly shopifyPrice?: Money;
  // Opzionali ma raccomandati:
  readonly barcode?: string;
  /**
   * Costo EFFETTIVO della variante (per-taglia): aggiornato dai carichi,
   * alimenta valorizzazione e margini. Il costo di RIFERIMENTO che fa da seed
   * vive sull'articolo (Product.purchasePrice).
   */
  readonly purchasePrice?: Money;
  readonly shopifyVariantId?: string;
  readonly shopifyInventoryItemId?: string;
}
