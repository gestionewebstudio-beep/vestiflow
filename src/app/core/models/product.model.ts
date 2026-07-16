import type { EntityId, TenantScoped, Timestamped } from './common.model';
import type { CatalogOrigin } from './catalog-origin.model';
import type { InventoryTrackingMode } from './product-catalog.model';
import type { ProductImage } from './product-image.model';
import type { ShopifyLink } from './shopify.model';
import type { ShopifyCollectionRef, ShopifyMetafieldRef } from './shopify-product-metadata.model';
import type { ShopifyCategoryMetafieldValue } from './shopify-category-metafield.model';

export const ProductStatus = {
  Draft: 'draft',
  Active: 'active',
  Archived: 'archived',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

/**
 * Tipo prodotto (Articolo/Servizio): proprietà SOLO VestiFlow, mai mappata su
 * campi Shopify. Un Servizio non richiede SKU/EAN, non genera movimenti di
 * magazzino e non conta in giacenza.
 */
export const ProductKind = {
  Article: 'article',
  Service: 'service',
} as const;
export type ProductKind = (typeof ProductKind)[keyof typeof ProductKind];

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  [ProductKind.Article]: 'Articolo',
  [ProductKind.Service]: 'Servizio',
};

/**
 * Opzione di variante (es. { name: 'Taglia', values: ['S','M','L'] }).
 * Serve alla generazione automatica delle combinazioni di varianti.
 */
export interface ProductOption {
  readonly name: string;
  readonly values: readonly string[];
}

/**
 * Coppia opzione→valore di una variante (forma Shopify `selectedOptions`,
 * es. { name: 'Taglia', value: 'M' }). Una variante è definita da 1–3 di queste.
 */
export interface SelectedOption {
  readonly name: string;
  readonly value: string;
}

/**
 * Prodotto = entita' di catalogo. NON contiene stock ne' varianti incorporate:
 * le varianti (ProductVariant) e lo stock (InventoryLevel) sono separati.
 */
export interface Product extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /**
   * Codice articolo: identificatore anagrafico principale dell'articolo in
   * VestiFlow. Obbligatorio, univoco per tenant, sempre in MAIUSCOLO.
   * Proprietà SOLO VestiFlow: mai mappata su campi Shopify.
   */
  readonly articleCode: string;
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly shopifyTaxonomyCategoryId?: string;
  readonly shopifyTaxonomyCategoryFullName?: string;
  readonly season?: string;
  readonly tags?: readonly string[];
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly shopifyCollections?: readonly ShopifyCollectionRef[];
  readonly shopifyMetafields?: readonly ShopifyMetafieldRef[];
  readonly shopifyCategoryMetafields?: readonly ShopifyCategoryMetafieldValue[];
  readonly status: ProductStatus;
  /** Provenienza catalogo: determina quali campi sono editabili in gestionale. */
  readonly catalogOrigin: CatalogOrigin;
  readonly unitOfMeasure?: string;
  readonly defaultVatCodeId?: string | null;
  readonly inventoryTracking?: InventoryTrackingMode;
  readonly managesStock?: boolean;
  /**
   * Tipo prodotto (Articolo/Servizio): proprietà interna VestiFlow, mai
   * sincronizzata con Shopify. Governa il default della spunta
   * "Impegna magazzino" per riga negli Ordini cliente.
   */
  readonly kind?: ProductKind;
  readonly options: readonly ProductOption[];
  readonly images?: readonly ProductImage[];
  readonly shopify?: ShopifyLink;
}
