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
import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from './product-form.model';
import type {
  OptionAxisDraft,
  ProductFormDraft,
  ProductGeneralDraft,
  ProductOptionsDraft,
  VariantDraft,
} from './product-form.model';
import { suggestVariantSku } from './product-sku.util';
import { cartesianOptionValues, comboKey, selectedOptionValue } from './product-variant.util';

/** Assi di default per la creazione (UX conservativa: Taglia + Colore vuoti). */
function defaultOptionAxes(): OptionAxisDraft[] {
  return [
    { name: OPTION_NAME_SIZE, values: [] },
    { name: OPTION_NAME_COLOR, values: [] },
  ];
}

/**
 * Rigenera le bozze variante dalle opzioni (prodotto cartesiano degli assi),
 * preservando i dati gia' inseriti (id in edit, SKU/prezzi modificati a mano,
 * flag `included`). Il match con le varianti esistenti avviene per *proiezione*
 * sui soli assi attivi correnti: cosi' il rename di un asse (i valori non
 * cambiano) conserva i dati, e la rimozione di un asse collassa le combinazioni
 * sulla coppia rimanente conservando la PRIMA in ordine di generazione. Le
 * combinazioni nuove ricevono uno SKU suggerito non bloccante; quelle non piu'
 * presenti vengono scartate.
 */
export function generateVariantDrafts(
  options: ProductOptionsDraft,
  productName: string,
  existing: readonly VariantDraft[] = [],
): VariantDraft[] {
  const activeNames = options.axes
    .filter((axis) => axis.values.length > 0)
    .map((axis) => axis.name);
  const projectedKey = (values: readonly { name: string; value: string }[]): string =>
    comboKey(activeNames.map((name) => ({ name, value: selectedOptionValue(values, name) })));

  const existingByCombo = new Map<string, VariantDraft>();
  for (const variant of existing) {
    const key = projectedKey(variant.optionValues);
    // Prima occorrenza vince (rilevante quando la rimozione di un asse collassa
    // piu' varianti sulla stessa combinazione rimanente).
    if (!existingByCombo.has(key)) {
      existingByCombo.set(key, variant);
    }
  }

  return cartesianOptionValues(options.axes).map((optionValues) => {
    const key = comboKey(optionValues);
    const prev = existingByCombo.get(key);
    if (prev) {
      // Conserva i dati esistenti; la chiave resta agganciata alla combinazione.
      return { ...prev, key, optionValues };
    }
    return {
      key,
      optionValues,
      sku: suggestVariantSku(
        productName,
        optionValues.map((option) => option.value),
      ),
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
    options: { axes: defaultOptionAxes() },
    variants: [],
  };
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildOptionDtos(options: ProductOptionsDraft): ProductOptionDto[] {
  return options.axes
    .filter((axis) => axis.values.length > 0)
    .map((axis) => ({ name: axis.name, values: [...axis.values] }));
}

function toVariantBase(variant: VariantDraft): CreateProductVariantDto {
  return {
    sku: variant.sku.trim(),
    optionValues: variant.optionValues.map((option) => ({
      name: option.name,
      value: option.value,
    })),
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

/**
 * Assi del draft derivati dalle opzioni del prodotto (autoritative). Fallback:
 * se il prodotto non ha opzioni, li ricava dai valori presenti nelle varianti.
 */
function axesFromProduct(product: Product, variants: readonly ProductVariant[]): OptionAxisDraft[] {
  if (product.options.length > 0) {
    return product.options.map((option) => ({ name: option.name, values: [...option.values] }));
  }
  const byName = new Map<string, string[]>();
  for (const variant of variants) {
    for (const option of variant.optionValues) {
      const values = byName.get(option.name) ?? [];
      if (!values.includes(option.value)) {
        values.push(option.value);
      }
      byName.set(option.name, values);
    }
  }
  return [...byName].map(([name, values]) => ({ name, values }));
}

/**
 * Ricostruisce un draft dai dati esistenti (prefill in edit). Gli assi derivano
 * dalle opzioni del prodotto; ogni variante porta direttamente le sue
 * `optionValues`, così il prefill è coerente col modello generico.
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
    optionValues: variant.optionValues.map((option) => ({
      name: option.name,
      value: option.value,
    })),
    sku: variant.sku,
    sellingPrice: variant.sellingPrice,
    purchasePrice: variant.purchasePrice ?? null,
    barcode: variant.barcode ?? '',
    included: true,
  }));
  return {
    general,
    options: { axes: axesFromProduct(product, variants) },
    variants: variantDrafts,
  };
}
