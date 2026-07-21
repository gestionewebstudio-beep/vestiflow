import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import {
  customerDisplayName,
  customerSourceLabel,
  type Customer,
} from '@core/models/customer.model';
import { canManageCustomers } from '@core/permissions/tenant-permissions.util';
import { formatDate } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
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

/** Dettaglio cliente (smart): anagrafica, dati commerciali e collegamenti. */
@Component({
  selector: 'app-customer-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
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
  private readonly authService = inject(AuthService);

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

  protected readonly displayName = computed(() => {
    const customer = this.customer();
    return customer ? customerDisplayName(customer) : '';
  });

  protected readonly isShopifyOwned = computed(() => this.customer()?.source === 'shopify');

  protected readonly canManage = computed(() => canManageCustomers(this.authService.currentUser()));

  protected readonly editPath = computed(() => {
    const customer = this.customer();
    return customer ? `/app/customers/${customer.id}/edit` : this.listPath;
  });

  protected readonly anagraficaFacts = computed<readonly DetailFact[]>(() => {
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
      { label: 'Origine', value: customerSourceLabel(customer.source) },
      { label: 'Nome', value: customer.firstName || '—' },
      { label: 'Cognome', value: customer.lastName || '—' },
      { label: 'Ragione sociale', value: customer.companyName ?? '—' },
      { label: 'P. IVA', value: customer.vatNumber ?? '—', numeric: true },
      { label: 'Codice fiscale', value: customer.taxCode ?? '—', numeric: true },
      { label: 'Email', value: customer.email ?? '—' },
      { label: 'PEC', value: customer.pec ?? '—' },
      { label: 'Codice destinatario SDI', value: customer.sdiCode ?? '—' },
      { label: 'Telefono', value: customer.phone ?? '—', numeric: true },
      { label: 'Sito web', value: customer.website ?? '—' },
      { label: 'Referente', value: customer.contactName ?? '—' },
      { label: 'Indirizzo', value: addressLabel },
      { label: 'Cliente dal', value: formatDate(customer.createdAt), numeric: true },
      { label: 'Aggiornato il', value: formatDate(customer.updatedAt), numeric: true },
      { label: 'Note anagrafiche', value: customer.notes ?? '—', wide: true },
    ];
  });

  protected readonly commercialFacts = computed<readonly DetailFact[]>(() => {
    const customer = this.customer();
    if (!customer) {
      return [];
    }
    return [
      { label: 'Codice cliente', value: customer.code ?? '—', numeric: true },
      { label: 'Sconto', value: customer.customerDiscount ?? '—' },
      { label: 'Modalità di pagamento', value: customer.paymentMethod ?? '—' },
      { label: 'Condizioni di pagamento', value: customer.paymentTerms ?? '—' },
      { label: 'Incaricato trasporto', value: customer.transportResponsible ?? '—' },
      {
        label: 'Avviso creazione documento',
        value: customer.documentCreationAlert ?? '—',
        wide: true,
      },
      {
        label: 'Nota inserita nei documenti',
        value: customer.documentCreationNote ?? '—',
        wide: true,
      },
      { label: 'Note commerciali', value: customer.commercialNotes ?? '—', wide: true },
      {
        label: 'Anche fornitore',
        value: customer.linkedSupplierId
          ? customer.linkedSupplierActive
            ? 'Sì — stesso soggetto in anagrafica fornitori'
            : 'Ruolo fornitore disattivato (storico conservato)'
          : 'No',
      },
    ];
  });

  protected readonly supplierLinkPath = computed(() => {
    const supplierId = this.customer()?.linkedSupplierId;
    return supplierId ? `/app/suppliers/${supplierId}` : null;
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
