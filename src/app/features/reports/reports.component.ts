import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { canExportOperationalData } from '@core/permissions/tenant-permissions.util';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { StatCardComponent } from '@shared/components/stat-card/stat-card.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import {
  InventoryService,
  type LocationInventoryReportRow,
} from '@features/inventory/services/inventory.service';
import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';
import type { SalesOrder } from '@core/models/sales-order.model';

import { ReportCorrispettiviExportComponent } from './components/report-corrispettivi-export/report-corrispettivi-export.component';
import { ReportFiltersComponent } from './components/report-filters/report-filters.component';
import { ReportLocationTableComponent } from './components/report-location-table/report-location-table.component';
import { ReportSalesTableComponent } from './components/report-sales-table/report-sales-table.component';
import {
  corrispettiviChannelHint,
  corrispettiviChannelOptions,
  parseCorrispettiviChannel,
  resolveCorrispettiviExport,
} from './models/corrispettivi-channel.model';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  ReportPeriodPreset,
  reportHasActiveFilters,
  resolveReportDateRange,
  toSalesOrderListFilters,
} from './models/report-list-query.model';
import {
  aggregateSalesReportRows,
  computeSalesReportSummary,
  eurMoney,
} from './models/report-sales.util';
import type { LocationReportRow } from './models/report-view.model';

interface ReportData {
  readonly locationReport: readonly LocationInventoryReportRow[];
  readonly orders: readonly SalesOrder[];
}

type ReportState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ReportData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Report operativi: export corrispettivi in cima, poi sintesi magazzino e vendite.
 * Periodo e tipologia corrispettivi persistiti in query params.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ErrorStateComponent,
    ReportCorrispettiviExportComponent,
    ReportFiltersComponent,
    StatCardComponent,
    TableSkeletonComponent,
    ReportLocationTableComponent,
    ReportSalesTableComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly refreshTick = signal(0);
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  /** Aggiornamento immediato del periodo in UI prima del sync URL. */
  private readonly uiPeriod = signal<ReportPeriodPreset | null>(null);

  constructor() {
    effect(() => {
      this.query();
      this.uiPeriod.set(null);
    });
  }

  protected readonly query = computed(() => parseReportListQuery(this.queryParams()));
  protected readonly displayPeriod = computed(() => this.uiPeriod() ?? this.query().period);
  protected readonly periodLabel = computed(() =>
    formatReportPeriodLabel({ ...this.query(), period: this.displayPeriod() }),
  );
  protected readonly hasActiveFilters = computed(() => reportHasActiveFilters(this.query()));

  protected readonly corrispettiviChannel = computed(() =>
    parseCorrispettiviChannel(this.queryParams()),
  );

  protected readonly corrispettiviChannelOptions = computed(() =>
    corrispettiviChannelOptions(this.authService.currentUser()?.tenantChannelProfile),
  );

  protected readonly corrispettiviChannelHint = computed(() =>
    corrispettiviChannelHint(this.corrispettiviChannel()),
  );

  protected readonly exporting = signal(false);

  protected readonly canExportCorrispettivi = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  private readonly exportRange = computed(() =>
    resolveReportDateRange({ ...this.query(), period: this.displayPeriod() }),
  );

  protected readonly dateFromDraft = computed(() => {
    if (this.displayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.query().dateFrom ?? todayIsoDate();
  });

  protected readonly dateToDraft = computed(() => {
    if (this.displayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.query().dateTo ?? todayIsoDate();
  });

  private readonly request = computed(() => ({
    query: { ...this.query(), period: this.displayPeriod() },
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) => {
        const salesFilters = toSalesOrderListFilters(query);
        return forkJoin({
          locationReport: this.inventoryService.getLocationInventoryReport(),
          orders: this.salesOrderService.getAllSalesOrders(salesFilters),
        }).pipe(
          map((data): ReportState => ({ status: 'success', data })),
          startWith<ReportState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ReportState>({ status: 'error', error: this.toAppError(err) }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies ReportState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  private readonly data = computed<ReportData | null>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  protected readonly locationRows = computed<readonly LocationReportRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    return data.locationReport.map(
      (row): LocationReportRow => ({
        locationId: row.locationId,
        locationName: row.locationName,
        trackedVariants: row.trackedVariants,
        availableUnits: row.availableUnits,
        lowStockCount: row.lowStockCount,
        stockValue: {
          amountMinor: row.stockValueMinor,
          currencyCode: row.currencyCode || DEFAULT_CURRENCY,
        },
      }),
    );
  });

  private readonly salesSummary = computed(() => {
    const data = this.data();
    if (!data) {
      return { revenueMinor: 0, orderCount: 0, unitsSold: 0 };
    }
    return computeSalesReportSummary(data.orders);
  });

  protected readonly salesRows = computed(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    return aggregateSalesReportRows(data.orders);
  });

  protected readonly salesEmpty = computed(
    () => !this.loading() && !this.error() && this.salesRows().length === 0,
  );

  protected readonly stockValueLabel = computed(() =>
    formatMoney(
      eurMoney(this.locationRows().reduce((sum, row) => sum + row.stockValue.amountMinor, 0)),
    ),
  );

  protected readonly availableUnitsLabel = computed(() =>
    String(this.locationRows().reduce((sum, row) => sum + row.availableUnits, 0)),
  );

  protected readonly lowStockLabel = computed(() =>
    String(this.locationRows().reduce((sum, row) => sum + row.lowStockCount, 0)),
  );

  protected readonly revenueLabel = computed(() =>
    formatMoney(eurMoney(this.salesSummary().revenueMinor)),
  );

  protected readonly orderCountLabel = computed(() => String(this.salesSummary().orderCount));

  protected readonly unitsSoldLabel = computed(() => String(this.salesSummary().unitsSold));

  protected onPeriodChange(period: ReportPeriodPreset): void {
    this.uiPeriod.set(period);
    if (period === ReportPeriodPreset.Custom) {
      const today = todayIsoDate();
      this.updateParams({ period, from: today, to: today });
      return;
    }
    this.updateParams({ period, from: null, to: null });
  }

  protected onDateFromChange(value: string): void {
    this.updateParams({ from: value || null, period: ReportPeriodPreset.Custom });
  }

  protected onDateToChange(value: string): void {
    this.updateParams({ to: value || null, period: ReportPeriodPreset.Custom });
  }

  protected onCorrispettiviChannelChange(value: string): void {
    this.updateParams({ corrChannel: value || null });
  }

  protected onSourceChange(value: string): void {
    this.updateParams({ source: value || null });
  }

  protected onFinancialStatusChange(value: string): void {
    this.updateParams({ financialStatus: value || null });
  }

  protected resetFilters(): void {
    this.updateParams({
      source: null,
      financialStatus: null,
    });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected exportCorrispettivi(): void {
    if (this.exporting()) {
      return;
    }
    this.exporting.set(true);

    const config = resolveCorrispettiviExport(this.corrispettiviChannel());
    const range = this.exportRange();
    const request =
      config.kind === 'shopify'
        ? this.salesOrderService.exportSalesOrdersCsv({
            placedFrom: range.placedFrom,
            placedTo: range.placedTo,
          })
        : this.inventoryService.exportCorrispettiviCsv({
            origin: config.origin,
            from: `${range.placedFrom}T00:00:00`,
            to: `${range.placedTo}T23:59:59.999`,
          });

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.downloadCsvBlob(blob, config.filePrefix);
      },
      error: () => {
        this.exporting.set(false);
      },
    });
  }

  private downloadCsvBlob(blob: Blob, prefix: string): void {
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${prefix}-vestiflow-${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private updateParams(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
