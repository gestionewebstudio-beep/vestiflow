import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Location } from '@core/models/location.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder, SupplierOrderLine } from '@core/models/supplier-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
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

type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

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
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
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
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

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
      locations.find((location) => location.id === order.destinationLocationId)?.name ??
      order.destinationLocationId;
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

  protected readonly canSend = computed(() => this.order()?.status === SupplierOrderStatus.Draft);
  protected readonly canReceive = computed(() => {
    const status = this.order()?.status;
    return status === SupplierOrderStatus.Sent || status === SupplierOrderStatus.PartiallyReceived;
  });

  // Fase: visualizzazione vs ricezione merce (azione sensibile, conferma esplicita).
  private readonly _mode = signal<'view' | 'receive'>('view');
  protected readonly mode = this._mode.asReadonly();

  private readonly _actionState = signal<ActionState>({ status: 'idle' });
  protected readonly actionSaving = computed(() => this._actionState().status === 'saving');
  protected readonly actionError = computed(() => {
    const state = this._actionState();
    return state.status === 'error' ? state.error : null;
  });

  readonly receiveForm = this.fb.group({
    rows: this.fb.array<ReturnType<SupplierOrderDetailComponent['createReceiveRow']>>([]),
  });

  protected get receiveRows(): FormArray<
    ReturnType<SupplierOrderDetailComponent['createReceiveRow']>
  > {
    return this.receiveForm.controls.rows;
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  protected remaining(line: SupplierOrderLine): number {
    return Math.max(0, line.orderedQuantity - line.receivedQuantity);
  }

  protected startReceive(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this._actionState.set({ status: 'idle' });
    this.receiveRows.clear();
    for (const line of order.lines) {
      this.receiveRows.push(this.createReceiveRow(line));
    }
    this._mode.set('receive');
  }

  protected cancelReceive(): void {
    this._mode.set('view');
  }

  private actionSubscription: Subscription | null = null;

  protected sendOrder(): void {
    const order = this.order();
    if (!order || this.actionSaving()) {
      return;
    }
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .sendOrder(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._actionState.set({ status: 'idle' });
          this.reload();
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected confirmReceive(): void {
    const order = this.order();
    if (!order || this.actionSaving()) {
      return;
    }
    const lines = this.receiveRows.controls
      .map((row) => ({
        lineId: row.controls.lineId.value,
        quantity: Number(row.controls.quantity.value),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

    if (lines.length === 0) {
      this._actionState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Inserisci almeno una quantità da ricevere.',
        },
      });
      return;
    }

    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .receiveOrder(order.id, lines)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._actionState.set({ status: 'idle' });
          this._mode.set('view');
          this.inventoryService.invalidateLocationsCache();
          this.reload();
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private createReceiveRow(line: SupplierOrderLine) {
    const remaining = this.remaining(line);
    return this.fb.group({
      lineId: this.fb.control(line.id),
      sku: this.fb.control(line.sku),
      remaining: this.fb.control(remaining),
      quantity: this.fb.control(remaining, {
        validators: [Validators.min(0), Validators.max(remaining), Validators.pattern(/^\d+$/)],
      }),
    });
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
