import type { EntityId } from '@core/models/common.model';
import type { ProductStatus, SelectedOption } from '@core/models/product.model';

/** Nomi opzione di default della UX conservativa (Taglia + Colore). */
export const OPTION_NAME_SIZE = 'Taglia';
export const OPTION_NAME_COLOR = 'Colore';

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
 * Singolo asse opzione del wizard (es. { name: 'Taglia', values: [...] }).
 * Modello generico allineato a Shopify: 1-3 assi per prodotto.
 */
export interface OptionAxisDraft {
  readonly name: string;
  readonly values: readonly string[];
}

/**
 * Opzioni del prodotto come lista di assi (max 3). La UX di default presenta
 * Taglia + Colore, ma la struttura è generica e Shopify-ready.
 */
export interface ProductOptionsDraft {
  readonly axes: readonly OptionAxisDraft[];
}

/** Bozza di singola variante (una combinazione di valori opzione). */
export interface VariantDraft {
  /** Chiave stabile per il track (`id` esistente o combinazione dei valori). */
  readonly key: string;
  /** Valorizzato in edit per varianti gia' esistenti (assente = nuova). */
  readonly id?: EntityId;
  /** Valori opzione della combinazione (1-3 assi), forma Shopify. */
  readonly optionValues: readonly SelectedOption[];
  readonly sku: string;
  /** Prezzi in unità maggiori (ponte form); il mapper li converte in Money. */
  readonly sellingPrice: number;
  readonly purchasePrice: number | null;
  /** Prezzo "barrato" opzionale (unità maggiori). null = assente. */
  readonly compareAtPrice: number | null;
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
