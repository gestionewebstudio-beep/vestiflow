import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Customer } from '@core/models/customer.model';
import { formatDate } from '@core/utils/date.util';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CustomerService } from './services/customer.service';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly customer: Customer }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/** Dettaglio cliente read-only (smart): anagrafica e contatti. */
@Component({
  selector: 'app-customer-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './customer-detail.component.html',
  styleUrl: './customer-detail.component.scss',
})
export class CustomerDetailComponent {
  private readonly service = inject(CustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = '/app/customers';
  protected readonly skeletonColumns = 3;

  private readonly refreshTick = signal(0);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.getCustomerById(id).pipe(
          map((customer): DetailState => ({ status: 'success', customer })),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.errorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly customer = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.customer : null;
  });

  protected readonly fullName = computed(() => {
    const customer = this.customer();
    return customer ? `${customer.firstName} ${customer.lastName}` : '';
  });

  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const customer = this.customer();
    if (!customer) {
      return [];
    }
    const address = customer.address;
    const addressLabel = address
      ? [address.line1, address.line2, `${address.postalCode} ${address.city}`, address.province]
          .filter(Boolean)
          .join(', ')
      : '—';
    return [
      { label: 'Email', value: customer.email ?? '—' },
      { label: 'Telefono', value: customer.phone ?? '—', numeric: true },
      { label: 'Indirizzo', value: addressLabel },
      { label: 'Cliente dal', value: formatDate(customer.createdAt), numeric: true },
      { label: 'Aggiornato il', value: formatDate(customer.updatedAt), numeric: true },
      { label: 'Note', value: customer.notes ?? '—', wide: true },
    ];
  });

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  private errorToState(err: unknown): DetailState {
    const appError = this.toAppError(err);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
