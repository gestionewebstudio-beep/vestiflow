import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { canExportOperationalData } from '@core/permissions/tenant-permissions.util';
import {
  CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID,
  CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID,
  CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID,
} from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import {
  corrispettiviReportEmptyHint,
  corrispettiviReportFilterSubtitle,
  corrispettiviReportSubtitle,
} from '@core/models/tenant-channel-profile.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CorrispettiviDeliveriesComponent } from '../../components/corrispettivi-deliveries/corrispettivi-deliveries.component';
import { CorrispettiviOrdersTableComponent } from '../../components/corrispettivi-orders-table/corrispettivi-orders-table.component';
import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import { ReportCorrispettiviExportComponent } from '../../components/report-corrispettivi-export/report-corrispettivi-export.component';
import {
  SalesOrderFiscalStatus,
  type CorrispettiviDelivery,
  type CorrispettiviOrder,
  type CorrispettiviSummary,
} from '../../models/corrispettivi.model';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  ReportPeriodPreset,
  resolveReportDateRange,
} from '../../models/report-list-query.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';

interface CorrispettiviPageData {
  readonly orders: readonly CorrispettiviOrder[];
  readonly summary: CorrispettiviSummary;
  readonly deliveries: readonly CorrispettiviDelivery[];
  readonly totalOrders: number;
}

type CorrispettiviState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: CorrispettiviPageData }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-corrispettivi-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    ConfirmDialogComponent,
    CorrispettiviDeliveriesComponent,
    CorrispettiviOrdersTableComponent,
    CorrispettiviSummaryComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ReportCorrispettiviExportComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './corrispettivi-report.component.html',
  styleUrl: './corrispettivi-report.component.scss',
})
export class CorrispettiviReportComponent {
  private readonly corrispettiviService = inject(CorrispettiviService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly blobExport = inject(BackgroundBlobExportService);

  private readonly refreshTick = signal(0);
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly uiPeriod = signal<ReportPeriodPreset | null>(null);

  protected readonly markDeliveredOpen = model(false);
  protected readonly markDeliveredBusy = signal(false);
  protected readonly exporting = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID),
  );
  protected readonly exportingSpreadsheet = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID),
  );
  protected readonly exportingPdf = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID),
  );
  protected readonly deliveryNote = signal('');

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

  protected readonly fiscalStatusFilter = computed(() => {
    const value = this.queryParams().get('fiscalStatus') ?? '';
    return Object.values(SalesOrderFiscalStatus).includes(value as SalesOrderFiscalStatus)
      ? (value as SalesOrderFiscalStatus)
      : undefined;
  });

  protected readonly pendingOnly = computed(() => this.queryParams().get('pendingOnly') === '1');

  protected readonly refundsOnly = computed(() => this.queryParams().get('refundsOnly') === '1');

  protected readonly onlineOnly = computed(() => this.queryParams().get('onlineOnly') !== '0');

  protected readonly canExport = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );
  protected readonly pageSubtitle = computed(() =>
    corrispettiviReportSubtitle(this.tenantProfile()),
  );
  protected readonly filterSubtitle = computed(() =>
    corrispettiviReportFilterSubtitle(this.tenantProfile()),
  );
  protected readonly emptyHint = computed(() => corrispettiviReportEmptyHint(this.tenantProfile()));

  protected readonly dateRange = computed(() =>
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

  protected readonly fiscalStatusOptions: readonly SelectMenuOption[] = [
    { value: '', label: 'Tutti gli stati fiscali' },
    { value: SalesOrderFiscalStatus.PendingRegistration, label: 'Da registrare' },
    {
      value: SalesOrderFiscalStatus.DeliveredToAccountant,
      label: 'Consegnato al commercialista',
    },
    { value: SalesOrderFiscalStatus.ExternallyRegistered, label: 'Registrato esternamente' },
    { value: SalesOrderFiscalStatus.ExcludedPosRegister, label: 'Escluso (cassa/POS)' },
    { value: SalesOrderFiscalStatus.Invoiced, label: 'Fatturato' },
  ];

  private readonly listQuery = computed(() => ({
    tick: this.refreshTick(),
    placedFrom: this.dateRange().placedFrom,
    placedTo: this.dateRange().placedTo,
    fiscalStatus: this.fiscalStatusFilter(),
    pendingDeliveryOnly: this.pendingOnly() || undefined,
    refundsOnly: this.refundsOnly() || undefined,
    onlineOnly: this.onlineOnly() || undefined,
    page: 1,
    pageSize: 100,
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap((query) =>
        combineLatest([
          this.corrispettiviService.listOrders(query),
          this.corrispettiviService.getSummary(query),
          this.corrispettiviService.listDeliveries(1, 10),
        ]).pipe(
          map(
            ([ordersPage, summary, deliveriesPage]): CorrispettiviState => ({
              status: 'success',
              data: {
                orders: ordersPage.data,
                summary,
                deliveries: deliveriesPage.data,
                totalOrders: ordersPage.meta.total,
              },
            }),
          ),
          startWith<CorrispettiviState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<CorrispettiviState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CorrispettiviState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  private readonly data = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  protected readonly orders = computed(() => this.data()?.orders ?? []);
  protected readonly summary = computed(() => this.data()?.summary ?? null);
  protected readonly deliveries = computed(() => this.data()?.deliveries ?? []);
  protected readonly totalOrders = computed(() => this.data()?.totalOrders ?? 0);

  protected readonly markDeliveredMessage = computed(() => {
    const summary = this.summary();
    const range = this.dateRange();
    if (!summary) {
      return '';
    }
    return `Segnerai come consegnati al commercialista ${summary.pendingDeliveryCount} ordini online del periodo ${range.placedFrom} – ${range.placedTo}.`;
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

  protected onFiscalStatusChange(value: string | null): void {
    this.updateParams({ fiscalStatus: value || null });
  }

  protected togglePendingOnly(): void {
    this.updateParams({ pendingOnly: this.pendingOnly() ? null : '1' });
  }

  protected toggleRefundsOnly(): void {
    this.updateParams({ refundsOnly: this.refundsOnly() ? null : '1' });
  }

  protected toggleOnlineOnly(): void {
    this.updateParams({ onlineOnly: this.onlineOnly() ? '0' : null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected exportAccountantCsv(): void {
    if (this.exporting() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID,
      request: this.corrispettiviService.exportAccountantCsv(this.exportQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'csv'),
      inProgressMessage: 'Export CSV commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export CSV commercialista completato: download avviato.',
      errorMessage: 'Export CSV non riuscito. Riprova tra qualche istante.',
    });
  }

  protected exportSpreadsheet(): void {
    if (this.exportingSpreadsheet() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID,
      request: this.corrispettiviService.exportSpreadsheet(this.exportQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'xls'),
      inProgressMessage: 'Export foglio commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export foglio completato: download avviato.',
      errorMessage: 'Export foglio non riuscito. Riprova tra qualche istante.',
    });
  }

  protected exportPdf(): void {
    if (this.exportingPdf() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID,
      request: this.corrispettiviService.exportPdf(this.exportQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'pdf'),
      inProgressMessage: 'Export PDF commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export PDF completato: download avviato.',
      errorMessage: 'Export PDF non riuscito. Riprova tra qualche istante.',
    });
  }

  protected printReport(): void {
    void this.router.navigate(['/app/reports/corrispettivi/print'], {
      queryParams: {
        period: this.displayPeriod(),
        from: this.query().dateFrom ?? null,
        to: this.query().dateTo ?? null,
        onlineOnly: this.onlineOnly() ? null : '0',
      },
    });
  }

  protected openMarkDelivered(): void {
    this.deliveryNote.set('');
    this.markDeliveredOpen.set(true);
  }

  protected confirmMarkDelivered(): void {
    if (this.markDeliveredBusy()) {
      return;
    }
    this.markDeliveredBusy.set(true);

    const range = this.dateRange();
    this.corrispettiviService
      .markDelivered({
        placedFrom: range.placedFrom,
        placedTo: range.placedTo,
        channel: 'online',
        note: this.deliveryNote().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markDeliveredBusy.set(false);
          this.markDeliveredOpen.set(false);
          this.reload();
        },
        error: () => {
          this.markDeliveredBusy.set(false);
        },
      });
  }

  private exportQuery() {
    return {
      placedFrom: this.dateRange().placedFrom,
      placedTo: this.dateRange().placedTo,
      fiscalStatus: this.fiscalStatusFilter(),
      pendingDeliveryOnly: this.pendingOnly() || undefined,
      refundsOnly: this.refundsOnly() || undefined,
      onlineOnly: this.onlineOnly() || undefined,
    };
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
