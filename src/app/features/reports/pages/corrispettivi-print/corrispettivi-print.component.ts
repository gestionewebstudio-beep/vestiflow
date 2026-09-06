import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CorrispettiviOrdersTableComponent } from '../../components/corrispettivi-orders-table/corrispettivi-orders-table.component';
import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import type {
  CorrispettiviRegisterRow,
  CorrispettiviSummary,
} from '../../models/corrispettivi.model';
import {
  corrispettiviFiltersToQuery,
  parseCorrispettiviFilters,
} from '../../models/corrispettivi-filters.util';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  resolveReportDateRange,
} from '@domain/reports/models/report-list-query.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';

interface PrintPageData {
  readonly orders: readonly CorrispettiviRegisterRow[];
  readonly summary: CorrispettiviSummary;
}

type PrintState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: PrintPageData }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-corrispettivi-print',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    CorrispettiviOrdersTableComponent,
    CorrispettiviSummaryComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './corrispettivi-print.component.html',
  styleUrl: './corrispettivi-print.component.scss',
})
export class CorrispettiviPrintComponent {
  private readonly corrispettiviService = inject(CorrispettiviService);
  private readonly route = inject(ActivatedRoute);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed(() => parseReportListQuery(this.queryParams()));
  protected readonly periodLabel = computed(() => formatReportPeriodLabel(this.query()));

  protected readonly dateRange = computed(() => resolveReportDateRange(this.query()));

  /**
   * ⚠️ **La stampa deve rispondere alla STESSA domanda della schermata.**
   *
   * Qui c'erano il solo periodo e un `onlineOnly` che nessuno mandava più — non
   * un filtro sbagliato: un campo inerte, che l'API non conosce e che
   * `buildParams` non scriveva nemmeno nella richiesta. Ambito, canale, tipo e
   * sede viaggiavano nell'indirizzo e non venivano letti: chi guardava
   * «2° trimestre · Fisico/POS · Resi» stampava tutto il trimestre.
   *
   * Ora i filtri si leggono da `parseCorrispettiviFilters`, lo stesso punto da
   * cui li legge il Registro: due letture della stessa cosa divergono sempre.
   */
  private readonly filters = computed(() => parseCorrispettiviFilters(this.queryParams()));

  private readonly listQuery = computed(() => ({
    placedFrom: this.dateRange().placedFrom,
    placedTo: this.dateRange().placedTo,
    ...corrispettiviFiltersToQuery(this.filters()),
    page: 1,
    pageSize: 500,
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap((query) =>
        combineLatest([
          this.corrispettiviService.listOrders(query),
          this.corrispettiviService.getSummary(query),
        ]).pipe(
          map(([ordersPage, summary]): PrintState => ({
            status: 'success',
            data: { orders: ordersPage.data, summary },
          })),
          startWith<PrintState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<PrintState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies PrintState },
  );

  constructor() {
    effect(() => {
      const current = this.state();
      if (current.status === 'success') {
        queueMicrotask(() => globalThis.print());
      }
    });
  }

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

  protected print(): void {
    globalThis.print();
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
