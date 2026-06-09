import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Location } from '@core/models/location.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryService } from '@features/inventory/services/inventory.service';

import { SupplierOrderLinesTableComponent } from './components/supplier-order-lines-table/supplier-order-lines-table.component';
import {
  supplierOrderStatusLabel,
  supplierOrderStatusTone,
} from './models/supplier-order-labels.util';
import { SupplierOrderService } from './services/supplier-order.service';

interface DetailData {
  readonly order: SupplierOrder;
  readonly locations: readonly Location[];
}

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: DetailData }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/** Dettaglio ordine fornitore read-only (smart): dati ordine e righe. */
@Component({
  selector: 'app-supplier-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SupplierOrderLinesTableComponent,
  ],
  templateUrl: './supplier-order-detail.component.html',
  styleUrl: './supplier-order-detail.component.scss',
})
export class SupplierOrderDetailComponent {
  private readonly service = inject(SupplierOrderService);
  private readonly inventoryService = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = '/app/orders';
  protected readonly skeletonColumns = 4;

  protected readonly statusLabel = supplierOrderStatusLabel;
  protected readonly statusTone = supplierOrderStatusTone;
  protected readonly formatMoney = formatMoney;

  private readonly refreshTick = signal(0);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        forkJoin({
          order: this.service.getSupplierOrderById(id),
          locations: this.inventoryService.getLocations(),
        }).pipe(
          map((data): DetailState => ({ status: 'success', data })),
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
    return current.status === 'success' ? current.data.order : null;
  });

  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    const { order, locations } = current.data;
    const destination =
      locations.find((location) => location.storeId === order.storeId)?.name ?? order.storeId;
    return [
      { label: 'Fornitore', value: order.supplierName },
      { label: 'Destinazione', value: destination },
      { label: 'Valuta', value: order.currency },
      {
        label: 'Attesa il',
        value: order.expectedAt ? formatDate(order.expectedAt) : '—',
        numeric: true,
      },
      { label: 'Creato il', value: formatDate(order.createdAt), numeric: true },
      { label: 'Aggiornato il', value: formatDate(order.updatedAt), numeric: true },
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
