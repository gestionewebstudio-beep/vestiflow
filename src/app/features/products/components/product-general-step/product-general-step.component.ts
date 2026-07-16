import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import type { Subscription } from 'rxjs';

import { PRODUCT_KIND_LABELS, ProductKind, ProductStatus } from '@core/models/product.model';
import type { ShopifyCategoryMetafieldValue } from '@core/models/shopify-category-metafield.model';
import { vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import {
  COMMON_UNIT_OF_MEASURE,
  INVENTORY_TRACKING_LABELS,
  InventoryTrackingMode,
} from '@core/models/product-catalog.model';

import type { ProductGeneralDraft } from '../../models/product-form.model';
import {
  ARTICLE_CODE_FORMAT_MESSAGE,
  ARTICLE_CODE_PATTERN,
  ARTICLE_CODE_REQUIRED_MESSAGE,
  normalizeArticleCode,
} from '../../models/product-form.validators';
import {
  buildProductSeasonSelectOptions,
  isStandardProductSeason,
  PRODUCT_SEASON_CUSTOM_OPTION,
} from '../../models/product-season.options';
import { productStatusLabel } from '../../models/product-status.util';
import { ShopifyCategoryAttributesComponent } from '../shopify-category-attributes/shopify-category-attributes.component';
import type { ShopifyTaxonomySelection } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';
import { ShopifyTaxonomyPickerComponent } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';

type RequiredField = 'name';

interface StatusOption {
  readonly value: ProductStatus;
  readonly label: string;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: ProductStatus.Active, label: productStatusLabel(ProductStatus.Active) },
  { value: ProductStatus.Draft, label: productStatusLabel(ProductStatus.Draft) },
  { value: ProductStatus.Archived, label: productStatusLabel(ProductStatus.Archived) },
];

/** Valore speciale select: apre l'inserimento manuale di categoria/stagione. */
const CUSTOM_OPTION_VALUE = '__custom__';

@Component({
  selector: 'app-product-general-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    SelectMenuComponent,
    ShopifyTaxonomyPickerComponent,
    ShopifyCategoryAttributesComponent,
  ],
  templateUrl: './product-general-step.component.html',
  styleUrl: './product-general-step.component.scss',
})
export class ProductGeneralStepComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly value = input.required<ProductGeneralDraft>();
  readonly valueChange = output<ProductGeneralDraft>();

  readonly categories = input<readonly string[]>([]);
  /** Codici IVA attivi per la tendina "Codice IVA" (dal parent smart). */
  readonly vatCodes = input<readonly VatCode[]>([]);
  readonly shopifyConnected = input(false);
  readonly catalogReadOnly = input(false);
  /** In creazione: campi secondari in sezione collassabile. */
  readonly compactLayout = input(false);
  /**
   * true = modifica di un articolo esistente: il codice articolo diventa
   * obbligatorio (in creazione può restare vuoto: il backend genera il
   * progressivo) e compare "Ripristina" dopo una cancellazione.
   */
  readonly editMode = input(false);
  /** Nome dell'articolo che già usa il codice digitato (verifica live dal parent). */
  readonly articleCodeTakenBy = input<string | null>(null);

  protected readonly statusSelectOptions: readonly SelectMenuOption[] = STATUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

  protected readonly uomSelectOptions: readonly SelectMenuOption[] = COMMON_UNIT_OF_MEASURE.map(
    (value) => ({ value, label: value }),
  );

  protected readonly vatSelectOptions = computed((): readonly SelectMenuOption[] => {
    const currentId = this.value().defaultVatCodeId;
    return this.vatCodes()
      .filter((entry) => entry.isActive || entry.id === currentId)
      .map((entry) => ({ value: entry.id, label: vatCodeOptionLabel(entry) }));
  });

  protected readonly trackingSelectOptions: readonly SelectMenuOption[] = (
    Object.values(InventoryTrackingMode) as InventoryTrackingMode[]
  ).map((value) => ({
    value,
    label: INVENTORY_TRACKING_LABELS[value],
  }));

  /** Tipo prodotto (Articolo/Servizio): solo VestiFlow, mai sincronizzato con Shopify. */
  protected readonly kindSelectOptions: readonly SelectMenuOption[] = (
    Object.values(ProductKind) as ProductKind[]
  ).map((value) => ({
    value,
    label: PRODUCT_KIND_LABELS[value],
  }));

  protected readonly customCategory = signal(false);
  protected readonly customSeason = signal(false);
  protected readonly taxonomyTouched = signal(false);

  protected readonly categorySelectOptions = computed((): readonly SelectMenuOption[] => {
    const values = this.withCurrent(this.categories(), this.categoryValue());
    const options = values.map((value) => ({ value, label: value }));
    if (this.categories().length > 0) {
      return [...options, { value: CUSTOM_OPTION_VALUE, label: 'Altra categoria…' }];
    }
    return options;
  });

  protected readonly seasonSelectOptions = computed((): readonly SelectMenuOption[] =>
    buildProductSeasonSelectOptions(this.seasonValue()),
  );

  protected readonly categorySelectValue = computed(() =>
    this.customCategory() ? CUSTOM_OPTION_VALUE : this.categoryValue(),
  );

  protected readonly seasonSelectValue = computed(() =>
    this.customSeason() ? PRODUCT_SEASON_CUSTOM_OPTION : this.seasonValue(),
  );

  protected readonly taxonomyInvalid = computed(
    () =>
      this.shopifyConnected() &&
      this.taxonomyTouched() &&
      !this.value().shopifyTaxonomyCategoryId.trim(),
  );

  private readonly categoryValue = signal('');
  private readonly seasonValue = signal('');

  protected readonly form = this.fb.group({
    // Primo campo dell'anagrafica (§POSIZIONE): identificatore principale.
    // `required` viene aggiunto in ngOnInit solo in modifica (in creazione
    // vuoto = progressivo generato dal backend).
    articleCode: this.fb.control('', [Validators.pattern(ARTICLE_CODE_PATTERN)]),
    name: this.fb.control('', [Validators.required]),
    brand: this.fb.control(''),
    category: this.fb.control(''),
    shopifyTaxonomyCategoryId: this.fb.control(''),
    shopifyTaxonomyCategoryFullName: this.fb.control(''),
    shopifyCategoryMetafields: this.fb.control<readonly ShopifyCategoryMetafieldValue[]>([]),
    season: this.fb.control(''),
    tags: this.fb.control(''),
    status: this.fb.control<ProductStatus>(ProductStatus.Draft),
    unitOfMeasure: this.fb.control('pz'),
    defaultVatCodeId: this.fb.control(''),
    inventoryTracking: this.fb.control<InventoryTrackingMode>(InventoryTrackingMode.Standard),
    managesStock: this.fb.control(true),
    kind: this.fb.control<ProductKind>(ProductKind.Article),
    description: this.fb.control(''),
  });

  private valueChangesSub: Subscription | null = null;

  /** Codice caricato all'apertura: base del "Ripristina" (§obbligatorio). */
  private initialArticleCode = '';

  constructor() {
    effect(() => {
      if (this.catalogReadOnly()) {
        this.form.disable({ emitEvent: false });
        this.form.controls.season.enable({ emitEvent: false });
        // Il codice articolo e' una proprieta' SOLO VestiFlow: resta
        // modificabile anche quando il catalogo e' gestito da Shopify.
        this.form.controls.articleCode.enable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const initial = this.value();
    this.initialArticleCode = normalizeArticleCode(initial.articleCode);
    if (this.editMode()) {
      this.form.controls.articleCode.addValidators(Validators.required);
      this.form.controls.articleCode.updateValueAndValidity({ emitEvent: false });
    }
    this.categoryValue.set(initial.category);
    this.seasonValue.set(initial.season);
    this.customCategory.set(this.shouldUseCustomField(initial.category, this.categories()));
    this.customSeason.set(initial.season.trim() !== '' && !isStandardProductSeason(initial.season));
    this.form.setValue(initial, { emitEvent: false });

    this.form.controls.category.valueChanges
      .pipe(startWith(initial.category), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.categoryValue.set(value));

    this.form.controls.season.valueChanges
      .pipe(startWith(initial.season), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.seasonValue.set(value));

    this.valueChangesSub = this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.valueChange.emit(this.form.getRawValue()));
  }

  protected showError(field: RequiredField): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  /**
   * Messaggio d'errore del codice articolo (vicino al campo, mai solo toast):
   * obbligatorio (in modifica), formato, unicità (verifica live dal parent).
   */
  protected articleCodeError(): string | null {
    const control = this.form.controls.articleCode;
    const value = control.value.trim();
    if (control.touched && control.hasError('required')) {
      return ARTICLE_CODE_REQUIRED_MESSAGE;
    }
    if (value && control.hasError('pattern')) {
      return ARTICLE_CODE_FORMAT_MESSAGE;
    }
    const takenBy = this.articleCodeTakenBy();
    if (value && takenBy) {
      return `Codice articolo già utilizzato da ${takenBy}.`;
    }
    return null;
  }

  /** Normalizzazione visiva §case-insensitive: al blur il codice va in MAIUSCOLO. */
  protected onArticleCodeBlur(): void {
    const control = this.form.controls.articleCode;
    const normalized = normalizeArticleCode(control.value);
    if (normalized !== control.value) {
      control.setValue(normalized);
    }
    control.markAsTouched();
  }

  /** Codice caricato all'apertura, mostrato sul pulsante "Ripristina". */
  protected initialArticleCodeValue(): string {
    return this.initialArticleCode;
  }

  /** "Ripristina" visibile quando il codice caricato e' stato cancellato/modificato. */
  protected canRestoreArticleCode(): boolean {
    if (!this.editMode() || !this.initialArticleCode) {
      return false;
    }
    return normalizeArticleCode(this.form.controls.articleCode.value) !== this.initialArticleCode;
  }

  /**
   * Riporta il codice a quello previsto prima della cancellazione (mai
   * rigenerato in silenzio: la scelta resta esplicita dell'operatore).
   */
  protected restoreArticleCode(): void {
    this.form.controls.articleCode.setValue(this.initialArticleCode);
    this.form.controls.articleCode.markAsTouched();
  }

  protected onStatusSelect(value: string | null): void {
    if (value) {
      this.form.controls.status.setValue(value as ProductStatus);
    }
  }

  protected onUomSelect(value: string | null): void {
    if (value) {
      this.form.controls.unitOfMeasure.setValue(value);
    }
  }

  protected onVatSelect(value: string | null): void {
    this.form.controls.defaultVatCodeId.setValue(value ?? '');
  }

  protected onTrackingSelect(value: string | null): void {
    if (value) {
      this.form.controls.inventoryTracking.setValue(value as InventoryTrackingMode);
    }
  }

  /**
   * Tipo Articolo/Servizio. Un Servizio non genera movimenti né conta in
   * giacenza: al passaggio si propongono gestione magazzino OFF e nessun
   * tracciamento (l'operatore può comunque modificarli).
   */
  protected onKindSelect(value: string | null): void {
    if (!value) {
      return;
    }
    const kind = value as ProductKind;
    this.form.controls.kind.setValue(kind);
    if (kind === ProductKind.Service) {
      this.form.controls.managesStock.setValue(false);
      this.form.controls.inventoryTracking.setValue(InventoryTrackingMode.None);
    } else {
      this.form.controls.managesStock.setValue(true);
      this.form.controls.inventoryTracking.setValue(InventoryTrackingMode.Standard);
    }
  }

  protected vatSelectValue(): string {
    return this.form.controls.defaultVatCodeId.value;
  }

  protected onCategorySelect(value: string | null): void {
    if (value === CUSTOM_OPTION_VALUE) {
      this.customCategory.set(true);
      this.form.controls.category.setValue('');
      this.form.controls.category.markAsTouched();
      return;
    }
    if (value) {
      this.customCategory.set(false);
      this.form.controls.category.setValue(value);
    }
  }

  protected onSeasonSelect(value: string | null): void {
    if (value === PRODUCT_SEASON_CUSTOM_OPTION) {
      this.customSeason.set(true);
      this.form.controls.season.setValue('');
      return;
    }
    if (value === null || value === '') {
      this.customSeason.set(false);
      this.form.controls.season.setValue('');
      return;
    }
    this.customSeason.set(false);
    this.form.controls.season.setValue(value);
  }

  protected onTaxonomyChange(selection: ShopifyTaxonomySelection | null): void {
    this.taxonomyTouched.set(true);
    const previousCategoryId = this.form.controls.shopifyTaxonomyCategoryId.value.trim();
    const nextCategoryId = selection?.id ?? '';
    this.form.patchValue({
      shopifyTaxonomyCategoryId: nextCategoryId,
      shopifyTaxonomyCategoryFullName: selection?.fullName ?? '',
      ...(previousCategoryId !== nextCategoryId
        ? { shopifyCategoryMetafields: [] as readonly ShopifyCategoryMetafieldValue[] }
        : {}),
    });
  }

  protected onCategoryMetafieldsChange(values: readonly ShopifyCategoryMetafieldValue[]): void {
    this.form.controls.shopifyCategoryMetafields.setValue(values);
  }

  protected categoryMetafieldsValue(): readonly ShopifyCategoryMetafieldValue[] {
    return this.form.controls.shopifyCategoryMetafields.value;
  }

  protected useCategorySelect(): boolean {
    return !this.shopifyConnected() && this.categories().length > 0 && !this.customCategory();
  }

  protected useSeasonSelect(): boolean {
    return !this.customSeason();
  }

  private withCurrent(list: readonly string[], current: string): readonly string[] {
    const value = current.trim();
    return value && !list.includes(value) ? [value, ...list] : list;
  }

  private shouldUseCustomField(value: string, facets: readonly string[]): boolean {
    if (facets.length === 0) {
      return true;
    }
    const trimmed = value.trim();
    return trimmed !== '' && !facets.includes(trimmed);
  }
}
