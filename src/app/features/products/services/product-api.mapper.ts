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

function toApiVariant(variant: CreateProductVariantDto): Record<string, unknown> {
  return {
    sku: variant.sku,
    optionValues: variant.optionValues,
    sellingPrice: toApiMoney(variant.sellingPrice),
    purchasePrice: variant.purchasePrice ? toApiMoney(variant.purchasePrice) : undefined,
    compareAtPrice: variant.compareAtPrice ? toApiMoney(variant.compareAtPrice) : undefined,
    barcode: variant.barcode,
  };
}

/** Payload POST /products (NestJS CreateProductDto). */
export function toCreateProductBody(dto: CreateProductDto): Record<string, unknown> {
  return {
    name: dto.name,
    description: dto.description,
    brand: dto.brand,
    category: dto.category,
    season: dto.season,
    status: dto.status,
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
    name: dto.name,
    description: dto.description,
    brand: dto.brand,
    category: dto.category,
    season: dto.season,
    status: dto.status,
    options: dto.options?.map((option) => ({ name: option.name, values: [...option.values] })),
    variants: dto.variants?.map(toApiUpdateVariant),
  };
}
