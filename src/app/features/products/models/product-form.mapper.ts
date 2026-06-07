import { ProductStatus } from '@core/models/product.model';
import type { Product } from '@core/models/product.model';
import type { ProductVariant } from '@core/models/product-variant.model';

import type {
  CreateProductDto,
  CreateProductVariantDto,
  ProductOptionDto,
  UpdateProductDto,
  UpdateProductVariantDto,
} from './product.dto';
import type {
  ProductFormDraft,
  ProductGeneralDraft,
  ProductOptionsDraft,
  VariantDraft,
} from './product-form.model';

// Nomi opzione coerenti col catalogo mock e col modello a due assi (taglia/colore).
export const OPTION_NAME_SIZE = 'Taglia';
export const OPTION_NAME_COLOR = 'Colore';

/** Draft iniziale vuoto per la creazione. */
export function emptyProductFormDraft(): ProductFormDraft {
  return {
    general: {
      name: '',
      description: '',
      brand: '',
      category: '',
      season: '',
      status: ProductStatus.Draft,
    },
    options: { sizes: [], colors: [] },
    variants: [],
  };
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildOptionDtos(options: ProductOptionsDraft): ProductOptionDto[] {
  const dtos: ProductOptionDto[] = [];
  if (options.sizes.length > 0) {
    dtos.push({ name: OPTION_NAME_SIZE, values: [...options.sizes] });
  }
  if (options.colors.length > 0) {
    dtos.push({ name: OPTION_NAME_COLOR, values: [...options.colors] });
  }
  return dtos;
}

function toVariantBase(variant: VariantDraft): CreateProductVariantDto {
  return {
    sku: variant.sku.trim(),
    size: variant.size,
    color: variant.color,
    sellingPrice: variant.sellingPrice,
    purchasePrice: variant.purchasePrice ?? undefined,
    barcode: trimmedOrUndefined(variant.barcode),
  };
}

function includedVariants(variants: readonly VariantDraft[]): readonly VariantDraft[] {
  return variants.filter((variant) => variant.included);
}

function generalToDto(
  general: ProductGeneralDraft,
): Omit<CreateProductDto, 'options' | 'variants'> {
  return {
    name: general.name.trim(),
    description: trimmedOrUndefined(general.description),
    brand: trimmedOrUndefined(general.brand),
    category: trimmedOrUndefined(general.category),
    season: trimmedOrUndefined(general.season),
    status: general.status,
  };
}

/** Draft -> payload di creazione (solo varianti incluse). */
export function toCreateProductDto(draft: ProductFormDraft): CreateProductDto {
  return {
    ...generalToDto(draft.general),
    options: buildOptionDtos(draft.options),
    variants: includedVariants(draft.variants).map(toVariantBase),
  };
}

/** Draft -> payload di modifica (le varianti esistenti conservano l'`id`). */
export function toUpdateProductDto(draft: ProductFormDraft): UpdateProductDto {
  const variants: UpdateProductVariantDto[] = includedVariants(draft.variants).map((variant) => ({
    ...toVariantBase(variant),
    id: variant.id,
  }));
  return {
    ...generalToDto(draft.general),
    options: buildOptionDtos(draft.options),
    variants,
  };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Ricostruisce un draft dai dati esistenti (prefill in edit). Taglie e colori
 * sono derivati dalle varianti, cosi' il prefill non dipende dai nomi opzione.
 */
export function productToFormDraft(
  product: Product,
  variants: readonly ProductVariant[],
): ProductFormDraft {
  const general: ProductGeneralDraft = {
    name: product.name,
    description: product.description ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    season: product.season ?? '',
    status: product.status,
  };
  const variantDrafts: VariantDraft[] = variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    size: variant.size,
    color: variant.color,
    sku: variant.sku,
    sellingPrice: variant.sellingPrice,
    purchasePrice: variant.purchasePrice ?? null,
    barcode: variant.barcode ?? '',
    included: true,
  }));
  return {
    general,
    options: {
      sizes: distinct(variants.map((variant) => variant.size)),
      colors: distinct(variants.map((variant) => variant.color)),
    },
    variants: variantDrafts,
  };
}
