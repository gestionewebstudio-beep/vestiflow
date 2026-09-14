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
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { AuthService } from '@core/auth';
import {
  businessAnalyticsPricingHint,
  businessAnalyticsRevenueHint,
} from '@core/models/tenant-channel-profile.model';
import { LocationContextService } from '@core/services/location-context.service';
import { formatMoney } from '@core/utils/money.util';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { StatCardComponent } from '@shared/components/stat-card/stat-card.component';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import type { SegmentedOption } from '@shared/components/segmented/segmented.component';

import {
  DEFAULT_REPORT_PERIOD,
  formatReportPeriodLabel,
  ReportPeriodPreset,
} from '@domain/reports/models/report-list-query.model';

import type { BusinessAnalyticsSummary } from '../../models/business-analytics.model';
import { BusinessAnalyticsService } from '../../services/business-analytics.service';
import { BusinessAnalyticsChartsComponent } from '../business-analytics-charts/business-analytics-charts.component';
import {
  changeTrendTone,
  forecastHint,
  formatChangePercent,
  formatMarginValue,
  formatMarginPercentSuffix,
  formatPercentSuffix,
  marginHint,
  moneyMinor,
} from '../../utils/business-analytics-display.util';

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: BusinessAnalyticsSummary }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Pannello analytics condiviso (Dashboard e Report): KPI vendite, margini,
 * previsioni e breakdown per canale/prodotto.
 */
@Component({
  selector: 'app-business-analytics-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StatCardComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SegmentedComponent,
    DateInputComponent,
    BusinessAnalyticsChartsComponent,
    DataTableComponent,
    DataTableRowCardDirective,
  ],
  templateUrl: './business-analytics-panel.component.html',
  styleUrl: './business-analytics-panel.component.scss',
})
export class BusinessAnalyticsPanelComponent {
  private readonly analyticsService = inject(BusinessAnalyticsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly authService = inject(AuthService);

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );
  protected readonly pricingHint = computed(() =>
    businessAnalyticsPricingHint(this.tenantProfile()),
  );
  protected readonly revenueHint = computed(() =>
    businessAnalyticsRevenueHint(this.tenantProfile()),
  );

  /** `dashboard` mostra tabelle compatte; `reports` espande dettagli. */
  readonly layout = input<'dashboard' | 'reports'>('dashboard');

  /** Nasconde il selettore periodo (Report: segue corrispettivi). */
  readonly hidePeriodFilter = input(false);

  /** Periodo controllato dal parent (es. Report corrispettivi). */
  readonly period = input<ReportPeriodPreset>(DEFAULT_REPORT_PERIOD);
  readonly dateFrom = input<string>('');
  readonly dateTo = input<string>('');

  private readonly refreshTick = signal(0);
  private readonly uiPeriod = signal<ReportPeriodPreset | null>(null);
  private readonly internalDateFrom = signal('');
  private readonly internalDateTo = signal('');

  constructor() {
    effect(() => {
      this.period();
      this.dateFrom();
      this.dateTo();
      this.uiPeriod.set(null);
    });
  }

  protected readonly displayPeriod = computed(() => {
    if (this.uiPeriod()) {
      return this.uiPeriod()!;
    }
    if (this.layout() === 'dashboard') {
      return DEFAULT_REPORT_PERIOD;
    }
    return this.period();
  });

  protected readonly effectiveDateFrom = computed(() =>
    this.layout() === 'reports' ? this.dateFrom() : this.internalDateFrom(),
  );

  protected readonly effectiveDateTo = computed(() =>
    this.layout() === 'reports' ? this.dateTo() : this.internalDateTo(),
  );

  protected readonly periodLabel = computed(() =>
    formatReportPeriodLabel({
      period: this.displayPeriod(),
      dateFrom: this.effectiveDateFrom() || undefined,
      dateTo: this.effectiveDateTo() || undefined,
    }),
  );

  /**
   * Periodo come controllo segmented (mockup 1a/2a). Etichette brevi per stare
   * in riga: i preset e il comportamento restano quelli del select precedente,
   * «Personalizzato» incluso (mostra le date puntuali).
   */
  protected readonly periodOptions: readonly SegmentedOption[] = [
    { value: ReportPeriodPreset.Last7Days, label: '7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: '30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  protected readonly showCustomDates = computed(
    () => this.displayPeriod() === ReportPeriodPreset.Custom,
  );

  private readonly request = computed(() => ({
    tick: this.refreshTick(),
    period: this.displayPeriod(),
    from: this.effectiveDateFrom(),
    to: this.effectiveDateTo(),
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
            map((data): PanelState => ({ status: 'success', data })),
            startWith<PanelState>({ status: 'loading' }),
            catchError((err: unknown) =>
              of<PanelState>({ status: 'error', error: this.toAppError(err) }),
            ),
          ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies PanelState },
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

  protected readonly revenueLabel = computed(() => {
    const data = this.summary();
    if (!data) {
      return '—';
    }
    return formatMoney(moneyMinor(data.revenue.totalMinor, data.currencyCode));
  });

  protected readonly revenueTrend = computed(() =>
    formatChangePercent(this.summary()?.revenue.changePercent ?? null),
  );

  protected readonly revenueTrendTone = computed(() =>
    changeTrendTone(this.summary()?.revenue.changePercent ?? null),
  );

  protected readonly marginLabel = computed(() => {
    const data = this.summary();
    return data ? formatMarginValue(data) : '—';
  });

  protected readonly marginPercentSuffix = computed(() => {
    const data = this.summary();
    return data ? formatMarginPercentSuffix(data) : null;
  });

  protected readonly marginHintText = computed(() => {
    const data = this.summary();
    return data ? marginHint(data) : '';
  });

  protected readonly avgTicketLabel = computed(() => {
    const data = this.summary();
    if (!data?.sales.avgTicketMinor) {
      return '—';
    }
    return formatMoney(moneyMinor(data.sales.avgTicketMinor, data.currencyCode));
  });

  protected readonly projectedRevenueLabel = computed(() => {
    const data = this.summary();
    if (!data) {
      return '—';
    }
    return formatMoney(moneyMinor(data.forecast.projectedMonthRevenueMinor, data.currencyCode));
  });

  protected readonly forecastHintText = computed(() => {
    const data = this.summary();
    return data ? forecastHint(data) : '';
  });

  protected readonly stockValueLabel = computed(() => {
    const data = this.summary();
    if (!data) {
      return '—';
    }
    return formatMoney(moneyMinor(data.inventory.stockValueMinor, data.currencyCode));
  });

  protected readonly stockMarginLabel = computed(() => {
    const data = this.summary();
    if (!data?.inventory.stockMarginMinor || data.inventory.stockMarginPercent === null) {
      return '—';
    }
    return formatMoney(moneyMinor(data.inventory.stockMarginMinor, data.currencyCode));
  });

  protected readonly stockMarginPercentSuffix = computed(() => {
    const data = this.summary();
    if (
      data?.inventory.stockMarginPercent === null ||
      data?.inventory.stockMarginPercent === undefined
    ) {
      return null;
    }
    return formatPercentSuffix(data.inventory.stockMarginPercent);
  });

  protected readonly channelRows = computed(() => {
    const data = this.summary();
    if (!data) {
      return [];
    }
    return data.channels.map((row) => ({
      ...row,
      revenueLabel: formatMoney(moneyMinor(row.revenueMinor, data.currencyCode)),
    }));
  });

  protected readonly topProductRows = computed(() => {
    const data = this.summary();
    if (!data) {
      return [];
    }
    const limit = this.layout() === 'dashboard' ? 5 : 10;
    return data.topProducts.slice(0, limit).map((row) => ({
      ...row,
      revenueLabel: formatMoney(moneyMinor(row.revenueMinor, data.currencyCode)),
    }));
  });

  // ── Le due tabelle, sul MOTORE comune (`docs/26` A12) ────────────────────
  // Erano due `<table>` a mano con la stessa griglia. Senza vista di colonne né
  // filtri: un riepilogo per canale e i primi dieci prodotti non si filtrano.
  // ⭐ I canali hanno la riga totali (la somma dei canali È il fatturato del
  //    periodo, e deve tornare col dato in alto); i top prodotti no — la somma
  //    dei primi dieci non è un numero che dica qualcosa.
  protected readonly ordineCanali = signal<readonly DataTableSort[]>([]);
  protected readonly ordineTop = signal<readonly DataTableSort[]>([]);

  protected readonly colonneCanali: readonly ResolvedTableColumn[] = [
    { id: 'channel', label: 'Canale', defaultVisible: true, cardTitle: true, pinned: false },
    {
      id: 'unitsSold',
      label: 'Pezzi',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 100,
      pinned: false,
    },
    {
      id: 'revenue',
      label: 'Fatturato',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 140,
      pinned: false,
    },
  ];
  protected readonly colonneTop: readonly ResolvedTableColumn[] = [
    {
      ...colonna('sku', { display: 'code', defaultVisible: true, defaultWidthPx: 150 }),
      pinned: false,
    },
    { id: 'product', label: 'Prodotto', defaultVisible: true, cardTitle: true, pinned: false },
    {
      id: 'unitsSold',
      label: 'Pezzi',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 100,
      pinned: false,
    },
    {
      id: 'revenue',
      label: 'Fatturato',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 140,
      pinned: false,
    },
  ];

  protected readonly rigaCanaleId = (row: { readonly channel: string }): string => row.channel;
  // L'id di riga è la variante: due prodotti senza SKU avevano lo stesso id (13/09/2026).
  protected readonly rigaTopId = (row: { readonly variantId: string }): string => row.variantId;

  protected readonly testoCanale = (
    row: { readonly label: string; readonly unitsSold: number; readonly revenueLabel: string },
    colonna: string,
  ): string => {
    switch (colonna) {
      case 'channel':
        return row.label;
      case 'unitsSold':
        return String(row.unitsSold);
      case 'revenue':
        return row.revenueLabel;
      default:
        return '';
    }
  };
  protected readonly testoTop = (
    row: {
      readonly sku: string;
      readonly title: string;
      readonly unitsSold: number;
      readonly revenueLabel: string;
    },
    colonna: string,
  ): string => {
    switch (colonna) {
      case 'sku':
        return row.sku;
      case 'product':
        return row.title;
      case 'unitsSold':
        return String(row.unitsSold);
      case 'revenue':
        return row.revenueLabel;
      default:
        return '';
    }
  };
  // ⚠️ Pezzi e fatturato si ordinano sul VALORE, non sul testo formattato.
  private readonly numeroDi = (
    row: { readonly unitsSold: number; readonly revenueMinor: number },
    colonna: string,
  ): number | null =>
    colonna === 'unitsSold' ? row.unitsSold : colonna === 'revenue' ? row.revenueMinor : null;

  protected readonly sezioniCanali = computed(
    (): readonly DataTableSection<ReturnType<typeof this.channelRows>[number]>[] => [
      {
        id: 'canali',
        rows: ordinaPerColonne(this.channelRows(), this.ordineCanali(), {
          cellText: this.testoCanale,
          numeroDi: this.numeroDi,
        }),
      },
    ],
  );
  protected readonly sezioniTop = computed(
    (): readonly DataTableSection<ReturnType<typeof this.topProductRows>[number]>[] => [
      {
        id: 'top',
        rows: ordinaPerColonne(this.topProductRows(), this.ordineTop(), {
          cellText: this.testoTop,
          numeroDi: this.numeroDi,
        }),
      },
    ],
  );
  protected readonly totaliCanali = computed<DataTableTotals>(() => {
    const valuta = this.summary()?.currencyCode ?? 'EUR';
    return totaliDiElenco(this.channelRows(), {
      rowId: this.rigaCanaleId,
      selectedIds: new Set<string>(),
      columns: this.colonneCanali,
      campi: {
        unitsSold: { valore: (r) => r.unitsSold, formato: String },
        revenue: {
          valore: (r) => r.revenueMinor,
          formato: (n) => formatMoney(moneyMinor(n, valuta)),
        },
      },
    });
  });

  protected readonly unitsSoldLabel = computed(() => String(this.summary()?.sales.unitsSold ?? 0));

  protected readonly transactionCountLabel = computed(() =>
    String(this.summary()?.sales.transactionCount ?? 0),
  );

  protected readonly availableUnitsLabel = computed(() =>
    String(this.summary()?.inventory.availableUnits ?? 0),
  );

  protected readonly lowStockCountLabel = computed(() =>
    String(this.summary()?.inventory.lowStockCount ?? 0),
  );

  protected onPeriodChange(value: string | null): void {
    if (!value || !this.isPeriodPreset(value)) {
      return;
    }
    this.uiPeriod.set(value);
    if (value === ReportPeriodPreset.Custom && this.layout() === 'dashboard') {
      const today = new Date().toISOString().slice(0, 10);
      this.internalDateFrom.set(today);
      this.internalDateTo.set(today);
    }
  }

  protected onDateFromChange(value: string): void {
    if (this.layout() === 'dashboard') {
      this.internalDateFrom.set(value);
      this.uiPeriod.set(ReportPeriodPreset.Custom);
    }
  }

  protected onDateToChange(value: string): void {
    if (this.layout() === 'dashboard') {
      this.internalDateTo.set(value);
      this.uiPeriod.set(ReportPeriodPreset.Custom);
    }
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
