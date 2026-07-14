import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { Money } from '@core/models/money.model';
import { CorrispettivoEntryStatus } from '@core/models/sales-order.model';
import { canExportOperationalData } from '@core/permissions/tenant-permissions.util';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import {
  corrispettivoStatusLabel,
  corrispettivoStatusTone,
} from '@features/sales-orders/models/sales-order-labels.util';

import type {
  CorrispettivoEntryDetail,
  CorrispettivoEntryListQuery,
  CorrispettivoEntryRow,
  CorrispettivoEntryUpdate,
} from './models/online-sale.model';
import { OnlineSalesService } from './services/online-sales.service';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_META: PageMeta = { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 };

type ListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly entries: readonly CorrispettivoEntryRow[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

type EntryDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly detail: CorrispettivoEntryDetail }
  | { readonly status: 'error'; readonly message: string };

/**
 * Registro Corrispettivi (fase 3 §5): distinto dalle Vendite online (regola
 * invariante 4). Filtri per periodo, canale, stato, aliquota, fatturato,
 * incluso/escluso e numeri ordine/vendita; dettaglio con righe analitiche.
 * NON è una trasmissione fiscale automatica: registro operativo di supporto.
 */
@Component({
  selector: 'app-corrispettivi-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './corrispettivi-register.component.html',
  styleUrl: './corrispettivi-register.component.scss',
})
export class CorrispettiviRegisterComponent {
  private readonly service = inject(OnlineSalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 9;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly statusLabel = corrispettivoStatusLabel;
  protected readonly statusTone = corrispettivoStatusTone;
  protected readonly formatDate = formatDate;

  protected readonly channelOptions: readonly SelectMenuOption[] = [
    { value: 'online', label: 'Shopify online' },
    { value: 'pos', label: 'Shopify POS' },
  ];

  protected readonly statusOptions: readonly SelectMenuOption[] = Object.values(
    CorrispettivoEntryStatus,
  ).map((status) => ({ value: status, label: corrispettivoStatusLabel(status) }));

  protected readonly invoicedOptions: readonly SelectMenuOption[] = [
    { value: 'true', label: 'Fatturati' },
    { value: 'false', label: 'Non fatturati' },
  ];

  protected readonly inclusionOptions: readonly SelectMenuOption[] = [
    { value: 'false', label: 'Inclusi nel riepilogo' },
    { value: 'true', label: 'Esclusi dal riepilogo' },
  ];

  /** Aliquote IVA italiane correnti (filtro §5). */
  protected readonly vatRateOptions: readonly SelectMenuOption[] = [
    { value: '4', label: '4%' },
    { value: '5', label: '5%' },
    { value: '10', label: '10%' },
    { value: '22', label: '22%' },
  ];

  protected readonly canEditEntries = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed((): CorrispettivoEntryListQuery => {
    const params = this.queryParams();
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    const fiscalFrom = params.get('fiscalFrom') ?? '';
    const fiscalTo = params.get('fiscalTo') ?? '';
    const status = params.get('status') ?? '';
    const invoiceIssued = params.get('invoiceIssued');
    const excluded = params.get('excluded');
    const vatRate = Number(params.get('vatRate'));

    const statusValues = new Set<string>(Object.values(CorrispettivoEntryStatus));

    return {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize:
        Number.isInteger(pageSize) && PAGE_SIZE_OPTIONS.includes(pageSize)
          ? pageSize
          : DEFAULT_PAGE_SIZE,
      search: params.get('search')?.trim() || undefined,
      channel: params.get('channel') ?? undefined,
      status: statusValues.has(status) ? (status as CorrispettivoEntryStatus) : undefined,
      fiscalFrom: ISO_DATE.test(fiscalFrom) ? fiscalFrom : undefined,
      fiscalTo: ISO_DATE.test(fiscalTo) ? fiscalTo : undefined,
      invoiceIssued:
        invoiceIssued === 'true' ? true : invoiceIssued === 'false' ? false : undefined,
      excludedFromSummary: excluded === 'true' ? true : excluded === 'false' ? false : undefined,
      vatRatePercent: Number.isInteger(vatRate) && vatRate > 0 ? vatRate : undefined,
    };
  });

  protected readonly invoicedFilterValue = computed(() => {
    const value = this.query().invoiceIssued;
    return value === undefined ? '' : String(value);
  });

  protected readonly inclusionFilterValue = computed(() => {
    const value = this.query().excludedFromSummary;
    return value === undefined ? '' : String(value);
  });

  private readonly refreshTick = signal(0);
  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getCorrispettivoEntries(query).pipe(
          map(
            (response): ListState => ({
              status: 'success',
              entries: response.data,
              meta: response.meta,
            }),
          ),
          startWith<ListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly entries = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.entries : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  protected readonly hasActiveFilters = computed(() => {
    const q = this.query();
    return Boolean(
      q.search ??
      q.channel ??
      q.status ??
      q.fiscalFrom ??
      q.fiscalTo ??
      q.invoiceIssued ??
      q.excludedFromSummary ??
      q.vatRatePercent,
    );
  });

  /** Voce espansa con righe analitiche (fase 3 §5: dettaglio). */
  protected readonly expandedEntryId = signal<EntityId | null>(null);
  protected readonly entryDetail = signal<EntryDetailState | null>(null);

  protected readonly savePending = signal(false);
  protected readonly saveFeedback = signal<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private readonly searchSubscription: Subscription;
  private detailSubscription: Subscription | null = null;
  private saveSubscription: Subscription | null = null;

  constructor() {
    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onChannelFilterChange(value: string | null): void {
    this.updateParams({ channel: value, page: null }, true);
  }

  protected onStatusFilterChange(value: string | null): void {
    this.updateParams({ status: value, page: null }, true);
  }

  protected onInvoicedFilterChange(value: string | null): void {
    this.updateParams({ invoiceIssued: value, page: null }, true);
  }

  protected onInclusionFilterChange(value: string | null): void {
    this.updateParams({ excluded: value, page: null }, true);
  }

  protected onVatRateFilterChange(value: string | null): void {
    this.updateParams({ vatRate: value, page: null }, true);
  }

  protected onFiscalFromChange(value: string): void {
    this.updateParams({ fiscalFrom: value || null, page: null }, true);
  }

  protected onFiscalToChange(value: string): void {
    this.updateParams({ fiscalTo: value || null, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams(
      {
        search: null,
        channel: null,
        status: null,
        fiscalFrom: null,
        fiscalTo: null,
        invoiceIssued: null,
        excluded: null,
        vatRate: null,
        page: null,
      },
      true,
    );
  }

  protected goToPage(page: number): void {
    this.expandedEntryId.set(null);
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.expandedEntryId.set(null);
    this.updateParams({ pageSize: size === DEFAULT_PAGE_SIZE ? null : size, page: null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected toggleEntry(entry: CorrispettivoEntryRow): void {
    this.saveFeedback.set(null);
    if (this.expandedEntryId() === entry.id) {
      this.expandedEntryId.set(null);
      this.entryDetail.set(null);
      return;
    }
    this.expandedEntryId.set(entry.id);
    this.loadEntryDetail(entry.id);
  }

  /** Salva stato/data fiscale/esclusione della voce espansa. */
  protected saveEntry(id: EntityId, update: CorrispettivoEntryUpdate): void {
    if (this.savePending()) {
      return;
    }
    this.savePending.set(true);
    this.saveFeedback.set(null);
    this.saveSubscription = this.service
      .updateCorrispettivoEntry(id, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savePending.set(false);
          this.saveFeedback.set({ tone: 'success', message: 'Voce corrispettivo aggiornata.' });
          this.loadEntryDetail(id);
          this.reload();
        },
        error: (err: unknown) => {
          this.savePending.set(false);
          this.saveFeedback.set({ tone: 'error', message: this.toAppError(err).message });
        },
      });
  }

  protected onStatusChange(id: EntityId, value: string | null): void {
    if (!value) {
      return;
    }
    this.saveEntry(id, { status: value as CorrispettivoEntryStatus });
  }

  protected onFiscalDateChange(id: EntityId, value: string): void {
    if (!ISO_DATE.test(value)) {
      return;
    }
    this.saveEntry(id, { fiscalDate: value });
  }

  protected onInvoiceIssuedToggle(id: EntityId, event: Event): void {
    this.saveEntry(id, { invoiceIssued: (event.target as HTMLInputElement).checked });
  }

  protected onExcludedToggle(id: EntityId, event: Event): void {
    this.saveEntry(id, { excludedFromSummary: (event.target as HTMLInputElement).checked });
  }

  protected money(amountMinor: number): string {
    const money: Money = { amountMinor, currencyCode: 'EUR' };
    return formatMoney(money);
  }

  /** Etichetta Codice IVA riconosciuto per corrispondenza inversa, altrimenti solo l'aliquota grezza. */
  protected vatLabel(line: {
    readonly vatCodeLabel: string | null;
    readonly vatRatePercent: number | null;
  }): string {
    if (line.vatCodeLabel) {
      return line.vatCodeLabel;
    }
    return line.vatRatePercent == null ? '—' : `${line.vatRatePercent}%`;
  }

  protected adjustmentLabel(entry: CorrispettivoEntryRow): string {
    if (entry.refundedAt) {
      return `Rimborso ${formatDate(entry.refundedAt)}`;
    }
    return entry.adjustmentNote ? 'Rettifica' : '—';
  }

  protected openOrder(entry: CorrispettivoEntryRow, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/app/sales', entry.salesOrderId]);
  }

  private loadEntryDetail(id: EntityId): void {
    this.entryDetail.set({ status: 'loading' });
    this.detailSubscription = this.service
      .getCorrispettivoEntryById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => this.entryDetail.set({ status: 'success', detail }),
        error: (err: unknown) =>
          this.entryDetail.set({ status: 'error', message: this.toAppError(err).message }),
      });
  }

  private updateParams(params: Record<string, string | number | null>, replace = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  private applySearch(value: string): void {
    const trimmed = value.trim();
    const current = this.query().search ?? '';
    if (trimmed === current) {
      return;
    }
    this.updateParams({ search: trimmed || null, page: null }, true);
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
