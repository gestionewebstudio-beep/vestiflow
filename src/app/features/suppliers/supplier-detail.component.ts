import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier, SupplierVariantLink } from '@core/models/supplier.model';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { formatMoney } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SupplierAttachmentsPanelComponent } from './components/supplier-attachments-panel/supplier-attachments-panel.component';
import { SupplierService } from './services/supplier.service';

type DetailState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly supplier: Supplier;
      readonly links: readonly SupplierVariantLink[];
    }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-supplier-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SupplierAttachmentsPanelComponent,
  ],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.scss',
})
export class SupplierDetailComponent {
  private readonly service = inject(SupplierService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  // Lookup Codici IVA per mostrare "22 · 22% · Imponibile 22%" nei fatti fornitore.
  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  protected vatCodeLabel(vatCodeId: string | null | undefined): string {
    if (!vatCodeId) {
      return '—';
    }
    const entry = this.vatCodes().find((vatCode) => vatCode.id === vatCodeId);
    return entry ? vatCodeOptionLabel(entry) : '—';
  }

  protected readonly listPath = '/app/suppliers';
  protected readonly skeletonColumns = 3;
  protected readonly canManage = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  private readonly refreshTick = signal(0);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of({ status: 'not-found' } satisfies DetailState);
        }
        return forkJoin({
          supplier: this.service.getById(id),
          links: this.service.getVariantLinksBySupplier(id),
        }).pipe(
          map(
            ({ supplier, links }): DetailState => ({
              status: 'success',
              supplier,
              links,
            }),
          ),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly supplier = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.supplier : null;
  });
  protected readonly links = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.links : [];
  });

  protected readonly facts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    if (!s) {
      return [];
    }
    return [
      { label: 'Codice', value: s.code ?? '—' },
      { label: 'P. IVA', value: s.vatNumber ?? '—' },
      { label: 'Codice fiscale', value: s.taxCode ?? '—' },
      { label: 'Email', value: s.email ?? '—' },
      { label: 'PEC', value: s.pec ?? '—' },
      { label: 'Telefono', value: s.phone ?? '—' },
      { label: 'Referente', value: s.contactName ?? '—' },
      { label: 'Sito web', value: s.website ?? '—' },
      { label: 'Indirizzo', value: this.formatAddress(s) },
      { label: 'Pagamento', value: s.paymentTerms ?? '—' },
      { label: 'Sconto fornitore', value: s.supplierDiscount ?? '—' },
      { label: 'Codice IVA predefinito', value: this.vatCodeLabel(s.defaultVatCodeId) },
      { label: 'Incaricato trasporto', value: s.transportResponsible ?? '—' },
      { label: 'Porto', value: s.freightTerms ?? '—' },
      { label: 'Nota creazione documento', value: s.documentCreationNote ?? '—' },
      { label: 'Note', value: s.notes ?? '—' },
      {
        label: 'Anche cliente',
        value: s.linkedCustomerId ? 'Sì — collegato in anagrafica clienti' : 'No',
      },
    ];
  });

  protected readonly customerLinkPath = computed(() => {
    const customerId = this.supplier()?.linkedCustomerId;
    return customerId ? `/app/customers/${customerId}` : null;
  });

  protected formatPrice(link: SupplierVariantLink): string {
    if (link.lastPurchasePriceMinor == null) {
      return '—';
    }
    return formatMoney({ amountMinor: link.lastPurchasePriceMinor, currencyCode: link.currency });
  }

  protected goToList(): void {
    void this.router.navigate([this.listPath]);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected editSupplier(): void {
    const s = this.supplier();
    if (s) {
      void this.router.navigate(['/app/suppliers', s.id, 'edit']);
    }
  }

  private formatAddress(s: Supplier): string {
    const parts = [
      s.addressLine1,
      s.addressLine2,
      [s.postalCode, s.city].filter(Boolean).join(' '),
      s.province,
      s.countryCode,
    ].filter((part) => part?.trim());
    return parts.length ? parts.join(', ') : '—';
  }

  private toErrorState(err: unknown): DetailState {
    if (isAppError(err) && err.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    if (isAppError(err)) {
      return { status: 'error', error: err };
    }
    return { status: 'error', error: { kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } };
  }
}
