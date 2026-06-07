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
import { suggestSku } from './product-sku.util';

// Nomi opzione coerenti col catalogo mock e col modello a due assi (taglia/colore).
export const OPTION_NAME_SIZE = 'Taglia';
export const OPTION_NAME_COLOR = 'Colore';

// Separatore non digitabile per la chiave d'identita' (taglia,colore).
const COMBO_SEPARATOR = '\u0000';

/** Chiave stabile di una combinazione: identifica la variante per (taglia,colore). */
function variantComboKey(size: string, color: string): string {
  return `${size}${COMBO_SEPARATOR}${color}`;
}

/** Dedup preservando l'ordine d'inserimento (generazione deterministica). */
function distinctOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/**
 * Combinazioni (prodotto cartesiano) degli assi non vuoti, in ordine stabile
 * (taglie esterne, colori interni). Un asse vuoto vale come singolo valore
 * neutro (''), cosi' un prodotto con sola taglia o solo colore genera comunque.
 * Nessun asse valorizzato -> nessuna combinazione.
 */
function cartesianPairs(options: ProductOptionsDraft): readonly { size: string; color: string }[] {
  if (options.sizes.length === 0 && options.colors.length === 0) {
    return [];
  }
  const sizes = options.sizes.length > 0 ? distinctOrdered(options.sizes) : [''];
  const colors = options.colors.length > 0 ? distinctOrdered(options.colors) : [''];
  const pairs: { size: string; color: string }[] = [];
  for (const size of sizes) {
    for (const color of colors) {
      pairs.push({ size, color });
    }
  }
  return pairs;
}

/**
 * Rigenera le bozze variante dalle opzioni, preservando per (taglia,colore) i
 * dati gia' inseriti (id in edit, SKU/prezzi modificati a mano nell'8.6, flag
 * `included`). Le combinazioni nuove ricevono uno SKU suggerito non bloccante;
 * quelle non piu' presenti vengono scartate. Output deterministico e stabile.
 */
export function generateVariantDrafts(
  options: ProductOptionsDraft,
  productName: string,
  existing: readonly VariantDraft[] = [],
): VariantDraft[] {
  const existingByCombo = new Map<string, VariantDraft>();
  for (const variant of existing) {
    existingByCombo.set(variantComboKey(variant.size, variant.color), variant);
  }

  return cartesianPairs(options).map(({ size, color }) => {
    const key = variantComboKey(size, color);
    const prev = existingByCombo.get(key);
    if (prev) {
      // Conserva i dati esistenti; la chiave resta agganciata alla combinazione.
      return { ...prev, key, size, color };
    }
    return {
      key,
      size,
      color,
      sku: suggestSku(productName, size, color),
      sellingPrice: 0,
      purchasePrice: null,
      barcode: '',
      included: true,
    };
  });
}

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
