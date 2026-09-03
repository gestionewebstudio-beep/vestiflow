import type { EntityId, Money, TenantScoped, Timestamped } from './common.model';
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
  /**
   * «Nome online»: il titolo con cui il prodotto si vende su Shopify, distinto
   * dal nome interno. Assente = mai inizializzato: si riempie da solo alla
   * prima sincronizzazione (docs/24 §1.9).
   */
  readonly shopifyTitle?: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  /** Sottocategoria VestiFlow collegata alla categoria (vocabolario gestito). */
  readonly subcategory?: string;
  /** Note interne gestionale: mai sincronizzate con i canali. */
  readonly internalNotes?: string;
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
  /** Se false, le modifiche a questo prodotto NON si propagano a Shopify. */
  readonly shopifySyncEnabled: boolean;
  /** Provenienza catalogo: determina quali campi sono editabili in gestionale. */
  readonly catalogOrigin: CatalogOrigin;
  readonly unitOfMeasure?: string;
  readonly defaultVatCodeId?: string | null;
  /**
   * Prezzo di vendita dell'articolo (dato reale, non specchio): fa da seed alle
   * varianti alla creazione. Prodotto semplice (senza opzioni): è autoritativo e
   * la variante di default lo specchia.
   */
  readonly sellingPrice?: Money;
  /**
   * Prezzo Shopify dell'articolo (§B): valore proprio, indipendente dal prezzo
   * articolo. È l'unico prezzo che la pubblicazione Shopify legge. Precompilato
   * dal prezzo articolo alla creazione, poi editabile solo con Shopify attivo.
   */
  readonly shopifyPrice?: Money;
  /**
   * Prezzo "barrato" (compareAt): UNO per articolo. Non esiste più a livello di
   * variante. In export Shopify viene replicato su ogni variante.
   */
  readonly compareAtPrice?: Money;
  /**
   * Costo di RIFERIMENTO dell'articolo: fa da seed al costo delle nuove varianti.
   * Il costo effettivo (valorizzazione) resta sulla variante.
   */
  readonly purchasePrice?: Money;
  /**
   * Listini aggiuntivi (§B): tre posizioni fisse, valore UNICO per articolo (mai
   * per taglia) e sempre NETTO. Assenti = non valorizzati: un documento che
   * chiede un listino vuoto porta la riga a zero, non ripiega su un altro prezzo.
   * Nomi e attivazione sono impostazioni del tenant.
   */
  readonly listino1Price?: Money;
  readonly listino2Price?: Money;
  readonly listino3Price?: Money;
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
