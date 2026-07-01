import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CorrispettiviOrdersTableComponent } from '../../components/corrispettivi-orders-table/corrispettivi-orders-table.component';
import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import type { CorrispettiviOrder, CorrispettiviSummary } from '../../models/corrispettivi.model';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  resolveReportDateRange,
} from '../../models/report-list-query.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';

interface PrintPageData {
  readonly orders: readonly CorrispettiviOrder[];
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
    RouterLink,
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

  private readonly listQuery = computed(() => ({
    placedFrom: this.dateRange().placedFrom,
    placedTo: this.dateRange().placedTo,
    onlineOnly: this.queryParams().get('onlineOnly') !== '0',
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
          map(
            ([ordersPage, summary]): PrintState => ({
              status: 'success',
              data: { orders: ordersPage.data, summary },
            }),
          ),
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
