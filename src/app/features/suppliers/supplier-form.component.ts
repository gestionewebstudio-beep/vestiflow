import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier, SupplierInput } from '@core/models/supplier.model';
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
  ],
  templateUrl: './supplier-form.component.html',
  styleUrl: './supplier-form.component.scss',
})
export class SupplierFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(SupplierService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/suppliers';
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

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

  protected readonly form = this.fb.group({
    code: this.fb.control(''),
    name: this.fb.control('', [Validators.required]),
    vatNumber: this.fb.control(''),
    taxCode: this.fb.control(''),
    email: this.fb.control(''),
    pec: this.fb.control(''),
    phone: this.fb.control(''),
    contactName: this.fb.control(''),
    website: this.fb.control(''),
    addressLine1: this.fb.control(''),
    addressLine2: this.fb.control(''),
    city: this.fb.control(''),
    province: this.fb.control(''),
    postalCode: this.fb.control(''),
    countryCode: this.fb.control('IT'),
    paymentTerms: this.fb.control(''),
    notes: this.fb.control(''),
  });

  constructor() {
    toObservable(this.loadState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state.status === 'ready' && state.supplier) {
          this.patchForm(state.supplier);
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
    const payload = this.form.getRawValue() satisfies SupplierInput;
    const id = this.supplierId();
    const request$ = id
      ? this.service.updateSupplier(id, payload)
      : this.service.createSupplier(payload);

    request$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (supplier) => {
        this.saving.set(false);
        void this.router.navigate(['/app/suppliers', supplier.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito');
      },
    });
  }

  private patchForm(supplier: Supplier): void {
    this.form.patchValue({
      code: supplier.code ?? '',
      name: supplier.name,
      vatNumber: supplier.vatNumber ?? '',
      taxCode: supplier.taxCode ?? '',
      email: supplier.email ?? '',
      pec: supplier.pec ?? '',
      phone: supplier.phone ?? '',
      contactName: supplier.contactName ?? '',
      website: supplier.website ?? '',
      addressLine1: supplier.addressLine1 ?? '',
      addressLine2: supplier.addressLine2 ?? '',
      city: supplier.city ?? '',
      province: supplier.province ?? '',
      postalCode: supplier.postalCode ?? '',
      countryCode: supplier.countryCode ?? 'IT',
      paymentTerms: supplier.paymentTerms ?? '',
      notes: supplier.notes ?? '',
    });
  }
}
