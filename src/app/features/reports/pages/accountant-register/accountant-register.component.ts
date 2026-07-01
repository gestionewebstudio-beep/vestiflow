import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { formatMoney } from '@core/utils/money.util';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { ReportCorrispettiviExportComponent } from '../../components/report-corrispettivi-export/report-corrispettivi-export.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import {
  buildAccountantDocumentsListQuery,
  buildPendingInvoiceDocumentsListQuery,
  type AccountantRegisterSummary,
} from '../../models/accountant-register.model';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  ReportPeriodPreset,
  resolveReportDateRange,
} from '../../models/report-list-query.model';
import { AccountantRegisterService } from '../../services/accountant-register.service';

type RegisterTab = 'documents' | 'corrispettivi';

type PageState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: AccountantRegisterSummary }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-accountant-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CorrispettiviSummaryComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ReportCorrispettiviExportComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './accountant-register.component.html',
  styleUrl: './accountant-register.component.scss',
})
export class AccountantRegisterComponent {
  private readonly service = inject(AccountantRegisterService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly refreshTick = signal(0);
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly uiPeriod = signal<ReportPeriodPreset | null>(null);
  protected readonly activeTab = signal<RegisterTab>('documents');

  protected readonly formatMoney = formatMoney;

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

  protected readonly documentsListQuery = computed(() =>
    buildAccountantDocumentsListQuery(this.dateRange().placedFrom, this.dateRange().placedTo),
  );

  protected readonly pendingInvoiceListQuery = computed(() =>
    buildPendingInvoiceDocumentsListQuery(this.dateRange().placedFrom, this.dateRange().placedTo),
  );

  private readonly listQuery = computed(() => ({
    tick: this.refreshTick(),
    dateFrom: this.dateRange().placedFrom,
    dateTo: this.dateRange().placedTo,
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap((query) =>
        this.service.getSummary(query).pipe(
          map((summary): PageState => ({ status: 'success', summary })),
          startWith<PageState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<PageState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies PageState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly summary = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.summary : null;
  });

  protected readonly documentsSummary = computed(() => this.summary()?.documents ?? null);
  protected readonly corrispettiviSummary = computed(() => this.summary()?.corrispettivi ?? null);

  protected setTab(tab: RegisterTab): void {
    this.activeTab.set(tab);
  }

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
