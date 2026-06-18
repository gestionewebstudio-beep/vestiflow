import type { EntityId, TenantScoped, Timestamped } from './common.model';
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
  readonly options: readonly ProductOption[];
  readonly images?: readonly ProductImage[];
  readonly shopify?: ShopifyLink;
}
