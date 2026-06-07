import type { EntityId } from '@core/models/common.model';
import type { ProductStatus } from '@core/models/product.model';

// Modelli locali del wizard prodotto (stato del form, non payload API).
// Le stringhe vuote rappresentano i campi opzionali non valorizzati: il mapper
// le converte in `undefined` quando costruisce i DTO.

/** Dati generali del prodotto nel wizard. */
export interface ProductGeneralDraft {
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly category: string;
  readonly season: string;
  readonly status: ProductStatus;
}

/**
 * Opzioni a due assi (Taglia/Colore), coerenti col modello ProductVariant.
 * Combinazioni con piu' di due assi sono fuori scope in questa fase.
 */
export interface ProductOptionsDraft {
  readonly sizes: readonly string[];
  readonly colors: readonly string[];
}

/** Bozza di singola variante (combinazione taglia x colore). */
export interface VariantDraft {
  /** Chiave stabile per il track (`id` esistente o combinazione size-color). */
  readonly key: string;
  /** Valorizzato in edit per varianti gia' esistenti (assente = nuova). */
  readonly id?: EntityId;
  readonly size: string;
  readonly color: string;
  readonly sku: string;
  readonly sellingPrice: number;
  readonly purchasePrice: number | null;
  readonly barcode: string;
  /** L'utente puo' escludere singole combinazioni dalla generazione. */
  readonly included: boolean;
}

/** Stato completo del form prodotto (create o edit). */
export interface ProductFormDraft {
  readonly general: ProductGeneralDraft;
  readonly options: ProductOptionsDraft;
  readonly variants: readonly VariantDraft[];
}
