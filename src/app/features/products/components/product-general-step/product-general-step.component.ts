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

import { ProductStatus } from '@core/models/product.model';
import type { ShopifyCategoryMetafieldValue } from '@core/models/shopify-category-metafield.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import {
  COMMON_UNIT_OF_MEASURE,
  COMMON_VAT_RATES,
  INVENTORY_TRACKING_LABELS,
  InventoryTrackingMode,
} from '@core/models/product-catalog.model';

import type { ProductGeneralDraft } from '../../models/product-form.model';
import {
  buildProductSeasonSelectOptions,
  isStandardProductSeason,
  PRODUCT_SEASON_CUSTOM_OPTION,
} from '../../models/product-season.options';
import { productStatusLabel } from '../../models/product-status.util';
import { ShopifyCategoryAttributesComponent } from '../shopify-category-attributes/shopify-category-attributes.component';
import type { ShopifyTaxonomySelection } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';
import { ShopifyTaxonomyPickerComponent } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';

type RequiredField = 'name' | 'brand' | 'category';

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
  readonly shopifyConnected = input(false);
  readonly catalogReadOnly = input(false);

  protected readonly statusSelectOptions: readonly SelectMenuOption[] = STATUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

  protected readonly uomSelectOptions: readonly SelectMenuOption[] = COMMON_UNIT_OF_MEASURE.map(
    (value) => ({ value, label: value }),
  );

  protected readonly vatSelectOptions: readonly SelectMenuOption[] = COMMON_VAT_RATES.map(
    (value) => ({ value: String(value), label: `${value}%` }),
  );

  protected readonly trackingSelectOptions: readonly SelectMenuOption[] = (
    Object.values(InventoryTrackingMode) as InventoryTrackingMode[]
  ).map((value) => ({
    value,
    label: INVENTORY_TRACKING_LABELS[value],
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
    name: this.fb.control('', [Validators.required]),
    brand: this.fb.control('', [Validators.required]),
    category: this.fb.control(''),
    shopifyTaxonomyCategoryId: this.fb.control(''),
    shopifyTaxonomyCategoryFullName: this.fb.control(''),
    shopifyCategoryMetafields: this.fb.control<readonly ShopifyCategoryMetafieldValue[]>([]),
    season: this.fb.control(''),
    tags: this.fb.control(''),
    status: this.fb.control<ProductStatus>(ProductStatus.Draft),
    unitOfMeasure: this.fb.control('pz'),
    defaultVatRatePercent: this.fb.control<number | null>(22),
    inventoryTracking: this.fb.control<InventoryTrackingMode>(InventoryTrackingMode.Standard),
    managesStock: this.fb.control(true),
    description: this.fb.control(''),
  });

  private valueChangesSub: Subscription | null = null;

  constructor() {
    effect(() => {
      if (this.catalogReadOnly()) {
        this.form.disable({ emitEvent: false });
        this.form.controls.season.enable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });

    effect(() => {
      const control = this.form.controls.category;
      if (this.shopifyConnected()) {
        control.clearValidators();
      } else {
        control.setValidators([Validators.required]);
      }
      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    const initial = this.value();
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
    this.form.controls.defaultVatRatePercent.setValue(value ? Number(value) : null);
  }

  protected onTrackingSelect(value: string | null): void {
    if (value) {
      this.form.controls.inventoryTracking.setValue(value as InventoryTrackingMode);
    }
  }

  protected vatSelectValue(): string {
    const value = this.form.controls.defaultVatRatePercent.value;
    return value == null ? '' : String(value);
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
