import { ProductKind, ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';
import type { Money } from '@core/models/common.model';
import type { Product } from '@core/models/product.model';
import type { ProductVariant } from '@core/models/product-variant.model';
// Due ponti, non uno: `moneyFromMajorExact` per i prezzi (colonne a sei
// decimali, dove la coda di uno scorporo IVA deve arrivare intera),
// `moneyFromMajor` per costo e barrato, che restano interi in unità minori.
import {
  DEFAULT_CURRENCY,
  moneyFromMajor,
  moneyFromMajorExact,
  moneyToMajor,
} from '@core/utils/money.util';

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
 * combinazioni nuove nascono con SKU vuoto (mai suggerito/generato in
 * automatico: solo inserimento manuale o pulsante "Genera SKU", specifica
 * cliente §SKU); quelle non piu' presenti vengono scartate.
 */
/** Valori articolo che fanno da seed a una NUOVA variante (prezzo e costo). */
export interface VariantSeed {
  readonly sellingPrice: number;
  readonly purchasePrice: number | null;
}

/**
 * Prezzo Shopify di una NUOVA variante alla generazione: seed dal prezzo
 * variante (che a sua volta nasce dal prezzo articolo), poi indipendente.
 */
function seedShopifyPrice(seed?: VariantSeed): number {
  return seed?.sellingPrice ?? 0;
}

export function generateVariantDrafts(
  options: ProductOptionsDraft,
  // Mantenuto per compatibilita' con i chiamanti esistenti; non piu' usato
  // per suggerire uno SKU (rimosso: mai generato in automatico).
  _productName: string,
  existing: readonly VariantDraft[] = [],
  // Seed articolo: prezzo/costo dell'articolo con cui nasce ogni NUOVA
  // combinazione. Le varianti già esistenti conservano i propri valori.
  seed?: VariantSeed,
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
      // Mai generato in automatico: l'utente lo inserisce a mano o con
      // "Genera SKU" (specifica cliente §SKU).
      sku: '',
      // Seed dal prezzo/costo di articolo (se fornito): la nuova combinazione
      // nasce coi valori dell'articolo, poi è modificabile in modo indipendente.
      sellingPrice: seed?.sellingPrice ?? 0,
      shopifyPrice: seedShopifyPrice(seed),
      purchasePrice: seed?.purchasePrice ?? null,
      barcode: '',
      included: true,
    };
  });
}

/**
 * Bozza variante unica per inserimento rapido (senza opzioni taglia/colore).
 * Lo SKU non viene MAI suggerito/generato in automatico (specifica cliente
 * §SKU): con `preserveSku` true mantiene il valore già presente (es. da un
 * prefill esplicito), altrimenti riparte vuoto — mai un valore ricalcolato
 * dal nome.
 */
export function createSingleVariantDraft(
  existing?: VariantDraft,
  preserveSku = false,
): VariantDraft {
  const sku = preserveSku ? (existing?.sku.trim() ?? '') : '';

  return {
    key: existing?.key ?? '',
    id: existing?.id,
    optionValues: [],
    sku,
    sellingPrice: existing?.sellingPrice ?? 0,
    shopifyPrice: existing?.shopifyPrice ?? existing?.sellingPrice ?? 0,
    purchasePrice: existing?.purchasePrice ?? null,
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
    variants: [createSingleVariantDraft(draft.variants[0], preserveSku)],
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
  readonly defaultVatCodeId?: string | null;
}

/** Costruisce un draft quick-mode precompilato da dati riga documento. */
export function productFormDraftFromEmbeddedPrefill(
  prefill: ProductEmbeddedCreatePrefill,
): ProductFormDraft {
  const base = ensureQuickModeDraft(emptyProductFormDraft());
  const name = prefill.name?.trim() || base.general.name;
  const variant = base.variants[0]!;
  // Prodotto semplice: prezzo/barrato/costo sono dati dell'ARTICOLO; la variante
  // di default li rispecchia (prezzo/costo), il barrato resta solo sull'articolo.
  const sellingPrice =
    prefill.sellingPriceMajor != null ? prefill.sellingPriceMajor : base.general.sellingPrice;
  const purchasePrice =
    prefill.purchasePriceMajor != null ? prefill.purchasePriceMajor : base.general.purchasePrice;
  const compareAtPrice =
    prefill.compareAtPriceMajor != null ? prefill.compareAtPriceMajor : base.general.compareAtPrice;
  return ensureQuickModeDraft(
    {
      ...base,
      general: {
        ...base.general,
        name,
        description: prefill.description?.trim() || base.general.description,
        defaultVatCodeId: prefill.defaultVatCodeId ?? base.general.defaultVatCodeId,
        sellingPrice,
        // Prezzo Shopify precompilato dal prezzo articolo (§B).
        shopifyPrice: sellingPrice,
        purchasePrice,
        compareAtPrice,
      },
      variants: [
        {
          ...variant,
          sku: prefill.sku?.trim() || variant.sku,
          barcode: prefill.barcode?.trim() || variant.barcode,
          // Specchio dell'articolo: coerente col mirror applicato al build DTO.
          purchasePrice,
          sellingPrice,
          shopifyPrice: sellingPrice,
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
      articleCode: '',
      name: '',
      description: '',
      brand: '',
      category: '',
      subcategory: '',
      internalNotes: '',
      supplierId: '',
      shopifyTaxonomyCategoryId: '',
      shopifyTaxonomyCategoryFullName: '',
      shopifyCategoryMetafields: [],
      season: '',
      tags: '',
      status: ProductStatus.Draft,
      shopifySyncEnabled: true,
      unitOfMeasure: 'pz',
      defaultVatCodeId: '',
      inventoryTracking: InventoryTrackingMode.Standard,
      managesStock: true,
      kind: ProductKind.Article,
      sellingPrice: 0,
      shopifyPrice: 0,
      compareAtPrice: null,
      purchasePrice: null,
      listino1Price: null,
      listino2Price: null,
      listino3Price: null,
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
    // Facoltativo (specifica cliente §SKU): stringa vuota -> non inviato,
    // mai bloccante per il salvataggio.
    sku: trimmedOrUndefined(variant.sku),
    optionValues: variant.optionValues.map((option) => ({
      name: option.name,
      value: option.value,
    })),
    sellingPrice: moneyFromMajorExact(variant.sellingPrice, DEFAULT_CURRENCY),
    // Prezzo Shopify variante: sempre inviato (il backend lo usa con Shopify
    // attivo, lo ignora a Shopify spento applicando la propria regola di follow).
    shopifyPrice: moneyFromMajorExact(variant.shopifyPrice, DEFAULT_CURRENCY),
    purchasePrice:
      variant.purchasePrice != null
        ? moneyFromMajor(variant.purchasePrice, DEFAULT_CURRENCY)
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

/** Listino del draft -> Money netto, `null` se il campo è stato svuotato. */
function listinoMoney(value: number | null): Money | null {
  return value != null ? moneyFromMajorExact(value, DEFAULT_CURRENCY) : null;
}

function generalToDto(
  general: ProductGeneralDraft,
): Omit<CreateProductDto, 'options' | 'variants'> {
  return {
    // Vuoto -> undefined: in creazione il backend genera il progressivo; in
    // modifica il form blocca il salvataggio prima di arrivare qui (campo
    // obbligatorio). Normalizzato in maiuscolo per coerenza visiva.
    articleCode: general.articleCode.trim().toUpperCase() || undefined,
    name: general.name.trim(),
    // Prezzo/costo a livello articolo (ponte unità maggiori -> Money). Il prezzo
    // di vendita è sempre inviato; barrato e costo di riferimento solo se
    // valorizzati (null nel draft = assente).
    sellingPrice: moneyFromMajorExact(general.sellingPrice, DEFAULT_CURRENCY),
    // Prezzo Shopify articolo: sempre inviato (backend autoritativo, vedi sopra).
    shopifyPrice: moneyFromMajorExact(general.shopifyPrice, DEFAULT_CURRENCY),
    compareAtPrice:
      general.compareAtPrice != null
        ? moneyFromMajor(general.compareAtPrice, DEFAULT_CURRENCY)
        : undefined,
    purchasePrice:
      general.purchasePrice != null
        ? moneyFromMajor(general.purchasePrice, DEFAULT_CURRENCY)
        : undefined,
    // Listini aggiuntivi (§B): sempre inviati, `null` quando l'operatore ha
    // svuotato il campo — è così che il backend distingue "azzera" da "non
    // toccare". Il draft li porta già netti.
    listino1Price: listinoMoney(general.listino1Price),
    listino2Price: listinoMoney(general.listino2Price),
    listino3Price: listinoMoney(general.listino3Price),
    description: trimmedOrUndefined(general.description),
    brand: trimmedOrUndefined(general.brand),
    category: trimmedOrUndefined(general.category),
    subcategory: trimmedOrUndefined(general.subcategory),
    internalNotes: trimmedOrUndefined(general.internalNotes),
    // supplierId resta fuori dal DTO: il collegamento fornitore-varianti viene
    // creato dal form dopo il salvataggio (upsertVariantLink).
    shopifyTaxonomyCategoryId: trimmedOrUndefined(general.shopifyTaxonomyCategoryId),
    shopifyTaxonomyCategoryFullName: trimmedOrUndefined(general.shopifyTaxonomyCategoryFullName),
    shopifyCategoryMetafields:
      general.shopifyCategoryMetafields.length > 0
        ? [...general.shopifyCategoryMetafields]
        : undefined,
    season: trimmedOrUndefined(general.season),
    tags: parseTagsInput(general.tags),
    status: general.status,
    shopifySyncEnabled: general.shopifySyncEnabled,
    unitOfMeasure: general.unitOfMeasure.trim() || 'pz',
    defaultVatCodeId: general.defaultVatCodeId || null,
    inventoryTracking: general.inventoryTracking,
    managesStock: general.managesStock,
    kind: general.kind,
  };
}

/**
 * Prodotto semplice: nessun asse opzione valorizzato e al più una variante
 * (la variante di default anonima del Modello X).
 */
function isSimpleProductDraft(draft: ProductFormDraft): boolean {
  const noOptions = draft.options.axes.every((axis) => axis.values.length === 0);
  return noOptions && includedVariants(draft.variants).length <= 1;
}

/** Prezzo di vendita dell'articolo come Money (sempre presente nel form). */
function articleSellingMoney(
  general: ProductGeneralDraft,
): CreateProductVariantDto['sellingPrice'] {
  return moneyFromMajorExact(general.sellingPrice, DEFAULT_CURRENCY);
}

/** Costo di riferimento dell'articolo come Money (null nel draft = assente). */
function articlePurchaseMoney(
  general: ProductGeneralDraft,
): CreateProductVariantDto['purchasePrice'] {
  return general.purchasePrice != null
    ? moneyFromMajor(general.purchasePrice, DEFAULT_CURRENCY)
    : undefined;
}

/** Prezzo Shopify dell'articolo come Money (sempre presente nel form). */
function articleShopifyMoney(
  general: ProductGeneralDraft,
): CreateProductVariantDto['shopifyPrice'] {
  return moneyFromMajorExact(general.shopifyPrice, DEFAULT_CURRENCY);
}

/**
 * Draft -> payload di creazione (solo varianti incluse).
 *
 * `listinoPricesIncludeVat` è la modalità con cui l'operatore stava compilando
 * la sezione Listini: viaggia solo alla creazione e solo per farsela ricordare
 * dal backend (preferenza personale). Non è un dato dell'articolo, per questo
 * non sta nel draft.
 */
export function toCreateProductDto(
  draft: ProductFormDraft,
  listinoPricesIncludeVat?: boolean,
): CreateProductDto {
  const simple = isSimpleProductDraft(draft);
  const variants = includedVariants(draft.variants).map((variant) => {
    const base = toVariantBase(variant);
    // Prodotto semplice: la variante di default nasce col prezzo E col costo
    // dell'articolo (seed). Il backend ribadisce poi il mirror del prezzo.
    return simple
      ? {
          ...base,
          sellingPrice: articleSellingMoney(draft.general),
          shopifyPrice: articleShopifyMoney(draft.general),
          purchasePrice: articlePurchaseMoney(draft.general),
        }
      : base;
  });
  return {
    ...generalToDto(draft.general),
    ...(listinoPricesIncludeVat !== undefined ? { listinoPricesIncludeVat } : {}),
    options: buildOptionDtos(draft.options),
    variants,
  };
}

/** Draft -> payload di modifica (le varianti esistenti conservano l'`id`). */
export function toUpdateProductDto(draft: ProductFormDraft): UpdateProductDto {
  const simple = isSimpleProductDraft(draft);
  const variants: UpdateProductVariantDto[] = includedVariants(draft.variants).map((variant) => {
    const base = toVariantBase(variant);
    // Prodotto semplice in modifica: la variante di default specchia il PREZZO
    // dell'articolo (coerente col mirror backend). Il COSTO effettivo NON viene
    // toccato: è aggiornato dai carichi e sovrascriverlo con il costo di
    // riferimento perderebbe il dato di valorizzazione.
    return {
      ...base,
      ...(simple
        ? {
            sellingPrice: articleSellingMoney(draft.general),
            shopifyPrice: articleShopifyMoney(draft.general),
          }
        : {}),
      id: variant.id,
    };
  });
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
    articleCode: product.articleCode,
    name: product.name,
    description: product.description ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    subcategory: product.subcategory ?? '',
    internalNotes: product.internalNotes ?? '',
    // Prefillato dal form in edit (dai collegamenti fornitore esistenti).
    supplierId: '',
    shopifyTaxonomyCategoryId: product.shopifyTaxonomyCategoryId ?? '',
    shopifyTaxonomyCategoryFullName: product.shopifyTaxonomyCategoryFullName ?? '',
    shopifyCategoryMetafields: product.shopifyCategoryMetafields
      ? [...product.shopifyCategoryMetafields]
      : [],
    season: product.season ?? '',
    tags: formatTagsInput(product.tags),
    status: product.status,
    shopifySyncEnabled: product.shopifySyncEnabled ?? true,
    unitOfMeasure: product.unitOfMeasure ?? 'pz',
    defaultVatCodeId: product.defaultVatCodeId ?? '',
    inventoryTracking: product.inventoryTracking ?? InventoryTrackingMode.Standard,
    managesStock: product.managesStock ?? true,
    kind: product.kind ?? ProductKind.Article,
    // Prezzo/costo a livello articolo (Money -> unità maggiori). Il prezzo di
    // vendita ha sempre un valore (default 0); barrato e costo di riferimento
    // sono opzionali (null = assente).
    sellingPrice: product.sellingPrice != null ? moneyToMajor(product.sellingPrice) : 0,
    // Prezzo Shopify articolo: valore proprio; fallback al prezzo articolo se
    // assente (a DB è sempre valorizzato).
    shopifyPrice:
      product.shopifyPrice != null
        ? moneyToMajor(product.shopifyPrice)
        : product.sellingPrice != null
          ? moneyToMajor(product.sellingPrice)
          : 0,
    compareAtPrice: product.compareAtPrice != null ? moneyToMajor(product.compareAtPrice) : null,
    purchasePrice: product.purchasePrice != null ? moneyToMajor(product.purchasePrice) : null,
    // Listini aggiuntivi (§B): netti a DB, netti nel draft. La sezione li mostra
    // ivati solo se l'operatore lavora in quella modalità.
    listino1Price: product.listino1Price != null ? moneyToMajor(product.listino1Price) : null,
    listino2Price: product.listino2Price != null ? moneyToMajor(product.listino2Price) : null,
    listino3Price: product.listino3Price != null ? moneyToMajor(product.listino3Price) : null,
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
    // Prezzo Shopify variante: valore proprio; fallback al prezzo variante.
    shopifyPrice:
      variant.shopifyPrice != null
        ? moneyToMajor(variant.shopifyPrice)
        : moneyToMajor(variant.sellingPrice),
    purchasePrice: variant.purchasePrice != null ? moneyToMajor(variant.purchasePrice) : null,
    barcode: variant.barcode ?? '',
    included: true,
  }));
  return {
    general,
    options: { axes: axesFromProduct(product, variants) },
    variants: variantDrafts,
  };
}
