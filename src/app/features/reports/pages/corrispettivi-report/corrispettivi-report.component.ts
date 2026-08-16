import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CorrispettiviOrdersTableComponent } from '../../components/corrispettivi-orders-table/corrispettivi-orders-table.component';
import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import { ReportCorrispettiviExportComponent } from '@domain/reports/components/report-corrispettivi-export/report-corrispettivi-export.component';
import {
  SalesOrderFiscalStatus,
  type CorrispettiviRegisterRow,
  type CorrispettiviSummary,
} from '../../models/corrispettivi.model';
import {
  formatReportPeriodLabel,
  periodNeedsYear,
  parseReportListQuery,
  ReportPeriodPreset,
  resolveReportDateRange,
} from '@domain/reports/models/report-list-query.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';

/** Valori ammessi per il filtro tipo di riga (specchio del DTO API). */
const ROW_TYPE_FILTERS: readonly string[] = ['all', 'sales', 'returns', 'refunds'];

interface CorrispettiviPageData {
  readonly orders: readonly CorrispettiviRegisterRow[];
  readonly summary: CorrispettiviSummary;
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
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
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

  protected readonly exporting = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID),
  );
  protected readonly exportingSpreadsheet = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID),
  );
  protected readonly exportingPdf = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID),
  );

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

  /**
   * Canale, con **«Tutti» come predefinito**.
   *
   * Era «Shopify», e produceva il difetto peggiore: due schermate con lo stesso
   * nome che dicevano numeri diversi per lo stesso trimestre — 95,00 € qui e
   * 324,36 € nel Registro commercialista, che non filtra il canale. La
   * differenza stava in un solo campo, non nel calcolo: entrambe passano dallo
   * stesso `CorrispettiviService.getSummary`.
   *
   * **Fra i due predefiniti vince quello che mostra tutto.** Un totale gonfiato
   * si nota — qualcuno chiede perché ci sono dentro gli ordini manuali; un
   * totale a cui manca una parte no, e nessuno cerca ciò che non vede. Su un
   * registro fiscale è il verso giusto in cui sbagliare.
   *
   * Che alcuni ordini manuali possano essere già coperti da una fattura resta
   * la decisione aperta sull'`excluded_invoiced` (`04` §8), e non si risolve
   * nascondendoli.
   */
  protected readonly channelFilter = computed(() => {
    const value = this.queryParams().get('channel');
    return value === 'online' || value === 'pos' ? value : 'all';
  });

  protected readonly onlineOnly = computed(() => this.channelFilter() === 'online');

  protected readonly posOnly = computed(() => this.channelFilter() === 'pos');

  /** Tipo di riga: filtra l'elenco, mai il riepilogo. */
  protected readonly rowTypeFilter = computed(() => {
    const value = this.queryParams().get('rowType') ?? 'all';
    return ROW_TYPE_FILTERS.includes(value) ? value : 'all';
  });

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

  protected readonly channelOptions: readonly SelectMenuOption[] = [
    { value: 'all', label: 'Tutti i canali' },
    { value: 'online', label: 'Shopify' },
    { value: 'pos', label: 'Negozio' },
  ];

  protected readonly rowTypeOptions: readonly SelectMenuOption[] = [
    { value: 'all', label: 'Vendite e rettifiche' },
    { value: 'sales', label: 'Solo vendite' },
    { value: 'returns', label: 'Solo resi' },
    { value: 'refunds', label: 'Solo rimborsi' },
  ];

  /**
   * Solo **classificazioni** fiscali. Gli stati del vecchio flusso di consegna
   * al commercialista — «Da registrare», «Consegnato», «Registrato
   * esternamente» — sono spariti il 16/08/2026 insieme al flusso: VestiFlow
   * non tiene traccia di cosa è già stato mandato, l'operatore sceglie un
   * periodo e stampa o esporta quante volte vuole.
   */
  protected readonly fiscalStatusOptions: readonly SelectMenuOption[] = [
    { value: '', label: 'Tutti gli stati fiscali' },
    { value: SalesOrderFiscalStatus.ExcludedPosRegister, label: 'Escluso (cassa/POS)' },
    { value: SalesOrderFiscalStatus.Invoiced, label: 'Fatturato' },
  ];

  private readonly listQuery = computed(() => ({
    tick: this.refreshTick(),
    placedFrom: this.dateRange().placedFrom,
    placedTo: this.dateRange().placedTo,
    fiscalStatus: this.fiscalStatusFilter(),
    rowType: this.rowTypeFilter() === 'all' ? undefined : this.rowTypeFilter(),
    onlineOnly: this.onlineOnly() || undefined,
    posOnly: this.posOnly() || undefined,
    page: 1,
    pageSize: 100,
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap((query) =>
        combineLatest([
          this.corrispettiviService.listOrders(query),
          this.corrispettiviService.getSummary(query),
        ]).pipe(
          map(([ordersPage, summary]): CorrispettiviState => ({
            status: 'success',
            data: {
              orders: ordersPage.data,
              summary,
              totalOrders: ordersPage.meta.total,
            },
          })),
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
  protected readonly totalOrders = computed(() => this.data()?.totalOrders ?? 0);

  protected onPeriodChange(period: ReportPeriodPreset): void {
    this.uiPeriod.set(period);
    if (period === ReportPeriodPreset.Custom) {
      const today = todayIsoDate();
      this.updateParams({ period, from: today, to: today });
      return;
    }
    // Scegliendo un periodo di calendario si parte da quello corrente: il
    // selettore che compare mostra già un valore sensato invece di restare
    // vuoto in attesa che qualcuno lo riempia.
    if (periodNeedsYear(period)) {
      const now = new Date();
      this.updateParams({
        period,
        from: null,
        to: null,
        year: String(this.query().year ?? now.getUTCFullYear()),
        month:
          period === ReportPeriodPreset.CalendarMonth
            ? String(this.query().month ?? now.getUTCMonth() + 1)
            : null,
        quarter:
          period === ReportPeriodPreset.CalendarQuarter
            ? String(this.query().quarter ?? Math.floor(now.getUTCMonth() / 3) + 1)
            : null,
      });
      return;
    }
    this.updateParams({ period, from: null, to: null, year: null, month: null, quarter: null });
  }

  protected onYearChange(year: number): void {
    this.updateParams({ year: String(year) });
  }

  protected onMonthChange(month: number): void {
    this.updateParams({ month: String(month) });
  }

  protected onQuarterChange(quarter: number): void {
    this.updateParams({ quarter: String(quarter) });
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

  protected onChannelChange(value: string | null): void {
    // «all» è il predefinito: non lo si scrive nell'indirizzo.
    this.updateParams({ channel: !value || value === 'all' ? null : value });
  }

  protected onRowTypeChange(value: string | null): void {
    this.updateParams({ rowType: !value || value === 'all' ? null : value });
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
    void this.router.navigate(['/app/sales/corrispettivi/print'], {
      queryParams: {
        // La stampa deve mostrare quello che si sta guardando: periodo,
        // calendario e canale viaggiano tutti, o si stampa un altro registro.
        period: this.displayPeriod(),
        from: this.query().dateFrom ?? null,
        to: this.query().dateTo ?? null,
        year: this.query().year ?? null,
        month: this.query().month ?? null,
        quarter: this.query().quarter ?? null,
        channel: this.channelFilter() === 'all' ? null : this.channelFilter(),
        rowType: this.rowTypeFilter() === 'all' ? null : this.rowTypeFilter(),
      },
    });
  }

  /**
   * Gli stessi filtri della lista, senza eccezioni.
   *
   * È la ragione per cui questo metodo esiste invece di ricostruire l'oggetto
   * dove serve: il file esportato e la schermata devono rispondere alla stessa
   * domanda, e l'unico modo di garantirlo è che leggano gli stessi campi.
   */
  private exportQuery() {
    return {
      placedFrom: this.dateRange().placedFrom,
      placedTo: this.dateRange().placedTo,
      fiscalStatus: this.fiscalStatusFilter(),
      rowType: this.rowTypeFilter() === 'all' ? undefined : this.rowTypeFilter(),
      onlineOnly: this.onlineOnly() || undefined,
      posOnly: this.posOnly() || undefined,
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
