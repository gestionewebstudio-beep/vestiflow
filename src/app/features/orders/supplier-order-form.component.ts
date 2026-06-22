import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type { Subscription } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  zeroMoney,
} from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductService } from '@features/products/services/product.service';
import { InventoryService } from '@features/inventory/services/inventory.service';

import { SupplierOrderService } from './services/supplier-order.service';
import { SupplierService } from './services/supplier.service';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Creazione ordine fornitore (smart). Righe dinamiche (variante + quantità +
 * costo unitario), totale calcolato a video, salvataggio come bozza o invio
 * diretto. Owner: gestionale (CRUD locale). Creazione fornitore inline.
 */
@Component({
  selector: 'app-supplier-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './supplier-order-form.component.html',
  styleUrl: './supplier-order-form.component.scss',
})
export class SupplierOrderFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly orderService = inject(SupplierOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/orders';
  protected readonly currency = DEFAULT_CURRENCY;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({
    id: this.editOrderId(),
    tick: this.loadTick(),
  }));

  private readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.orderService.getSupplierOrderById(id).pipe(
          map((order) => {
            if (order.status !== SupplierOrderStatus.Draft) {
              return 'not-found' as const;
            }
            this.patchFormFromOrder(order);
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-found' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editOrderId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-found');

  private readonly suppliersReload = signal(0);
  private readonly suppliers = toSignal(
    toObservable(this.suppliersReload).pipe(switchMap(() => this.supplierService.getSuppliers())),
    { initialValue: [] },
  );
  protected readonly hasSuppliers = computed(() => this.suppliers().length > 0);
  protected readonly supplierOptions = computed<readonly SelectMenuOption[]>(() =>
    this.suppliers().map((supplier) => ({ value: supplier.id, label: supplier.name })),
  );

  private readonly variants = toSignal(this.productService.getVariantSummaries(), {
    initialValue: [],
  });
  protected readonly variantOptions = computed<readonly SelectMenuOption[]>(() =>
    this.variants().map((variant) => ({
      value: variant.variantId,
      label: `${variant.title} (${variant.sku})`,
    })),
  );

  private readonly locations = toSignal(this.inventoryService.getLocations(), {
    initialValue: [],
  });
  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.locations().map((location) => ({ value: location.id, label: location.name })),
  );

  readonly form = this.fb.group({
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    destinationLocationId: this.fb.control('', { validators: [Validators.required] }),
    expectedAt: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  protected get lines(): FormArray<ReturnType<SupplierOrderFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  // Snapshot reattivo del form per il totale a video.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly orderTotal = computed<Money>(() => {
    // Dipende dal valore corrente del form.
    this.formValue();
    return this.lines.controls.reduce<Money>((acc, line) => {
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      const qty = Number(line.controls.orderedQuantity.value);
      const amount = cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
      return { amountMinor: acc.amountMinor + amount, currencyCode: this.currency };
    }, zeroMoney(this.currency));
  });

  protected readonly formatMoney = formatMoney;

  // Creazione fornitore inline.
  protected readonly showSupplierForm = signal(false);
  readonly supplierForm = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.minLength(1)] }),
    email: this.fb.control('', { validators: [Validators.email] }),
    phone: this.fb.control(''),
  });
  private readonly _savingSupplier = signal(false);
  protected readonly savingSupplier = this._savingSupplier.asReadonly();

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private supplierSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  protected lineMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qty = Number(line.controls.orderedQuantity.value);
    const amount = cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
    return { amountMinor: amount, currencyCode: this.currency };
  }

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.destinationLocationId.setValue(value ?? '');
    this.form.controls.destinationLocationId.markAsTouched();
  }

  protected onVariantSelect(index: number, value: string | null): void {
    const control = this.lines.at(index).controls.variantId;
    control.setValue(value ?? '');
    control.markAsTouched();
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
    }
  }

  protected fieldInvalid(name: 'supplierId' | 'destinationLocationId'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected lineFieldInvalid(index: number, name: 'variantId' | 'orderedQuantity'): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected unitCostInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.unitCost;
    const touched = control.touched || control.dirty;
    if (!touched) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return control.invalid || parsed === null || parsed.amountMinor < 0;
  }

  protected toggleSupplierForm(): void {
    this.showSupplierForm.update((open) => !open);
  }

  protected saveSupplier(): void {
    if (this.supplierForm.invalid || this._savingSupplier()) {
      this.supplierForm.markAllAsTouched();
      return;
    }
    const raw = this.supplierForm.getRawValue();
    this._savingSupplier.set(true);
    this.supplierSubscription = this.supplierService
      .createSupplier({
        name: raw.name.trim(),
        email: raw.email.trim() || undefined,
        phone: raw.phone.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (supplier) => {
          this._savingSupplier.set(false);
          this.showSupplierForm.set(false);
          this.supplierForm.reset();
          this.suppliersReload.update((tick) => tick + 1);
          this.form.controls.supplierId.setValue(supplier.id);
        },
        error: (err: unknown) => {
          this._savingSupplier.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected submit(status: SupplierOrderStatus): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid || this.hasInvalidCost()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const lines = raw.lines.map((line) => {
      const cost = parseMoneyInput(line.unitCost, this.currency);
      return {
        variantId: line.variantId,
        orderedQuantity: Number(line.orderedQuantity),
        unitCostMinor: cost?.amountMinor ?? 0,
      };
    });

    const body = {
      supplierId: raw.supplierId,
      destinationLocationId: raw.destinationLocationId,
      currency: this.currency,
      expectedAt: raw.expectedAt ? new Date(raw.expectedAt).toISOString() : undefined,
      lines,
    };

    const editId = this.editOrderId();
    this._submitState.set({ status: 'saving' });

    const save$ = editId
      ? this.orderService.updateOrder(editId, body)
      : this.orderService.createOrder({ ...body, status });

    const request$ =
      editId && status === SupplierOrderStatus.Sent
        ? save$.pipe(switchMap((order) => this.orderService.sendOrder(order.id)))
        : save$;

    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        void this.router.navigate([this.listPath, order.id]);
      },
      error: (err: unknown) => {
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  private patchFormFromOrder(order: SupplierOrder): void {
    this.form.patchValue({
      supplierId: order.supplierId,
      destinationLocationId: order.destinationLocationId,
      expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : '',
    });
    this.lines.clear();
    for (const line of order.lines) {
      this.lines.push(
        this.fb.group({
          variantId: this.fb.control(line.variantId, { validators: [Validators.required] }),
          orderedQuantity: this.fb.control(line.orderedQuantity, {
            validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
          }),
          unitCost: this.fb.control(moneyToDecimalString(line.unitCost).replace('.', ','), {
            validators: [Validators.required],
          }),
        }),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
  }

  protected saveDraft(): void {
    this.submit(SupplierOrderStatus.Draft);
  }

  protected saveAndSend(): void {
    this.submit(SupplierOrderStatus.Sent);
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  private hasInvalidCost(): boolean {
    return this.lines.controls.some((line) => {
      const parsed = parseMoneyInput(line.controls.unitCost.value, this.currency);
      return parsed === null || parsed.amountMinor < 0;
    });
  }

  private createLine() {
    return this.fb.group({
      variantId: this.fb.control('', { validators: [Validators.required] }),
      orderedQuantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control('', { validators: [Validators.required] }),
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
