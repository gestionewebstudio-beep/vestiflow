import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { AuthService } from '@core/auth';
import {
  canManageDocuments,
  canManageSupplierOrders,
  canReceiveSupplierOrders,
} from '@core/permissions/tenant-permissions.util';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder, SupplierOrderLinkedDocument } from '@core/models/supplier-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

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

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly order: SupplierOrder }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dettaglio ordine fornitore read-only (smart): dati ordine, righe e
 * collegamento visibile agli Arrivi merce agganciati (stato Concluso).
 */
@Component({
  selector: 'app-supplier-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SupplierOrderLinesTableComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './supplier-order-detail.component.html',
  styleUrl: './supplier-order-detail.component.scss',
})
export class SupplierOrderDetailComponent {
  private readonly service = inject(SupplierOrderService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/orders';
  protected readonly skeletonColumns = 4;

  protected readonly statusLabel = supplierOrderStatusLabel;
  protected readonly statusTone = supplierOrderStatusTone;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  private readonly refreshTick = signal(0);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.getSupplierOrderById(id).pipe(
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

  /** Arrivi merce attivi agganciati: il collegamento è visibile nel documento. */
  protected readonly linkedDocuments = computed<readonly SupplierOrderLinkedDocument[]>(
    () => this.order()?.linkedDocuments ?? [],
  );

  protected linkedDocumentLabel(linked: SupplierOrderLinkedDocument): string {
    const identifier =
      linked.reference ?? (linked.number != null ? `n. ${linked.number}` : linked.id);
    return `Arrivo merce ${identifier} del ${formatDate(linked.documentDate)}`;
  }

  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const order = this.order();
    if (!order) {
      return [];
    }
    return [
      { label: 'Fornitore', value: order.supplierName },
      { label: 'Data', value: formatDate(order.orderDate), numeric: true },
      {
        label: 'Consegna prevista',
        value: order.expectedAt ? formatDate(order.expectedAt) : '—',
        numeric: true,
      },
      { label: 'Rif. ordine fornitore', value: order.supplierReference || '—' },
      { label: 'Valuta', value: order.currency },
      { label: 'Creato il', value: formatDate(order.createdAt), numeric: true },
      { label: 'Aggiornato il', value: formatDate(order.updatedAt), numeric: true },
    ];
  });

  protected readonly canEdit = computed(
    () =>
      this.order()?.status === SupplierOrderStatus.Confirmed &&
      canManageSupplierOrders(this.authService.currentUser()),
  );
  protected readonly canCancel = computed(
    () =>
      this.order()?.status === SupplierOrderStatus.Confirmed &&
      canManageSupplierOrders(this.authService.currentUser()),
  );
  protected readonly canDelete = computed(
    () =>
      this.order()?.status === SupplierOrderStatus.Cancelled &&
      canManageSupplierOrders(this.authService.currentUser()),
  );
  /** «Crea arrivo merce» dall'ordine: solo ordini Confermati (non conclusi). */
  protected readonly canCreateGoodsReceipt = computed(() => {
    if (!canReceiveSupplierOrders(this.authService.currentUser())) {
      return false;
    }
    if (!canManageDocuments(this.authService.currentUser())) {
      return false;
    }
    return this.order()?.status === SupplierOrderStatus.Confirmed;
  });

  protected readonly goodsReceiptDialogOpen = signal(false);

  private readonly _actionState = signal<ActionState>({ status: 'idle' });
  protected readonly actionSaving = computed(() => this._actionState().status === 'saving');
  protected readonly actionError = computed(() => {
    const state = this._actionState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly cancelDialogOpen = signal(false);
  protected readonly deleteDialogOpen = signal(false);

  protected readonly downloadingPdf = signal(false);

  private actionSubscription: Subscription | null = null;
  private pdfSubscription: Subscription | null = null;

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  protected requestCreateGoodsReceipt(): void {
    this.goodsReceiptDialogOpen.set(true);
  }

  /**
   * «Crea arrivo merce» (flusso 3 del prompt): apre un nuovo Arrivo merce con
   * l'ordine pre-agganciato via ?supplierOrderId=…; righe residue e testata
   * vengono copiate dal form. Al salvataggio l'ordine diventa Concluso e il
   * collegamento resta visibile in entrambi i documenti.
   */
  protected createGoodsReceipt(): void {
    this.goodsReceiptDialogOpen.set(false);
    const order = this.order();
    if (!order) {
      return;
    }
    void this.router.navigate(['/app/documents/goods-receipt/new'], {
      queryParams: { supplierOrderId: order.id },
    });
  }

  /**
   * Scarica il PDF dell'ordine (stesso pattern blob-download dei documenti).
   * Disponibile in ogni stato: il PDF riflette solo dati reali già visibili
   * a chi ha il permesso di vista, quindi nessuna restrizione.
   */
  protected downloadPdf(): void {
    const order = this.order();
    if (!order || this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    this.pdfSubscription = this.service
      .exportPdf(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          this.downloadBlob(blob, `ordine-fornitore-${order.reference}.pdf`);
        },
        error: (err: unknown) => {
          this.downloadingPdf.set(false);
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^\w\s.-]/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected goToEdit(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    void this.router.navigateByUrl(`${this.listPath}/${order.id}/edit`);
  }

  protected requestCancel(): void {
    this.cancelDialogOpen.set(true);
  }

  protected requestDelete(): void {
    this.deleteDialogOpen.set(true);
  }

  protected cancelOrder(): void {
    const order = this.order();
    if (!order || this.actionSaving()) {
      return;
    }
    this.cancelDialogOpen.set(false);
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .cancelOrder(order.id)
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

  protected removeOrder(): void {
    const order = this.order();
    if (!order || this.actionSaving()) {
      return;
    }
    this.deleteDialogOpen.set(false);
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .deleteOrder(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._actionState.set({ status: 'idle' });
          void this.router.navigateByUrl(this.listPath);
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
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
