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
import type { Customer } from '@core/models/customer.model';
import { CustomerFormFieldsComponent } from '@features/customers/components/customer-form-fields/customer-form-fields.component';
import {
  createCustomerFormGroup,
  mapCustomerFormToInput,
  patchCustomerFormGroup,
  setCustomerAnagraficaReadOnly,
} from '@features/customers/utils/customer-form.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CustomerService } from './services/customer.service';

@Component({
  selector: 'app-customer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    CustomerFormFieldsComponent,
  ],
  templateUrl: './customer-form.component.html',
  styleUrl: './customer-form.component.scss',
})
export class CustomerFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(CustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/customers';
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly customerId = computed(() => this.params().get('id'));
  protected readonly isEdit = computed(() => Boolean(this.customerId()));

  private readonly loadState = toSignal(
    toObservable(this.customerId).pipe(
      switchMap((id) => {
        if (!id) {
          return of({ status: 'ready' as const, customer: null });
        }
        return this.service.getCustomerById(id).pipe(
          map((customer) => ({ status: 'ready' as const, customer })),
          startWith({ status: 'loading' as const, customer: null }),
          catchError((err: unknown) =>
            of({
              status: 'error' as const,
              customer: null,
              error: isAppError(err)
                ? err
                : ({ kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } satisfies AppError),
            }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'loading' as const, customer: null } },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly loadError = computed(() => {
    const state = this.loadState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly anagraficaReadOnly = computed(
    () => this.loadState().customer?.source === 'shopify',
  );

  protected readonly form = createCustomerFormGroup(this.fb);

  constructor() {
    toObservable(this.loadState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state.status === 'ready' && state.customer) {
          patchCustomerFormGroup(this.form, state.customer);
          setCustomerAnagraficaReadOnly(this.form, state.customer.source === 'shopify');
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
    const payload = mapCustomerFormToInput(this.form.getRawValue());
    const id = this.customerId();
    const request$ = id
      ? this.service.updateCustomer(id, payload)
      : this.service.createCustomer(payload);

    request$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (customer: Customer) => {
        this.saving.set(false);
        void this.router.navigate(['/app/customers', customer.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito');
      },
    });
  }
}
