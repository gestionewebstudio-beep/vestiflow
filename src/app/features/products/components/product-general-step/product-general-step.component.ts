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
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { ProductGeneralDraft } from '../../models/product-form.model';
import { productStatusLabel } from '../../models/product-status.util';
import type { ShopifyTaxonomySelection } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';
import { ShopifyTaxonomyPickerComponent } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';

type RequiredField = 'name' | 'brand' | 'category' | 'season';

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
  imports: [ReactiveFormsModule, SelectMenuComponent, ShopifyTaxonomyPickerComponent],
  templateUrl: './product-general-step.component.html',
  styleUrl: './product-general-step.component.scss',
})
export class ProductGeneralStepComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly value = input.required<ProductGeneralDraft>();
  readonly valueChange = output<ProductGeneralDraft>();

  readonly categories = input<readonly string[]>([]);
  readonly seasons = input<readonly string[]>([]);
  readonly shopifyConnected = input(false);

  protected readonly statusSelectOptions: readonly SelectMenuOption[] = STATUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

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

  protected readonly seasonSelectOptions = computed((): readonly SelectMenuOption[] => {
    const values = this.withCurrent(this.seasons(), this.seasonValue());
    const options = values.map((value) => ({ value, label: value }));
    if (this.seasons().length > 0) {
      return [...options, { value: CUSTOM_OPTION_VALUE, label: 'Altra stagione…' }];
    }
    return options;
  });

  protected readonly categorySelectValue = computed(() =>
    this.customCategory() ? CUSTOM_OPTION_VALUE : this.categoryValue(),
  );

  protected readonly seasonSelectValue = computed(() =>
    this.customSeason() ? CUSTOM_OPTION_VALUE : this.seasonValue(),
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
    season: this.fb.control('', [Validators.required]),
    tags: this.fb.control(''),
    status: this.fb.control<ProductStatus>(ProductStatus.Draft),
    description: this.fb.control(''),
  });

  private valueChangesSub: Subscription | null = null;

  constructor() {
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
    this.customSeason.set(this.shouldUseCustomField(initial.season, this.seasons()));
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
    if (value === CUSTOM_OPTION_VALUE) {
      this.customSeason.set(true);
      this.form.controls.season.setValue('');
      this.form.controls.season.markAsTouched();
      return;
    }
    if (value) {
      this.customSeason.set(false);
      this.form.controls.season.setValue(value);
    }
  }

  protected onTaxonomyChange(selection: ShopifyTaxonomySelection | null): void {
    this.taxonomyTouched.set(true);
    this.form.patchValue({
      shopifyTaxonomyCategoryId: selection?.id ?? '',
      shopifyTaxonomyCategoryFullName: selection?.fullName ?? '',
    });
  }

  protected useCategorySelect(): boolean {
    return !this.shopifyConnected() && this.categories().length > 0 && !this.customCategory();
  }

  protected useSeasonSelect(): boolean {
    return this.seasons().length > 0 && !this.customSeason();
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
