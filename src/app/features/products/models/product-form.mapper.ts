import { ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';
import type { Product } from '@core/models/product.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import { DEFAULT_CURRENCY, moneyFromMajor, moneyToMajor } from '@core/utils/money.util';

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
      compareAtPrice: null,
      barcode: '',
      included: true,
    };
  });
}

/** Bozza variante unica per inserimento rapido (senza opzioni taglia/colore). */
export function createSingleVariantDraft(
  productName: string,
  existing?: VariantDraft,
  preserveSku = false,
): VariantDraft {
  const suggestedSku = suggestVariantSku(productName, []);
  const sku =
    preserveSku && existing?.sku.trim() ? existing.sku.trim() : suggestedSku || existing?.sku || '';

  return {
    key: existing?.key ?? '',
    id: existing?.id,
    optionValues: [],
    sku,
    sellingPrice: existing?.sellingPrice ?? 0,
    purchasePrice: existing?.purchasePrice ?? null,
    compareAtPrice: existing?.compareAtPrice ?? null,
    barcode: existing?.barcode ?? '',
    included: true,
  };
}

/** Allinea il draft alla modalità rapida: una sola variante, assi opzione vuoti. */
export function ensureQuickModeDraft(
  draft: ProductFormDraft,
  preserveSku = false,
): ProductFormDraft {
  return {
    ...draft,
    options: { axes: defaultOptionAxes() },
    variants: [createSingleVariantDraft(draft.general.name, draft.variants[0], preserveSku)],
  };
}

/** Prefill per creazione prodotto da pannello embedded (es. riga arrivo merce). */
export interface ProductEmbeddedCreatePrefill {
  readonly name?: string;
  readonly description?: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly purchasePriceMajor?: number | null;
  readonly sellingPriceMajor?: number | null;
  readonly compareAtPriceMajor?: number | null;
  readonly defaultVatRatePercent?: number | null;
  readonly defaultVatCodeId?: string | null;
}

/** Costruisce un draft quick-mode precompilato da dati riga documento. */
export function productFormDraftFromEmbeddedPrefill(
  prefill: ProductEmbeddedCreatePrefill,
): ProductFormDraft {
  const base = ensureQuickModeDraft(emptyProductFormDraft());
  const name = prefill.name?.trim() || base.general.name;
  const variant = base.variants[0]!;
  return ensureQuickModeDraft(
    {
      ...base,
      general: {
        ...base.general,
        name,
        description: prefill.description?.trim() || base.general.description,
        defaultVatRatePercent: prefill.defaultVatRatePercent ?? base.general.defaultVatRatePercent,
        defaultVatCodeId: prefill.defaultVatCodeId ?? base.general.defaultVatCodeId,
      },
      variants: [
        {
          ...variant,
          sku: prefill.sku?.trim() || variant.sku,
          barcode: prefill.barcode?.trim() || variant.barcode,
          purchasePrice:
            prefill.purchasePriceMajor != null ? prefill.purchasePriceMajor : variant.purchasePrice,
          sellingPrice:
            prefill.sellingPriceMajor != null ? prefill.sellingPriceMajor : variant.sellingPrice,
          compareAtPrice:
            prefill.compareAtPriceMajor != null
              ? prefill.compareAtPriceMajor
              : variant.compareAtPrice,
        },
      ],
    },
    Boolean(prefill.sku?.trim()),
  );
}

/** Draft iniziale vuoto per la creazione. */
export function emptyProductFormDraft(): ProductFormDraft {
  return {
    general: {
      name: '',
      description: '',
      brand: '',
      category: '',
      shopifyTaxonomyCategoryId: '',
      shopifyTaxonomyCategoryFullName: '',
      shopifyCategoryMetafields: [],
      season: '',
      tags: '',
      status: ProductStatus.Draft,
      unitOfMeasure: 'pz',
      defaultVatRatePercent: 22,
      defaultVatCodeId: '',
      inventoryTracking: InventoryTrackingMode.Standard,
      managesStock: true,
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
  // Ponte form->dominio: i prezzi del form sono in unità maggiori (number);
  // qui diventano Money (unità minori) nella valuta di default.
  return {
    sku: variant.sku.trim(),
    optionValues: variant.optionValues.map((option) => ({
      name: option.name,
      value: option.value,
    })),
    sellingPrice: moneyFromMajor(variant.sellingPrice, DEFAULT_CURRENCY),
    purchasePrice:
      variant.purchasePrice != null
        ? moneyFromMajor(variant.purchasePrice, DEFAULT_CURRENCY)
        : undefined,
    compareAtPrice:
      variant.compareAtPrice != null
        ? moneyFromMajor(variant.compareAtPrice, DEFAULT_CURRENCY)
        : undefined,
    barcode: trimmedOrUndefined(variant.barcode),
  };
}

function includedVariants(variants: readonly VariantDraft[]): readonly VariantDraft[] {
  return variants.filter((variant) => variant.included);
}

function parseTagsInput(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function formatTagsInput(tags: readonly string[] | undefined): string {
  return tags?.join(', ') ?? '';
}

function generalToDto(
  general: ProductGeneralDraft,
): Omit<CreateProductDto, 'options' | 'variants'> {
  return {
    name: general.name.trim(),
    description: trimmedOrUndefined(general.description),
    brand: trimmedOrUndefined(general.brand),
    category: trimmedOrUndefined(general.category),
    shopifyTaxonomyCategoryId: trimmedOrUndefined(general.shopifyTaxonomyCategoryId),
    shopifyTaxonomyCategoryFullName: trimmedOrUndefined(general.shopifyTaxonomyCategoryFullName),
    shopifyCategoryMetafields:
      general.shopifyCategoryMetafields.length > 0
        ? [...general.shopifyCategoryMetafields]
        : undefined,
    season: trimmedOrUndefined(general.season),
    tags: parseTagsInput(general.tags),
    status: general.status,
    unitOfMeasure: general.unitOfMeasure.trim() || 'pz',
    defaultVatRatePercent: general.defaultVatRatePercent,
    defaultVatCodeId: general.defaultVatCodeId || null,
    inventoryTracking: general.inventoryTracking,
    managesStock: general.managesStock,
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
    shopifyTaxonomyCategoryId: product.shopifyTaxonomyCategoryId ?? '',
    shopifyTaxonomyCategoryFullName: product.shopifyTaxonomyCategoryFullName ?? '',
    shopifyCategoryMetafields: product.shopifyCategoryMetafields
      ? [...product.shopifyCategoryMetafields]
      : [],
    season: product.season ?? '',
    tags: formatTagsInput(product.tags),
    status: product.status,
    unitOfMeasure: product.unitOfMeasure ?? 'pz',
    defaultVatRatePercent: product.defaultVatRatePercent ?? 22,
    defaultVatCodeId: product.defaultVatCodeId ?? '',
    inventoryTracking: product.inventoryTracking ?? InventoryTrackingMode.Standard,
    managesStock: product.managesStock ?? true,
  };
  const variantDrafts: VariantDraft[] = variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    optionValues: variant.optionValues.map((option) => ({
      name: option.name,
      value: option.value,
    })),
    sku: variant.sku,
    // Ponte dominio->form: Money (unità minori) torna a number in unità maggiori.
    sellingPrice: moneyToMajor(variant.sellingPrice),
    purchasePrice: variant.purchasePrice != null ? moneyToMajor(variant.purchasePrice) : null,
    compareAtPrice: variant.compareAtPrice != null ? moneyToMajor(variant.compareAtPrice) : null,
    barcode: variant.barcode ?? '',
    included: true,
  }));
  return {
    general,
    options: { axes: axesFromProduct(product, variants) },
    variants: variantDrafts,
  };
}
