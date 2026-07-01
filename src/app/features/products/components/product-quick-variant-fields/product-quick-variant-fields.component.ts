import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Subscription } from 'rxjs';

import { ButtonComponent } from '@shared/components/button/button.component';

import { generateDistinctEan13Barcode } from '../../models/barcode.util';
import type { VariantDraft } from '../../models/product-form.model';
import {
  isBarcodeDistinct,
  normalizeBarcode,
  normalizeSku,
  SKU_PATTERN,
} from '../../models/product-form.validators';

@Component({
  selector: 'app-product-quick-variant-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ReactiveFormsModule],
  templateUrl: './product-quick-variant-fields.component.html',
  styleUrl: './product-quick-variant-fields.component.scss',
})
export class ProductQuickVariantFieldsComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly variant = input.required<VariantDraft>();
  readonly takenSkus = input<readonly string[]>([]);
  readonly takenBarcodes = input<readonly string[]>([]);
  readonly disabled = input(false);

  readonly variantChange = output<VariantDraft>();
  readonly skuEdited = output<void>();
  readonly validChange = output<boolean>();

  protected readonly form = this.fb.group({
    sku: this.fb.control('', {
      validators: [Validators.required, Validators.pattern(SKU_PATTERN)],
    }),
    barcode: this.fb.control(''),
    sellingPrice: this.fb.control(0, { validators: [Validators.required, Validators.min(0)] }),
  });

  private valueChangesSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const variant = this.variant();
      this.form.patchValue(
        {
          sku: variant.sku,
          barcode: variant.barcode,
          sellingPrice: variant.sellingPrice ?? 0,
        },
        { emitEvent: false },
      );
    });

    effect(() => {
      if (this.disabled()) {
        this.form.disable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.valueChangesSub = this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.emitState());

    this.emitState();
  }

  protected showSkuError(): boolean {
    const control = this.form.controls.sku;
    return control.invalid && control.touched;
  }

  protected showPriceError(): boolean {
    const control = this.form.controls.sellingPrice;
    return control.invalid && control.touched;
  }

  protected showBarcodeSameAsSku(): boolean {
    const raw = this.form.getRawValue();
    return (
      raw.barcode.trim() !== '' &&
      !isBarcodeDistinct(raw.sku, raw.barcode) &&
      this.form.controls.barcode.touched
    );
  }

  protected isSkuTaken(sku: string): boolean {
    const normalized = normalizeSku(sku);
    return normalized.length > 0 && this.takenSkus().includes(normalized);
  }

  protected isBarcodeTaken(barcode: string): boolean {
    const normalized = normalizeBarcode(barcode);
    return normalized.length > 0 && this.takenBarcodes().includes(normalized);
  }

  protected onSkuInput(): void {
    this.skuEdited.emit();
  }

  protected generateBarcode(): void {
    const raw = this.form.getRawValue();
    const barcode = generateDistinctEan13Barcode(raw.sku, raw.barcode, ...this.takenBarcodes());
    this.form.controls.barcode.setValue(barcode);
    this.form.controls.barcode.markAsDirty();
    this.form.controls.barcode.markAsTouched();
  }

  private emitState(): void {
    const raw = this.form.getRawValue();
    this.variantChange.emit({
      ...this.variant(),
      sku: raw.sku,
      barcode: raw.barcode,
      sellingPrice: raw.sellingPrice,
    });
    this.validChange.emit(this.isFormValid());
  }

  private isFormValid(): boolean {
    const raw = this.form.getRawValue();
    if (!this.form.valid || this.isSkuTaken(raw.sku)) {
      return false;
    }
    const barcode = raw.barcode.trim();
    if (!barcode) {
      return true;
    }
    return isBarcodeDistinct(raw.sku, barcode) && !this.isBarcodeTaken(barcode);
  }
}
