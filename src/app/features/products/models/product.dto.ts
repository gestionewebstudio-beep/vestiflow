import type { EntityId, Money } from '@core/models/common.model';
import type { ProductStatus } from '@core/models/product.model';
import type { InventoryTrackingMode } from '@core/models/product-catalog.model';
import type { ShopifyCategoryMetafieldValue } from '@core/models/shopify-category-metafield.model';

// DTO di scrittura prodotto. Pensati per un backend NestJS (class-validator) +
// PostgreSQL relazionale (Supabase): prodotto e varianti restano separati.
// Nessun token/segreto: per Shopify solo identificativi pubblici opzionali.

/** Opzione prodotto inviata al backend (es. { name: 'Taglia', values: [...] }). */
export interface ProductOptionDto {
  readonly name: string;
  readonly values: readonly string[];
}

/** Valore opzione di una variante (forma Shopify `selectedOptions`). */
export interface SelectedOptionDto {
  readonly name: string;
  readonly value: string;
}

/** Variante in creazione. Lo SKU e' obbligatorio e univoco (vincolo server). */
export interface CreateProductVariantDto {
  readonly sku: string;
  /** Valori opzione (1-3 assi), es. [{Taglia,M},{Colore,Rosso}]. */
  readonly optionValues: readonly SelectedOptionDto[];
  readonly sellingPrice: Money;
  readonly purchasePrice?: Money;
  /** Prezzo "barrato" (precedente). Stessa valuta di sellingPrice, valore maggiore. */
  readonly compareAtPrice?: Money;
  readonly barcode?: string;
  // Mapping Shopify opzionale: solo ID pubblici, nessun token nel frontend.
  readonly shopifyVariantId?: string;
  readonly shopifyInventoryItemId?: string;
}

/**
 * Payload di creazione prodotto. `tenantId` NON e' incluso: lo deriva il
 * backend dal token (multi-tenant lato server, regole-sicurezza).
 */
export interface CreateProductDto {
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly shopifyTaxonomyCategoryId?: string;
  readonly shopifyTaxonomyCategoryFullName?: string;
  readonly shopifyCategoryMetafields?: readonly ShopifyCategoryMetafieldValue[];
  readonly season?: string;
  readonly tags?: readonly string[];
  readonly status: ProductStatus;
  readonly unitOfMeasure?: string;
  readonly defaultVatCodeId?: string | null;
  readonly inventoryTracking?: InventoryTrackingMode;
  readonly managesStock?: boolean;
  readonly options: readonly ProductOptionDto[];
  readonly variants: readonly CreateProductVariantDto[];
}

/** Variante in update: `id` presente = esistente, assente = nuova. */
export interface UpdateProductVariantDto extends CreateProductVariantDto {
  readonly id?: EntityId;
}

/** Payload di modifica prodotto: patch parziale dei campi generali + set varianti. */
export interface UpdateProductDto {
  readonly name?: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly shopifyTaxonomyCategoryId?: string;
  readonly shopifyTaxonomyCategoryFullName?: string;
  readonly shopifyCategoryMetafields?: readonly ShopifyCategoryMetafieldValue[];
  readonly season?: string;
  readonly tags?: readonly string[];
  readonly status?: ProductStatus;
  readonly unitOfMeasure?: string;
  readonly defaultVatCodeId?: string | null;
  readonly inventoryTracking?: InventoryTrackingMode;
  readonly managesStock?: boolean;
  readonly options?: readonly ProductOptionDto[];
  readonly variants?: readonly UpdateProductVariantDto[];
}

/** Esito del controllo di disponibilita' barcode (unicita' lato server). */
export interface BarcodeAvailabilityResult {
  readonly available: boolean;
  /** Barcode gia' in uso (normalizzati). Vuoto se tutti disponibili. */
  readonly taken: readonly string[];
}

/** Esito del controllo di disponibilita' SKU (unicita' lato "server"). */
export interface SkuAvailabilityResult {
  readonly available: boolean;
  /** SKU gia' in uso (normalizzati). Vuoto se tutti disponibili. */
  readonly taken: readonly string[];
}

/** Lookup variante per SKU o barcode esatto (magazzino / PWA). */
export interface VariantByCodeDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly barcode?: string | null;
  readonly productName: string;
}
