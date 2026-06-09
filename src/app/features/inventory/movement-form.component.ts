import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';
import { ButtonComponent } from '@shared/components/button/button.component';

import { ProductService } from '@features/products/services/product.service';

import { InventoryService } from './services/inventory.service';
import type { RegisterMovementInput } from './services/inventory.service';

/** Tipi registrabili manualmente (vendite/resi arrivano da POS/Shopify). */
const MANUAL_TYPES = [
  { value: StockMovementType.Load, label: 'Carico' },
  { value: StockMovementType.Unload, label: 'Scarico' },
  { value: StockMovementType.Adjustment, label: 'Rettifica' },
  { value: StockMovementType.Transfer, label: 'Trasferimento' },
] as const;

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Registrazione movimento di magazzino (smart). Azione sensibile: flusso in
 * due fasi (compila -> riepilogo con impatto atteso -> conferma), motivo
 * obbligatorio per le rettifiche, origine/destinazione esplicite per i
 * trasferimenti (regole-gestionale).
 */
@Component({
  selector: 'app-movement-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './movement-form.component.html',
  styleUrl: './movement-form.component.scss',
})
export class MovementFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly typeOptions = MANUAL_TYPES;
  protected readonly MovementType = StockMovementType;
  protected readonly Direction = AdjustmentDirection;

  protected readonly variants = toSignal(this.productService.getVariantSummaries(), {
    initialValue: [],
  });
  protected readonly locations = toSignal(this.inventoryService.getLocations(), {
    initialValue: [],
  });

  readonly form = this.fb.group({
    type: this.fb.control<StockMovementType>(StockMovementType.Load, {
      validators: [Validators.required],
    }),
    variantId: this.fb.control('', { validators: [Validators.required] }),
    locationId: this.fb.control('', { validators: [Validators.required] }),
    targetLocationId: this.fb.control(''),
    quantity: this.fb.control(1, {
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    }),
    direction: this.fb.control<AdjustmentDirection>(AdjustmentDirection.Decrease),
    reason: this.fb.control(''),
  });

  // Tipo corrente come signal (guida campi condizionali e validator dinamici).
  private readonly typeValue = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });

  protected readonly isAdjustment = computed(
    () => this.typeValue() === StockMovementType.Adjustment,
  );
  protected readonly isTransfer = computed(() => this.typeValue() === StockMovementType.Transfer);

  /** Giacenze correnti della variante selezionata (per l'impatto atteso). */
  private readonly variantLevels = toSignal(
    this.form.controls.variantId.valueChanges.pipe(
      switchMap((variantId) =>
        variantId
          ? this.inventoryService.getLevelsByVariant(variantId)
          : of([] as readonly InventoryLevel[]),
      ),
    ),
    { initialValue: [] as readonly InventoryLevel[] },
  );

  // Fase del flusso: edit -> review -> (submit).
  private readonly _phase = signal<'edit' | 'review'>('edit');
  protected readonly phase = this._phase.asReadonly();

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly submitState = this._submitState.asReadonly();
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  // Validator dinamici per tipo (reason/target/direction richiesti a contesto).
  private readonly typeSubscription: Subscription = this.form.controls.type.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((type) => this.applyConditionalValidators(type));

  /** Riepilogo per la fase di conferma (snapshot leggibile + impatto atteso). */
  protected readonly review = computed(() => {
    const raw = this.form.getRawValue();
    const variant = this.variants().find((candidate) => candidate.variantId === raw.variantId);
    const locationName = this.locationName(raw.locationId);
    const targetName = this.locationName(raw.targetLocationId);
    const qty = Number(raw.quantity);

    const originBefore = this.availableAt(raw.locationId);
    const originDelta = this.originDelta(raw.type, raw.direction, qty);
    const originAfter = originBefore + originDelta;

    const targetBefore = this.availableAt(raw.targetLocationId);
    const targetAfter = targetBefore + qty;

    return {
      typeLabel: MANUAL_TYPES.find((option) => option.value === raw.type)?.label ?? raw.type,
      variantTitle: variant?.title ?? raw.variantId,
      sku: variant?.sku ?? '',
      locationName,
      targetName,
      quantity: qty,
      isTransfer: raw.type === StockMovementType.Transfer,
      isAdjustment: raw.type === StockMovementType.Adjustment,
      directionLabel: raw.direction === AdjustmentDirection.Decrease ? 'Diminuzione' : 'Aumento',
      reason: raw.reason.trim(),
      originBefore,
      originAfter,
      targetBefore,
      targetAfter,
      originGoesNegative: originAfter < 0,
    };
  });

  protected fieldInvalid(
    name: 'variantId' | 'locationId' | 'targetLocationId' | 'quantity' | 'reason',
  ): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected toReview(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this._submitState.set({ status: 'idle' });
    this._phase.set('review');
  }

  protected backToEdit(): void {
    this._phase.set('edit');
  }

  private submitSubscription: Subscription | null = null;

  protected confirm(): void {
    if (this.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    const variant = this.variants().find((candidate) => candidate.variantId === raw.variantId);
    const user = this.authService.currentUser();

    const input: RegisterMovementInput = {
      type: raw.type,
      variantId: raw.variantId,
      sku: variant?.sku ?? raw.variantId,
      locationId: raw.locationId,
      targetLocationId: raw.type === StockMovementType.Transfer ? raw.targetLocationId : undefined,
      quantity: Number(raw.quantity),
      direction: raw.type === StockMovementType.Adjustment ? raw.direction : undefined,
      reason: raw.reason.trim() || undefined,
      createdBy: user?.id ?? 'unknown',
      createdByName: user?.displayName ?? 'Sconosciuto',
    };

    this._submitState.set({ status: 'saving' });
    this.submitSubscription = this.inventoryService
      .registerMovement(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/app/inventory/movements');
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/app/inventory');
  }

  private applyConditionalValidators(type: StockMovementType): void {
    const { reason, targetLocationId } = this.form.controls;
    if (type === StockMovementType.Adjustment) {
      reason.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      reason.clearValidators();
    }
    if (type === StockMovementType.Transfer) {
      targetLocationId.setValidators([Validators.required]);
    } else {
      targetLocationId.clearValidators();
    }
    reason.updateValueAndValidity();
    targetLocationId.updateValueAndValidity();
  }

  private locationName(id: string): string {
    return this.locations().find((candidate) => candidate.id === id)?.name ?? '';
  }

  private availableAt(locationId: string): number {
    if (!locationId) {
      return 0;
    }
    return this.variantLevels().find((level) => level.locationId === locationId)?.available ?? 0;
  }

  private originDelta(
    type: StockMovementType,
    direction: AdjustmentDirection,
    qty: number,
  ): number {
    switch (type) {
      case StockMovementType.Load:
        return qty;
      case StockMovementType.Unload:
      case StockMovementType.Transfer:
        return -qty;
      case StockMovementType.Adjustment:
        return direction === AdjustmentDirection.Decrease ? -qty : qty;
      default:
        return 0;
    }
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
