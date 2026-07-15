import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier } from '@core/models/supplier.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import type { VatCode } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { SupplierFormFieldsComponent } from '@features/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  patchSupplierFormGroup,
} from '@features/suppliers/utils/supplier-form.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SupplierService } from './services/supplier.service';

@Component({
  selector: 'app-supplier-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SupplierFormFieldsComponent,
  ],
  templateUrl: './supplier-form.component.html',
  styleUrl: './supplier-form.component.scss',
})
export class SupplierFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(SupplierService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/suppliers';
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  // Codici IVA per la tendina "Codice IVA predefinito".
  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  /** Voci pagamento del tenant per le tendine modalità/condizioni. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly supplierId = computed(() => this.params().get('id'));
  protected readonly isEdit = computed(() => Boolean(this.supplierId()));

  private readonly loadState = toSignal(
    toObservable(this.supplierId).pipe(
      switchMap((id) => {
        if (!id) {
          return of({ status: 'ready' as const, supplier: null });
        }
        return this.service.getById(id).pipe(
          map((supplier) => ({ status: 'ready' as const, supplier })),
          startWith({ status: 'loading' as const, supplier: null }),
          catchError((err: unknown) =>
            of({
              status: 'error' as const,
              supplier: null,
              error: isAppError(err)
                ? err
                : ({ kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } satisfies AppError),
            }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'loading' as const, supplier: null } },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly loadError = computed(() => {
    const state = this.loadState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly form = createSupplierFormGroup(this.fb);

  constructor() {
    toObservable(this.loadState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state.status === 'ready' && state.supplier) {
          patchSupplierFormGroup(this.form, state.supplier);
        }
      });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const payload = mapSupplierFormToInput(this.form.getRawValue());
    const id = this.supplierId();
    const request$ = id
      ? this.service.updateSupplier(id, payload)
      : this.service.createSupplier(payload);

    request$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (supplier: Supplier) => {
        this.saving.set(false);
        void this.router.navigate(['/app/suppliers', supplier.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito');
      },
    });
  }
}
