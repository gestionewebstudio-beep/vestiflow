import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { formatDateTime } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SalesOrderLinesTableComponent } from './components/sales-order-lines-table/sales-order-lines-table.component';
import {
  financialStatusLabel,
  financialStatusTone,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  sourceLabel,
} from './models/sales-order-labels.util';
import { salesOrderShopifyDetailFact } from './models/sales-order-shopify-fact.util';
import { SalesOrderService } from './services/sales-order.service';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly order: SalesOrder }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/** Dettaglio vendita read-only (smart): snapshot ordine, righe e totali. */
@Component({
  selector: 'app-sales-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SalesOrderLinesTableComponent,
  ],
  templateUrl: './sales-order-detail.component.html',
  styleUrl: './sales-order-detail.component.scss',
})
export class SalesOrderDetailComponent {
  private readonly service = inject(SalesOrderService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = '/app/sales';
  protected readonly skeletonColumns = 4;

  protected readonly financialLabel = financialStatusLabel;
  protected readonly financialTone = financialStatusTone;
  protected readonly fulfillmentLabel = fulfillmentStatusLabel;
  protected readonly fulfillmentTone = fulfillmentStatusTone;
  protected readonly formatMoney = formatMoney;

  private readonly refreshTick = signal(0);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.getSalesOrderById(id).pipe(
          map((order): DetailState => ({ status: 'success', order })),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.errorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly order = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.order : null;
  });

  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const order = this.order();
    if (!order) {
      return [];
    }
    return [
      { label: 'Data ordine', value: formatDateTime(order.placedAt), numeric: true },
      { label: 'Canale', value: sourceLabel(order.source) },
      { label: 'Cliente', value: order.customerName },
      { label: 'Email', value: order.customerEmail ?? '—' },
      { label: 'Valuta', value: order.currency },
      salesOrderShopifyDetailFact(order.shopify, this.shopifyConnection()?.shopDomain),
    ];
  });

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  private errorToState(err: unknown): DetailState {
    const appError = this.toAppError(err);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
