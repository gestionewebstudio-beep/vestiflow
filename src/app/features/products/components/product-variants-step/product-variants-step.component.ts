import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Subscription } from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import type { SelectedOption } from '@core/models/product.model';

import { ButtonComponent } from '@shared/components/button/button.component';

import type { VariantDraft } from '../../models/product-form.model';
import { generateDistinctEan13Barcode } from '../../models/barcode.util';
import type { CompareAtError } from '../../models/product-form.validators';
import {
  compareAtPriceError,
  isBarcodeDistinct,
  normalizeSku,
  SKU_PATTERN,
} from '../../models/product-form.validators';
import {
  selectedOptionValue,
  variantOptionNames,
  variantTitle,
} from '../../models/product-variant.util';

interface VariantRowControls {
  sku: FormControl<string>;
  sellingPrice: FormControl<number>;
  purchasePrice: FormControl<number | null>;
  compareAtPrice: FormControl<number | null>;
  barcode: FormControl<string>;
}

// Dati non editabili della riga (identita' della combinazione), tenuti fuori dal
// form e riallineati per indice ai controlli editabili.
interface VariantRowMeta {
  readonly key: string;
  readonly id?: EntityId;
  readonly optionValues: readonly SelectedOption[];
}

const EMPTY_META: VariantRowMeta = { key: '', optionValues: [] };

/**
 * Step "Varianti" del wizard (presentazionale con FormArray tipizzato). Espone
 * i campi editabili per variante (SKU, prezzi, barcode) e propaga le modifiche
 * via `variantsChange`. Taglia/colore/identita' restano fissi (derivati dalle
 * opzioni). Il FormArray viene ricostruito solo quando cambia l'insieme delle
 * combinazioni, cosi' le modifiche dell'utente sui campi non vengono perse.
 */
@Component({
  selector: 'app-product-variants-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ReactiveFormsModule],
  templateUrl: './product-variants-step.component.html',
  styleUrl: './product-variants-step.component.scss',
})
export class ProductVariantsStepComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly variants = input.required<readonly VariantDraft[]>();
  /** SKU gia' in uso (normalizzati) dal controllo di disponibilita' del wizard. */
  readonly takenSkus = input<readonly string[]>([]);
  readonly variantsChange = output<readonly VariantDraft[]>();
  /**
   * Validità complessiva dello step (formato SKU/prezzi/barcode + regola
   * compareAtPrice). Il parent la include nel gating del wizard.
   */
  readonly stepValidChange = output<boolean>();

  private readonly takenSet = computed(() => new Set(this.takenSkus()));

  protected readonly form = this.fb.group({
    variants: this.fb.array<FormGroup<VariantRowControls>>([]),
  });

  protected readonly rowsMeta = signal<readonly VariantRowMeta[]>([]);

  // Firma dell'insieme di combinazioni attualmente nel form (chiavi ordinate).
  private seededKeys = '';
  // Evita emissioni mentre ricostruiamo il form (clear/push).
  private suppressEmit = false;
  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private valueChangesSub: Subscription;

  constructor() {
    effect(() => {
      const variants = this.variants();
      const keys = variants.map((variant) => variant.key).join('|');
      if (keys !== this.seededKeys) {
        this.seed(variants);
        this.seededKeys = keys;
      }
    });

    this.valueChangesSub = this.variantsArray.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.suppressEmit) {
          this.variantsChange.emit(this.collect());
          this.emitValidity();
        }
      });
  }

  protected get variantsArray() {
    return this.form.controls.variants;
  }

  /** Colonne opzione dinamiche in base agli assi attivi nelle varianti. */
  protected readonly optionNames = computed(() => variantOptionNames(this.variants()));

  protected meta(index: number): VariantRowMeta {
    return this.rowsMeta()[index] ?? EMPTY_META;
  }

  /** Valore della riga per l'asse indicato (derivato dalle optionValues). */
  protected metaValue(index: number, name: string): string {
    return selectedOptionValue(this.meta(index).optionValues, name);
  }

  /** Titolo della combinazione per le aria-label (es. "M / Rosso"). */
  protected rowTitle(index: number): string {
    return variantTitle(this.meta(index).optionValues) || '—';
  }

  /** True se lo SKU corrente risulta gia' in uso da un altro prodotto. */
  protected isSkuTaken(sku: string): boolean {
    const normalized = normalizeSku(sku);
    return normalized.length > 0 && this.takenSet().has(normalized);
  }

  private seed(variants: readonly VariantDraft[]): void {
    this.suppressEmit = true;
    this.variantsArray.clear({ emitEvent: false });
    const meta: VariantRowMeta[] = [];
    for (const variant of variants) {
      this.variantsArray.push(this.buildRow(variant), { emitEvent: false });
      meta.push({ key: variant.key, id: variant.id, optionValues: variant.optionValues });
    }
    this.rowsMeta.set(meta);
    this.suppressEmit = false;
    this.emitValidity();
  }

  private buildRow(variant: VariantDraft): FormGroup<VariantRowControls> {
    return this.fb.group<VariantRowControls>({
      sku: this.fb.control(variant.sku, [Validators.required, Validators.pattern(SKU_PATTERN)]),
      sellingPrice: this.fb.control(variant.sellingPrice, [Validators.required, Validators.min(0)]),
      purchasePrice: this.fb.control<number | null>(variant.purchasePrice, [Validators.min(0)]),
      compareAtPrice: this.fb.control<number | null>(variant.compareAtPrice, [Validators.min(0)]),
      barcode: this.fb.control(variant.barcode),
    });
  }

  /** Errore di formato del controllo, mostrato solo dopo interazione (touched). */
  protected isInvalid(
    group: FormGroup<VariantRowControls>,
    field: keyof VariantRowControls,
  ): boolean {
    const control = group.controls[field];
    return control.invalid && control.touched;
  }

  /** SKU duplicato tra le varianti del form (case-insensitive). */
  protected isDuplicateSku(sku: string): boolean {
    const normalized = normalizeSku(sku);
    if (!normalized) {
      return false;
    }
    let count = 0;
    for (const group of this.variantsArray.controls) {
      if (normalizeSku(group.controls.sku.value) === normalized) {
        count += 1;
      }
    }
    return count > 1;
  }

  /** Barcode valorizzato ma uguale allo SKU (devono essere distinti). */
  protected isBarcodeInvalid(group: FormGroup<VariantRowControls>): boolean {
    return !isBarcodeDistinct(group.controls.sku.value, group.controls.barcode.value);
  }

  /** Genera un barcode EAN-13 (13 cifre) distinto dallo SKU della riga. */
  protected generateBarcode(index: number): void {
    const group = this.variantsArray.at(index);
    if (!group) {
      return;
    }

    const barcode = generateDistinctEan13Barcode(group.controls.sku.value);
    group.controls.barcode.setValue(barcode);
    group.controls.barcode.markAsDirty();
    group.controls.barcode.markAsTouched();
  }

  /** Esito della regola compareAtPrice per la riga (delegata all'helper puro). */
  protected compareAtError(group: FormGroup<VariantRowControls>): CompareAtError {
    return compareAtPriceError(
      group.controls.sellingPrice.value,
      group.controls.compareAtPrice.value,
    );
  }

  /** Mostra l'errore compareAtPrice solo dopo interazione (touched). */
  protected isCompareAtInvalid(group: FormGroup<VariantRowControls>): boolean {
    return this.compareAtError(group) !== null && group.controls.compareAtPrice.touched;
  }

  private emitValidity(): void {
    const valid =
      this.variantsArray.valid &&
      this.variantsArray.controls.every((group) => this.compareAtError(group) === null);
    this.stepValidChange.emit(valid);
  }

  private collect(): readonly VariantDraft[] {
    const meta = this.rowsMeta();
    const result: VariantDraft[] = [];
    this.variantsArray.controls.forEach((group, index) => {
      const rowMeta = meta[index];
      if (!rowMeta) {
        return;
      }
      const raw = group.getRawValue();
      result.push({
        key: rowMeta.key,
        id: rowMeta.id,
        optionValues: rowMeta.optionValues,
        sku: raw.sku,
        sellingPrice: raw.sellingPrice,
        purchasePrice: raw.purchasePrice,
        compareAtPrice: raw.compareAtPrice,
        barcode: raw.barcode,
        included: true,
      });
    });
    return result;
  }
}
