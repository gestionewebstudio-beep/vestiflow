import type { Money } from '@core/models/money.model';

import type {
  CreateProductDto,
  CreateProductVariantDto,
  UpdateProductDto,
  UpdateProductVariantDto,
} from '../models/product.dto';

interface ApiMoneyDto {
  readonly amountMinor: number;
  readonly currency: string;
}

function toApiMoney(money: Money): ApiMoneyDto {
  return { amountMinor: money.amountMinor, currency: money.currencyCode };
}

/**
 * Listino verso l'API: `undefined` = campo non inviato (non toccare),
 * `null` = inviato vuoto (azzera). Il ternario non si può accorciare con `?:`
 * perché appiattirebbe il `null` su `undefined`, cioè "azzera" su "non toccare".
 */
function toApiListino(money: Money | null | undefined): ApiMoneyDto | null | undefined {
  if (money === undefined) {
    return undefined;
  }
  return money === null ? null : toApiMoney(money);
}

function toApiVariant(variant: CreateProductVariantDto): Record<string, unknown> {
  return {
    // Facoltativo (specifica cliente §SKU): trim + stringa vuota -> non
    // inviato, cosi' il backend riceve `undefined` invece di "" (che
    // fallirebbe la validazione @MinLength(1) quando presente).
    sku: variant.sku?.trim() || undefined,
    optionValues: variant.optionValues,
    sellingPrice: toApiMoney(variant.sellingPrice),
    shopifyPrice: variant.shopifyPrice ? toApiMoney(variant.shopifyPrice) : undefined,
    purchasePrice: variant.purchasePrice ? toApiMoney(variant.purchasePrice) : undefined,
    barcode: variant.barcode,
  };
}

/** Payload POST /products (NestJS CreateProductDto). */
export function toCreateProductBody(dto: CreateProductDto): Record<string, unknown> {
  return {
    // Facoltativo in creazione: vuoto -> non inviato, il backend genera il
    // progressivo (§Codice articolo). Mai mappato su campi Shopify.
    articleCode: dto.articleCode?.trim() || undefined,
    name: dto.name,
    // Prezzo/costo a livello articolo: sellingPrice obbligatorio, barrato e costo
    // di riferimento opzionali.
    sellingPrice: toApiMoney(dto.sellingPrice),
    shopifyPrice: dto.shopifyPrice ? toApiMoney(dto.shopifyPrice) : undefined,
    compareAtPrice: dto.compareAtPrice ? toApiMoney(dto.compareAtPrice) : undefined,
    purchasePrice: dto.purchasePrice ? toApiMoney(dto.purchasePrice) : undefined,
    // Listini aggiuntivi (§B): sempre netti.
    listino1Price: toApiListino(dto.listino1Price),
    listino2Price: toApiListino(dto.listino2Price),
    listino3Price: toApiListino(dto.listino3Price),
    // Modalità di compilazione: memoria personale dell'operatore, non un campo
    // dell'articolo (il backend la ricorda solo alla creazione).
    description: dto.description,
    brand: dto.brand,
    category: dto.category,
    subcategory: dto.subcategory,
    internalNotes: dto.internalNotes,
    shopifyTaxonomyCategoryId: dto.shopifyTaxonomyCategoryId,
    shopifyTaxonomyCategoryFullName: dto.shopifyTaxonomyCategoryFullName,
    shopifyCategoryMetafields: dto.shopifyCategoryMetafields,
    season: dto.season,
    tags: dto.tags,
    status: dto.status,
    unitOfMeasure: dto.unitOfMeasure,
    defaultVatCodeId: dto.defaultVatCodeId ?? undefined,
    inventoryTracking: dto.inventoryTracking,
    managesStock: dto.managesStock,
    // Tipo prodotto Articolo/Servizio: solo VestiFlow, mai inviato a Shopify.
    kind: dto.kind,
    options: dto.options.map((option) => ({ name: option.name, values: [...option.values] })),
    variants: dto.variants.map(toApiVariant),
  };
}

function toApiUpdateVariant(variant: UpdateProductVariantDto): Record<string, unknown> {
  return {
    ...toApiVariant(variant),
    id: variant.id,
  };
}

/**
 * Payload PATCH /products/:id — dati generali + sync varianti (create/update/delete).
 */
export function toUpdateProductBody(dto: UpdateProductDto): Record<string, unknown> {
  return {
    // undefined = non toccare il codice; il form blocca il salvataggio se
    // l'operatore lo svuota (campo obbligatorio, §Codice articolo).
    articleCode: dto.articleCode?.trim() || undefined,
    name: dto.name,
    // Prezzo/costo a livello articolo. undefined = non toccare; il barrato
    // assente resta undefined (non azzerato qui, il form lo governa).
    sellingPrice: dto.sellingPrice ? toApiMoney(dto.sellingPrice) : undefined,
    shopifyPrice: dto.shopifyPrice ? toApiMoney(dto.shopifyPrice) : undefined,
    compareAtPrice: dto.compareAtPrice ? toApiMoney(dto.compareAtPrice) : undefined,
    purchasePrice: dto.purchasePrice ? toApiMoney(dto.purchasePrice) : undefined,
    // Listini aggiuntivi (§B): null esplicito = azzera il listino.
    listino1Price: toApiListino(dto.listino1Price),
    listino2Price: toApiListino(dto.listino2Price),
    listino3Price: toApiListino(dto.listino3Price),
    description: dto.description,
    brand: dto.brand,
    category: dto.category,
    subcategory: dto.subcategory,
    internalNotes: dto.internalNotes,
    shopifyTaxonomyCategoryId: dto.shopifyTaxonomyCategoryId,
    shopifyTaxonomyCategoryFullName: dto.shopifyTaxonomyCategoryFullName,
    shopifyCategoryMetafields: dto.shopifyCategoryMetafields,
    season: dto.season,
    tags: dto.tags,
    status: dto.status,
    unitOfMeasure: dto.unitOfMeasure,
    // Null esplicito = torna al Codice IVA predefinito aziendale.
    defaultVatCodeId: dto.defaultVatCodeId,
    inventoryTracking: dto.inventoryTracking,
    managesStock: dto.managesStock,
    // Tipo prodotto Articolo/Servizio: solo VestiFlow, mai inviato a Shopify.
    kind: dto.kind,
    options: dto.options?.map((option) => ({ name: option.name, values: [...option.values] })),
    variants: dto.variants?.map(toApiUpdateVariant),
  };
}
