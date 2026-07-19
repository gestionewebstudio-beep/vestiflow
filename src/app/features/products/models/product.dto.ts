import type { EntityId, Money } from '@core/models/common.model';
import type { ProductKind, ProductStatus } from '@core/models/product.model';
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

/**
 * Variante in creazione. Lo SKU è FACOLTATIVO (specifica cliente §SKU): può
 * essere inserito a mano, generato con "Genera SKU", o lasciato vuoto e
 * completato dopo. Se valorizzato deve comunque essere univoco (vincolo server).
 */
export interface CreateProductVariantDto {
  readonly sku?: string;
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
  /**
   * Codice articolo (identificatore anagrafico interno, §Codice articolo):
   * facoltativo alla creazione — se assente il backend genera il progressivo
   * numerico (00001, 00002...). Mai mappato su campi Shopify.
   */
  readonly articleCode?: string;
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly subcategory?: string;
  readonly internalNotes?: string;
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
  /** Tipo prodotto Articolo/Servizio (solo VestiFlow, mai su Shopify). */
  readonly kind?: ProductKind;
  readonly options: readonly ProductOptionDto[];
  readonly variants: readonly CreateProductVariantDto[];
}

/** Variante in update: `id` presente = esistente, assente = nuova. */
export interface UpdateProductVariantDto extends CreateProductVariantDto {
  readonly id?: EntityId;
}

/** Payload di modifica prodotto: patch parziale dei campi generali + set varianti. */
export interface UpdateProductDto {
  /** Codice articolo: undefined = non toccare; mai stringa vuota (campo obbligatorio). */
  readonly articleCode?: string;
  readonly name?: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly subcategory?: string;
  readonly internalNotes?: string;
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
  /** Tipo prodotto Articolo/Servizio (solo VestiFlow, mai su Shopify). */
  readonly kind?: ProductKind;
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

/** Esito del controllo di disponibilita' codice articolo (unicita' per tenant). */
export interface ArticleCodeAvailabilityResult {
  readonly articleCode: string;
  readonly available: boolean;
  /** Nome dell'articolo che occupa il codice ("già utilizzato da [nome]"). */
  readonly takenBy: string | null;
}

/** Lookup variante per SKU o barcode esatto (magazzino / PWA). */
export interface VariantByCodeDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly barcode?: string | null;
  readonly productName: string;
  /** False = prodotto non gestito a magazzino: le righe documento non caricano giacenza. */
  readonly managesStock?: boolean;
}

/** Attributo variante realmente presente (colore, taglia, o altro) per "Genera SKU". */
export interface GenerateSkuOptionValueDto {
  readonly name: string;
  readonly value: string;
}

/**
 * Payload per l'anteprima "Genera SKU" (POST products/sku/generate). Calcola
 * un codice prevedibile (categoria + nome/modello + attributi variante) e ne
 * risolve già l'unicità nel tenant, senza salvare nulla.
 */
export interface GenerateSkuRequestDto {
  readonly productName: string;
  readonly category?: string;
  readonly modelCode?: string;
  readonly optionValues?: readonly GenerateSkuOptionValueDto[];
}

export interface GenerateSkuResultDto {
  readonly sku: string;
}
