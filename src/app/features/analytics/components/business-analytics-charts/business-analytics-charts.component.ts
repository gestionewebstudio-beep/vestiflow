import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { LocationContextService } from '@core/services/location-context.service';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import {
  DEFAULT_REPORT_PERIOD,
  formatReportPeriodLabel,
  ReportPeriodPreset,
} from '@features/reports/models/report-list-query.model';

import type { BusinessAnalyticsSummary } from '../../models/business-analytics.model';
import { BusinessAnalyticsService } from '../../services/business-analytics.service';
import {
  buildChannelDoughnutChart,
  buildDailyRevenueLineChart,
  buildTopProductsBarChart,
  hasDailyRevenueData,
} from '../../utils/business-analytics-charts.util';

type ChartsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: BusinessAnalyticsSummary }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Grafici analytics con filtro periodo dedicato (ng2-charts / Chart.js).
 */
@Component({
  selector: 'app-business-analytics-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BaseChartDirective,
    SelectMenuComponent,
    DateInputComponent,
    TableSkeletonComponent,
    ErrorStateComponent,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './business-analytics-charts.component.html',
  styleUrl: './business-analytics-charts.component.scss',
})
export class BusinessAnalyticsChartsComponent {
  private readonly analyticsService = inject(BusinessAnalyticsService);
  private readonly locationContext = inject(LocationContextService);

  /** Valore iniziale allineato al periodo del report (poi indipendente). */
  readonly initialPeriod = input<ReportPeriodPreset>(DEFAULT_REPORT_PERIOD);
  readonly initialDateFrom = input('');
  readonly initialDateTo = input('');

  private readonly filtersInitialized = signal(false);
  private readonly refreshTick = signal(0);
  protected readonly chartPeriod = signal<ReportPeriodPreset>(DEFAULT_REPORT_PERIOD);
  protected readonly chartDateFrom = signal('');
  protected readonly chartDateTo = signal('');

  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: ReportPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  constructor() {
    effect(() => {
      if (this.filtersInitialized()) {
        return;
      }
      this.chartPeriod.set(this.initialPeriod());
      this.chartDateFrom.set(this.initialDateFrom());
      this.chartDateTo.set(this.initialDateTo());
      this.filtersInitialized.set(true);
    });
  }

  protected readonly showCustomDates = computed(
    () => this.chartPeriod() === ReportPeriodPreset.Custom,
  );

  protected readonly periodLabel = computed(() =>
    formatReportPeriodLabel({
      period: this.chartPeriod(),
      dateFrom: this.chartDateFrom() || undefined,
      dateTo: this.chartDateTo() || undefined,
    }),
  );

  private readonly request = computed(() => ({
    tick: this.refreshTick(),
    period: this.chartPeriod(),
    from: this.chartDateFrom(),
    to: this.chartDateTo(),
    locationId: this.locationContext.activeLocationId(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ period, from, to, locationId }) =>
        this.analyticsService
          .getSummary({
            period,
            from: period === ReportPeriodPreset.Custom ? from || undefined : undefined,
            to: period === ReportPeriodPreset.Custom ? to || undefined : undefined,
            locationId: locationId ?? undefined,
          })
          .pipe(
            map((data): ChartsState => ({ status: 'success', data })),
            startWith<ChartsState>({ status: 'loading' }),
            catchError((err: unknown) =>
              of<ChartsState>({ status: 'error', error: this.toAppError(err) }),
            ),
          ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ChartsState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly summary = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  protected readonly hasRevenueTrend = computed(() => {
    const data = this.summary();
    return data ? hasDailyRevenueData(data) : false;
  });

  protected readonly dailyLineChart = computed(() => {
    const data = this.summary();
    return data ? buildDailyRevenueLineChart(data) : null;
  });

  protected readonly channelChart = computed(() => {
    const data = this.summary();
    return data ? buildChannelDoughnutChart(data) : null;
  });

  protected readonly topProductsChart = computed(() => {
    const data = this.summary();
    return data ? buildTopProductsBarChart(data) : null;
  });

  protected onPeriodChange(value: string | null): void {
    if (!value || !this.isPeriodPreset(value)) {
      return;
    }
    this.chartPeriod.set(value);
    if (value === ReportPeriodPreset.Custom) {
      const today = todayIsoDate();
      this.chartDateFrom.set(this.chartDateFrom() || today);
      this.chartDateTo.set(this.chartDateTo() || today);
    }
  }

  protected onDateFromChange(value: string): void {
    this.chartDateFrom.set(value);
    this.chartPeriod.set(ReportPeriodPreset.Custom);
  }

  protected onDateToChange(value: string): void {
    this.chartDateTo.set(value);
    this.chartPeriod.set(ReportPeriodPreset.Custom);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  private isPeriodPreset(value: string): value is ReportPeriodPreset {
    return Object.values(ReportPeriodPreset).includes(value as ReportPeriodPreset);
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
