import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
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

import { ReportFiltersComponent } from './components/report-filters/report-filters.component';
import { ReportLocationTableComponent } from './components/report-location-table/report-location-table.component';
import { ReportSalesTableComponent } from './components/report-sales-table/report-sales-table.component';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  ReportPeriodPreset,
  reportHasActiveFilters,
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
 * Report operativi: magazzino (snapshot) e vendite filtrabili per periodo,
 * canale e stato pagamento. Filtri vendite persistiti in query params.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ErrorStateComponent,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

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

  protected onSourceChange(value: string): void {
    this.updateParams({ source: value || null });
  }

  protected onFinancialStatusChange(value: string): void {
    this.updateParams({ financialStatus: value || null });
  }

  protected resetFilters(): void {
    this.updateParams({
      period: null,
      from: null,
      to: null,
      source: null,
      financialStatus: null,
    });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
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
