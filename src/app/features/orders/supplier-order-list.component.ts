import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import {
  FILTERED_SCOPE_NOT_AVAILABLE,
  type ListAction,
  type ListActionTarget,
} from '@shared/models/list-selection.model';
import {
  serializeDataTableSort,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { createListSelection } from '@shared/utils/list-selection';
import { downloadBlob } from '@shared/utils/download-blob.util';
import {
  buildListCsv,
  buildListPrintHtml,
  listExportFileName,
} from '@shared/utils/list-export.util';
import { SUPPLIER_ORDER_LIST_EXPORT } from './utils/supplier-order-list-export.util';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import type { PageMeta } from '@core/models/api.model';
import { AuthService } from '@core/auth';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSelectionEvent } from '@shared/components/data-table/data-table.component';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import {
  supplierOrderStatusLabel,
  supplierOrderStatusTone,
} from './models/supplier-order-labels.util';
import {
  DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
  SUPPLIER_ORDER_PAGE_SIZE_OPTIONS,
  parseSupplierOrderListQuery,
} from '@domain/supplier-orders/models/supplier-order-list-query.model';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type OrderListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly orders: readonly SupplierOrder[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Lista ordini fornitori (smart). URL come fonte di verita' (page, search, status).
 */
@Component({
  selector: 'app-supplier-order-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    ListActionsBarComponent,
    BadgeComponent,
    DataTableCellDirective,
    DataTableComponent,
  ],
  templateUrl: './supplier-order-list.component.html',
  styleUrl: './supplier-order-list.component.scss',
})
export class SupplierOrderListComponent {
  private readonly service = inject(SupplierOrderService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canManageSupplierOrders = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  protected readonly skeletonColumns = 5;
  protected readonly pageSizeOptions = SUPPLIER_ORDER_PAGE_SIZE_OPTIONS;

  protected readonly statusOptions: readonly SelectMenuOption[] = [
    { value: 'confirmed', label: 'Confermato' },
    { value: 'concluded', label: 'Concluso' },
    { value: 'cancelled', label: 'Annullato' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseSupplierOrderListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({
    // Le chiavi non supportate escono qui, prima della rete: l'URL è un posto
    // che chiunque può scrivere, il 400 lo prenderebbe l'operatore.
    query: { ...this.query(), sort: this.sortRichiesto() },
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getSupplierOrders(query).pipe(
          map((response): OrderListState => ({
            status: 'success',
            orders: response.data,
            meta: response.meta,
          })),
          startWith<OrderListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<OrderListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies OrderListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly orders = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.orders : [];
  });

  // ── Selezione e azioni contestuali (`14` §5, parte D) ─────────────────────
  private readonly selection = createListSelection('multiple');
  protected readonly selectedIds = this.selection.ids;
  protected readonly selectionCount = this.selection.count;
  protected readonly excelBusy = signal(false);

  /** Errore di un'AZIONE, distinto da quello del caricamento elenco. */
  protected readonly actionError = signal<AppError | null>(null);

  protected readonly selectedOrders = computed(() =>
    this.orders().filter((order) => this.selectedIds().has(order.id)),
  );

  /**
   * ⛔ Al cambio di filtri o pagina la selezione si restringe alle righe
   * caricate: senza, la barra conterebbe righe che l'operatore non vede più e
   * un'azione agirebbe su ordini che credeva di aver lasciato indietro.
   */
  private readonly potaturaSelezione = toObservable(this.orders)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((orders) => this.selection.prune(orders.map((order) => order.id)));

  /**
   * Le tre azioni, dichiarate dalla pagina (`14` §5.2): **Stampa, Excel ed
   * Esporta sono indipendenti**, non tre formati della stessa cosa.
   *
   * ⚠️ Excel non è un CSV rinominato: passa dall'endpoint che genera un vero
   * foglio SpreadsheetML lato server, e il file si chiama `.xls` perché è
   * quello che è.
   */
  protected readonly selectionActions = computed<readonly ListAction[]>(() => [
    {
      // ⭐ Il **Dettaglio** (`14` §6, §E6): la consultazione in sola lettura,
      // che qui esiste da sempre — `orders/:id`, «Dettaglio ordine fornitore»,
      // protetta dai soli permessi di vista. Da quando il clic di riga apre la
      // Modifica non ci portava piu' nessuno.
      //
      // Sta PRIMA degli altri: e' l'unico comando che si limita a guardare.
      id: 'detail',
      label: 'Dettaglio',
      icon: 'pi-eye',
      requires: 'one',
      ariaLabel: "Apri il dettaglio dell'ordine selezionato",
      run: (bersaglio) => this.openDetail(bersaglio),
    },
    {
      id: 'print',
      label: 'Stampa',
      icon: 'pi-print',
      requires: 'none',
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      ariaLabel: "Stampa l'elenco degli ordini selezionati",
      run: (bersaglio) => this.printSelection(bersaglio),
    },
    {
      id: 'excel',
      label: 'Excel',
      icon: 'pi-file-excel',
      requires: 'none',
      busy: this.excelBusy(),
      run: (bersaglio) => this.downloadExcel(bersaglio),
    },
    {
      id: 'export',
      label: 'Esporta',
      icon: 'pi-download',
      requires: 'none',
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      items: [{ id: 'csv', label: 'CSV (.csv)', icon: 'pi-file', run: (b) => this.exportCsv(b) }],
    },
  ]);

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  protected readonly hasActiveFilters = computed(() => {
    const q = this.query();
    return Boolean(q.search ?? q.status);
  });

  /** Pannello filtri mobile: un solo pulsante «Filtri (n)». */
  protected readonly mobileFiltersOpen = signal(false);

  /** Quanti filtri sono attivi, per il badge del pulsante «Filtri». La ricerca
   *  non conta: ha il suo campo sempre visibile. */
  protected readonly activeFilterCount = computed(() => (this.query().status ? 1 : 0));

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onStatusFilterChange(value: string | null): void {
    this.updateParams({ status: value, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, status: null, page: null }, true);
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({
      pageSize: size === DEFAULT_SUPPLIER_ORDER_PAGE_SIZE ? null : size,
      page: null,
    });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openOrder(order: SupplierOrder): void {
    void this.router.navigate(['/app/orders', order.id]);
  }

  protected createOrder(): void {
    void this.router.navigate(['/app/orders/new']);
  }

  private updateParams(params: Record<string, string | number | null>, replace = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  private applySearch(value: string): void {
    const trimmed = value.trim();
    const current = this.query().search ?? '';
    if (trimmed === current) {
      return;
    }
    this.updateParams({ search: trimmed || null, page: null }, true);
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  // ── Selezione ─────────────────────────────────────────────────────────────

  protected onToggleSelection(event: DataTableSelectionEvent<SupplierOrder>): void {
    this.selection.toggle(event.row.id, event.selected);
  }

  /** La checkbox di testata agisce sulle righe CARICATE (`14` §4.1). */
  protected onToggleSelectAll(checked: boolean): void {
    this.selection.setAll(
      this.orders().map((order) => order.id),
      checked,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }

  // ── Le tre azioni ─────────────────────────────────────────────────────────

  /**
   * ⚠️ **Il caso `filtered` non è ancora servito qui.** La barra emette solo
   * `'selection'`, quindi oggi non ci si arriva; quando la barra strumenti
   * della pagina dichiarerà le stesse azioni (`14` §5.3), Stampa ed Esporta
   * dovranno passare da un export che conosce il filtro — le righe caricate
   * sono UNA pagina, e servirle sarebbe dare venti risultati su centoventisette
   * senza dirlo. Excel, qui sotto, lo fa già correttamente: chiede al server.
   */
  /**
   * Apre il Dettaglio dell'ordine scelto.
   *
   * ⚠️ Qui basta l'**id**, e la differenza con l'elenco documenti e' di
   * dominio, non di stile: la' il Dettaglio ha otto indirizzi diversi e va
   * scelto per tipo, qui la rotta e' una sola. Cercare la riga per poi usarne
   * solo l'id aggiungerebbe un modo di fallire — la riga potrebbe non essere
   * nella pagina caricata — senza aggiungere niente.
   *
   * ⛔ Il ramo `filtered` non e' raggiungibile con `requires: 'one'`; va scritto
   * perche' l'unione discriminata esiste apposta (§5.3).
   */
  private openDetail(bersaglio: ListActionTarget): void {
    if (bersaglio.scope !== 'selection') {
      return;
    }
    const id = bersaglio.ids[0];
    if (!id) {
      return;
    }
    void this.router.navigate(['/app/orders', id]);
  }

  private ordiniDelBersaglio(bersaglio: ListActionTarget): readonly SupplierOrder[] {
    return bersaglio.scope === 'selection' ? this.selectedOrders() : this.orders();
  }

  private printSelection(bersaglio: ListActionTarget): void {
    const ordini = this.ordiniDelBersaglio(bersaglio);
    if (ordini.length === 0) {
      return;
    }
    const finestra = window.open('', '_blank');
    if (!finestra) {
      return;
    }
    finestra.document.write(buildListPrintHtml(ordini, SUPPLIER_ORDER_LIST_EXPORT));
    finestra.document.close();
    finestra.focus();
    finestra.print();
  }

  private exportCsv(bersaglio: ListActionTarget): void {
    const ordini = this.ordiniDelBersaglio(bersaglio);
    if (ordini.length === 0) {
      return;
    }
    downloadBlob(
      new Blob([buildListCsv(ordini, SUPPLIER_ORDER_LIST_EXPORT)], {
        type: 'text/csv;charset=utf-8',
      }),
      listExportFileName(SUPPLIER_ORDER_LIST_EXPORT, 'csv'),
    );
  }

  /**
   * ⭐ Excel passa dal SERVER, ed è per questo che rispetta la regola
   * dell'ambito senza sforzo: manda i filtri correnti e, se c'è una selezione,
   * i suoi id. Il file è SpreadsheetML — estensione `.xls`, perché è quello
   * che il generatore produce.
   */
  private downloadExcel(bersaglio: ListActionTarget): void {
    if (this.excelBusy()) {
      return;
    }
    this.excelBusy.set(true);
    const ids = bersaglio.scope === 'selection' ? bersaglio.ids : undefined;
    this.service
      .exportSpreadsheet(this.query(), ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const stamp = new Date().toISOString().slice(0, 10);
          downloadBlob(blob, `ordini-fornitore-${stamp}.xls`);
          this.excelBusy.set(false);
        },
        error: (err: unknown) => {
          this.excelBusy.set(false);
          this.actionError.set(this.toAppError(err));
        },
      });
  }

  // ── La tabella, sul motore comune (`14` parte H) ──────────────────────────

  /**
   * Le colonne dell'elenco ordini fornitore.
   *
   * ⚠️ Dichiarate qui e non prese da `TableColumnPreferenceService`: questo elenco
   * **non ha un selettore colonne**, e dargliene uno sarebbe aggiungere una
   * funzione mentre se ne assorbe un'altra. Il motore chiede un modello colonne,
   * non un servizio di preferenze.
   */
  /**
   * Le colonne che il server sa ordinare: specchio di
   * `api/src/supplier-orders/supplier-orders-sort.util.ts`.
   */
  private static readonly SORTABLE = new Set([
    'reference',
    'supplier',
    'lines',
    'expected',
    'total',
    'status',
  ]);

  protected readonly tableColumns: readonly ResolvedTableColumn[] = [
    { id: 'reference', label: 'Riferimento', pinned: false },
    { id: 'supplier', label: 'Fornitore', pinned: false },
    // ⭐ «Stato» si ordina, con l'ordine dell'ENUM: confermato → concluso →
    // annullato, il ciclo di vita dichiarato nello schema. Qui c'era scritto
    // che il database avrebbe ordinato «in inglese», ed era falso.
    { id: 'status', label: 'Stato', pinned: false },
    { id: 'lines', label: 'Righe', pinned: false },
    { id: 'expected', label: 'Attesa il', pinned: false },
    { id: 'total', label: 'Totale', numeric: true, pinned: false },
  ];

  /**
   * Le chiavi che il server sa davvero ordinare.
   *
   * ⚠️ Il filtro serve perché la stringa arriva dall'**URL**: un link vecchio
   * con `sort=status:asc` prenderebbe un `400` invece di aprire l'elenco.
   */
  private readonly sortRichiesto = computed<readonly DataTableSort[]>(() =>
    (this.query().sort ?? []).filter((chiave) =>
      SupplierOrderListComponent.SORTABLE.has(chiave.columnId),
    ),
  );

  /**
   * L'operatore ha premuto un'intestazione: il motore ha già calcolato il
   * prossimo ordine, qui si applica — e si torna alla **prima pagina**, o si
   * resterebbe alla quinta di un ordine che non c'entra più.
   */
  protected onSortChange(chiavi: readonly DataTableSort[]): void {
    this.updateParams({ sort: serializeDataTableSort(chiavi) || null, page: null }, true);
  }

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly tableSections = computed<readonly DataTableSection<SupplierOrder>[]>(() => [
    { id: 'ordini', rows: this.orders() },
  ]);

  protected readonly rowId = (order: SupplierOrder): string => order.id;

  protected readonly rowLabel = (order: SupplierOrder): string =>
    `Apri ordine ${order.reference} di ${order.supplierName}`;

  protected readonly selectionLabel = (order: SupplierOrder): string =>
    `Seleziona ordine ${order.reference}`;

  protected readonly cellText = (order: SupplierOrder, columnId: string): string => {
    switch (columnId) {
      case 'reference':
        return order.reference;
      case 'supplier':
        return order.supplierName;
      case 'lines':
        return String(order.lineCount ?? order.lines.length);
      case 'expected':
        return order.expectedAt ? formatDate(order.expectedAt) : '—';
      case 'total':
        return formatMoney(order.totalAmount);
      default:
        return '';
    }
  };

  protected readonly statusLabel = supplierOrderStatusLabel;
  protected readonly statusTone = supplierOrderStatusTone;
}
