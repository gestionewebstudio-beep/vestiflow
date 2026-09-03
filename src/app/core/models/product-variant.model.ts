import type { EntityId, Money } from './common.model';
import type { SelectedOption } from './product.model';

/**
 * Stato LOCALE della variante (docs/24 §3.3): «Attiva» / «Non attiva».
 * Indipendente dal prodotto e da Shopify; non si deduce da quantità o
 * pubblicazione. Etichette e predicati in `product-lifecycle.util`.
 */
export const VariantLifecycleStatus = {
  Active: 'active',
  Inactive: 'inactive',
} as const;
export type VariantLifecycleStatus =
  (typeof VariantLifecycleStatus)[keyof typeof VariantLifecycleStatus];

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
  /**
   * Stato locale proprio (§3.3). Il mapper lo valorizza sempre; è opzionale
   * perché il client costruisce varianti anche fuori dall'API (form, fixture),
   * e lì «assente» vale `active` — la stessa verità del default sul server.
   */
  readonly lifecycleStatus?: VariantLifecycleStatus;
  /** Cestino (§4.1): valorizzato = «Nel cestino». Non è «eliminata definitivamente». */
  readonly deletedAt?: string | null;
  readonly deletedById?: string | null;
  readonly deletionReason?: string | null;
}
