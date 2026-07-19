import {
  ChangeDetectionStrategy,
  Component,
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
import { catchError, of, take } from 'rxjs';
import type { Subscription } from 'rxjs';

import { ButtonComponent } from '@shared/components/button/button.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';

import { generateDistinctEan13Barcode } from '../../models/barcode.util';
import type { VariantDraft } from '../../models/product-form.model';
import {
  isBarcodeDistinct,
  normalizeBarcode,
  normalizeSku,
  SKU_PATTERN,
} from '../../models/product-form.validators';
import { ProductService } from '../../services/product.service';

/** Avviso mostrato prima di sovrascrivere uno SKU già presente nel campo. */
const OVERWRITE_SKU_WARNING =
  "Stai per sostituire lo SKU attuale. Se l'articolo ha già movimenti o documenti registrati, " +
  'lo SKU storico resterà comunque quello usato in quei documenti. Continuare?';

@Component({
  selector: 'app-product-quick-variant-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, HoverTooltipComponent, ReactiveFormsModule],
  templateUrl: './product-quick-variant-fields.component.html',
  styleUrl: './product-quick-variant-fields.component.scss',
})
export class ProductQuickVariantFieldsComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productService = inject(ProductService);

  readonly variant = input.required<VariantDraft>();
  /** Nome e categoria correnti del prodotto: input per "Genera SKU". */
  readonly productName = input('');
  readonly category = input('');
  readonly takenSkus = input<readonly string[]>([]);
  readonly takenBarcodes = input<readonly string[]>([]);
  readonly disabled = input(false);
  /**
   * Mostra il campo Costo (prezzo di acquisto). Permesso
   * catalog.view_purchase_costs: senza, il campo resta nascosto e il valore
   * esistente non viene mai toccato dall'emit.
   */
  readonly canSeeCosts = input(false);

  readonly variantChange = output<VariantDraft>();
  readonly validChange = output<boolean>();

  protected readonly form = this.fb.group({
    // Facoltativo (specifica cliente §SKU): nessun Validators.required. Se
    // valorizzato deve comunque rispettare il formato.
    sku: this.fb.control('', { validators: [Validators.pattern(SKU_PATTERN)] }),
    barcode: this.fb.control(''),
    sellingPrice: this.fb.control(0, { validators: [Validators.required, Validators.min(0)] }),
    compareAtPrice: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    purchasePrice: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
  });

  protected readonly generatingSku = signal(false);
  protected readonly generateSkuError = signal<string | null>(null);

  private valueChangesSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const variant = this.variant();
      this.form.patchValue(
        {
          sku: variant.sku,
          barcode: variant.barcode,
          sellingPrice: variant.sellingPrice ?? 0,
          purchasePrice: variant.purchasePrice,
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
    // Seed sincrono dal draft corrente: l'effect di sync nel costruttore
    // viene flushato solo DOPO il primo change detection, ma emitState()
    // parte già qui. Senza seed il primo emit rifletterebbe il form vuoto e
    // cancellerebbe nel parent i prefill di SKU/EAN/prezzo (es. «Crea
    // articolo rapido» dalla cassa con EAN scansionato).
    const variant = this.variant();
    this.form.patchValue(
      {
        sku: variant.sku,
        barcode: variant.barcode,
        sellingPrice: variant.sellingPrice ?? 0,
        compareAtPrice: variant.compareAtPrice,
        purchasePrice: variant.purchasePrice,
      },
      { emitEvent: false },
    );

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

  protected generateBarcode(): void {
    const raw = this.form.getRawValue();
    const barcode = generateDistinctEan13Barcode(raw.sku, raw.barcode, ...this.takenBarcodes());
    this.form.controls.barcode.setValue(barcode);
    this.form.controls.barcode.markAsDirty();
    this.form.controls.barcode.markAsTouched();
  }

  /**
   * Genera un'anteprima SKU prevedibile (categoria + nome + progressivo,
   * vedi backend `SkuGeneratorService`) e la propone nel campo, editabile
   * prima del salvataggio. Se il campo ha già un valore, chiede conferma
   * prima di sovrascriverlo (specifica cliente §SKU: mai in automatico).
   */
  protected generateSku(): void {
    const current = this.form.controls.sku.value.trim();
    if (current && !window.confirm(OVERWRITE_SKU_WARNING)) {
      return;
    }

    this.generateSkuError.set(null);
    this.generatingSku.set(true);
    this.productService
      .generateSku({ productName: this.productName(), category: this.category() || undefined })
      .pipe(
        take(1),
        catchError(() => {
          this.generateSkuError.set('Impossibile generare lo SKU: riprova o inseriscilo a mano.');
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.generatingSku.set(false);
        if (!result) {
          return;
        }
        this.form.controls.sku.setValue(result.sku);
        this.form.controls.sku.markAsDirty();
        this.form.controls.sku.markAsTouched();
      });
  }

  private emitState(): void {
    const raw = this.form.getRawValue();
    this.variantChange.emit({
      ...this.variant(),
      sku: raw.sku,
      barcode: raw.barcode,
      sellingPrice: raw.sellingPrice,
      compareAtPrice: raw.compareAtPrice,
      // Senza permesso costi il campo è nascosto: il valore esistente resta.
      ...(this.canSeeCosts() ? { purchasePrice: raw.purchasePrice } : {}),
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
