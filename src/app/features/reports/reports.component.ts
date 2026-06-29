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
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { canExportOperationalData } from '@core/permissions/tenant-permissions.util';
import { reportPageSubtitle } from '@core/models/tenant-channel-profile.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { BusinessAnalyticsPanelComponent } from '@features/analytics/components/business-analytics-panel/business-analytics-panel.component';
import {
  InventoryService,
  type LocationInventoryReportRow,
} from '@features/inventory/services/inventory.service';
import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';

import { ReportCorrispettiviExportComponent } from './components/report-corrispettivi-export/report-corrispettivi-export.component';
import { ReportLocationTableComponent } from './components/report-location-table/report-location-table.component';
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
  resolveReportDateRange,
} from './models/report-list-query.model';
import type { LocationReportRow } from './models/report-view.model';

interface ReportData {
  readonly locationReport: readonly LocationInventoryReportRow[];
}

type ReportState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ReportData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Report operativi: export corrispettivi manuali e snapshot magazzino.
 * Le vendite Shopify vivono in Vendite Shopify; i corrispettivi Shopify lì.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ErrorStateComponent,
    BusinessAnalyticsPanelComponent,
    ReportCorrispettiviExportComponent,
    TableSkeletonComponent,
    ReportLocationTableComponent,
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

  protected readonly corrispettiviChannel = computed(() =>
    parseCorrispettiviChannel(this.queryParams()),
  );

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );

  protected readonly pageSubtitle = computed(() => reportPageSubtitle(this.tenantProfile()));

  protected readonly corrispettiviChannelOptions = computed(() =>
    corrispettiviChannelOptions(this.tenantProfile()),
  );

  protected readonly corrispettiviChannelHint = computed(() =>
    corrispettiviChannelHint(this.corrispettiviChannel(), this.tenantProfile()),
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
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(() =>
        this.inventoryService.getLocationInventoryReport().pipe(
          map(
            (locationReport): ReportState => ({
              status: 'success',
              data: { locationReport },
            }),
          ),
          startWith<ReportState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ReportState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
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
