import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import {
  SUPPLIER_ORDER_LIST_COLUMN_DEFS,
  SUPPLIER_ORDER_LIST_COLUMN_PRESETS,
} from './models/supplier-order-list-columns.config';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { comando } from '@shared/models/list-action-catalog';
import {
  FILTERED_SCOPE_NOT_AVAILABLE,
  type ListAction,
  type ListActionTarget,
} from '@shared/models/list-selection.model';
import {
  serializeDataTableSort,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';
import {
  DEFAULT_MOVEMENT_PERIOD,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';
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
import { DocumentType } from '@core/models/document.model';
import { documentRowPath } from '@domain/documents/utils/document-routing.util';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { GroupByMenuComponent } from '@shared/components/group-by-menu/group-by-menu.component';
import { ListSummaryComponent } from '@shared/components/list-summary/list-summary.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSelectionEvent } from '@shared/components/data-table/data-table.component';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import {
  supplierOrderStatusLabel,
  supplierOrderStatusTone,
} from './models/supplier-order-labels.util';
import {
  DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
  parseSupplierOrderListQuery,
} from '@domain/supplier-orders/models/supplier-order-list-query.model';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import { sezioniDiElenco } from '@shared/models/list-grouping.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

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
    ListSummaryComponent,
    GroupByMenuComponent,
    ListPageComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    ListActionsBarComponent,
    BadgeComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
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
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly canManageSupplierOrders = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  protected readonly skeletonColumns = 5;

  protected readonly statusOptions: readonly SelectMenuOption[] = [
    { value: 'confirmed', label: 'Confermato' },
    { value: 'concluded', label: 'Concluso' },
    { value: 'cancelled', label: 'Annullato' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseSupplierOrderListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  /**
   * ⛔ **Confronto per CONTENUTO**: un `computed` che costruisce un oggetto ne
   * produce uno nuovo a ogni ricalcolo, e `toObservable` lo confronta con
   * `Object.is` — due richieste identiche risultano diverse e l'elenco
   * ricarica dati che ha già. Qui l'ordinamento è server-side, quindi una
   * richiesta nuova ci vuole davvero: questo evita solo quelle **identiche**
   * (misurato il 21/08/2026 sul Registro, dove era il grosso della lentezza).
   */
  private readonly request = computed(
    () => ({
      // Le chiavi non supportate escono qui, prima della rete: l'URL è un posto
      // che chiunque può scrivere, il 400 lo prenderebbe l'operatore.
      query: {
        ...this.query(),
        sort: this.sortRichiesto(),
        dateFrom: this.periodoEffettivo().from,
        dateTo: this.periodoEffettivo().to,
        // ⛔ I riepiloghi non impaginano (`14` §H14-bis).
        all: true,
      },
      tick: this.refreshTick(),
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

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

  /**
   * ⭐ **La modalità «Seleziona» della vista a card**, dal telaio.
   *
   * ⛔ Non è scritta qui: `createSelectionMode` porta con sé la regola che
   * spegnerla AZZERA la selezione — a modalità spenta il tocco torna ad aprire
   * la riga, e non resta nessun gesto per deselezionare.
   */
  protected readonly modoSelezione = createSelectionMode(this.selection);

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
    // ⭐ **«Nuovo» sta QUI, non in testata** — decisione del proprietario,
    //    30/08/2026: tutti i comandi in una riga in basso, totali subito sopra.
    //    Non è duplicato: si è spostato.
    ...(this.canManageSupplierOrders()
      ? ([
          comando('new', {
            ariaLabel: 'Nuovo ordine fornitore',
            run: () => this.createOrder(),
          }),
        ] as const)
      : []),
    // ⭐ Il **Dettaglio** (`14` §6, §E6): la consultazione in sola lettura,
    // che qui esiste da sempre — `orders/:id`, «Dettaglio ordine fornitore»,
    // protetta dai soli permessi di vista. Da quando il clic di riga apre la
    // Modifica non ci portava piu' nessuno.
    //
    // Sta PRIMA degli altri: e' l'unico comando che si limita a guardare.
    comando('detail', {
      ariaLabel: "Apri il dettaglio dell'ordine selezionato",
      run: (bersaglio) => this.openDetail(bersaglio),
    }),
    comando('print', {
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      ariaLabel: "Stampa l'elenco degli ordini selezionati",
      run: (bersaglio) => this.printSelection(bersaglio),
    }),
    comando('excel', {
      busy: this.excelBusy(),
      run: (bersaglio) => this.downloadExcel(bersaglio),
    }),
    comando('export', {
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      items: [{ id: 'csv', label: 'CSV (.csv)', icon: 'pi-file', run: (b) => this.exportCsv(b) }],
    }),
  ]);

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  /**
   * Preset del periodo. ⭐ Arriva con la rimozione delle pagine
   * (`14` §H14-bis): un riepilogo che non impagina ha bisogno di un
   * contenimento, e il contenimento è il periodo — «Tutti» resta scegliibile ma
   * non è il predefinito.
   */
  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: MovementPeriodPreset.All, label: 'Tutti' },
    { value: MovementPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: MovementPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: MovementPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: MovementPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: MovementPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: MovementPeriodPreset.LastYear, label: 'Anno scorso' },
  ];

  protected readonly periodPreset = signal<MovementPeriodPreset>(
    this.route.snapshot.queryParamMap.get('dateFrom') ||
      this.route.snapshot.queryParamMap.get('dateTo')
      ? MovementPeriodPreset.Custom
      : DEFAULT_MOVEMENT_PERIOD,
  );

  /**
   * Il periodo effettivo. ⭐ Il predefinito NON passa dall'URL: all'apertura
   * non c'è nessun `dateFrom`, e l'elenco deve comunque partire dagli ultimi
   * 30 giorni. Scriverlo a ogni apertura sporcherebbe la cronologia con un
   * parametro che nessuno ha scelto.
   */
  private readonly periodoEffettivo = computed(() => {
    const q = this.query();
    if (q.dateFrom || q.dateTo) {
      return { from: q.dateFrom, to: q.dateTo };
    }
    return resolveMovementPeriodRange(this.periodPreset(), '', '');
  });

  protected onPeriodPresetChange(value: string | null): void {
    const preset = (value ?? MovementPeriodPreset.All) as MovementPeriodPreset;
    this.periodPreset.set(preset);
    const range = resolveMovementPeriodRange(preset, '', '');
    this.updateParams({ dateFrom: range.from ?? null, dateTo: range.to ?? null, page: null }, true);
  }

  /** Pannello filtri mobile: un solo pulsante «Filtri (n)». */
  protected readonly mobileFiltersOpen = signal(false);

  /** Quanti filtri sono attivi, per il badge del pulsante «Filtri». La ricerca
   *  non conta: ha il suo campo sempre visibile. */
  protected readonly activeFilterCount = computed(() => (this.query().status ? 1 : 0));

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.SupplierOrdersList,
      SUPPLIER_ORDER_LIST_COLUMN_DEFS,
      SUPPLIER_ORDER_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.SupplierOrdersList);

    // ⭐ **URL completo quando un periodo è applicato** (`14` §H14-bis, deciso
    // il 20/08/2026). Il predefinito di 30 giorni È un filtro applicato —
    // l'elenco mostra solo quelle righe — quindi finisce nell'indirizzo: un
    // riepilogo filtrato si capisce, si condivide e si riproduce.
    //
    // ⛔ Una volta sola, alla creazione: riscriverlo a ogni giro cancellerebbe
    // la scelta «Tutti», che è l'unico caso in cui nessun periodo è applicato.
    if (this.periodPreset() !== MovementPeriodPreset.All) {
      const iniziale = resolveMovementPeriodRange(this.periodPreset(), '', '');
      this.updateParams({ dateFrom: iniziale.from ?? null, dateTo: iniziale.to ?? null }, true);
    }

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));
  }

  protected onStatusFilterChange(value: string | null): void {
    this.updateParams({ status: value, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, status: null, page: null }, true);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openOrder(order: SupplierOrder): void {
    // ⛔ Qui c’era `router.navigate(['/app/orders', order.id])`, cioè il DETTAGLIO,
    //   mentre `DOCUMENT_ROW_OPENS[SupplierOrder]` dichiara `'form'` dal 20/08/2026.
    //   L’elenco cablava la destinazione e non leggeva la regola.
    //
    // ⛔ **E qui c’era anche un ADATTATORE di stato** — `Cancelled ? Cancelled :
    //   Confirmed` — che alimentava il ramo «annullato → Dettaglio» di
    //   `documentRowPath`. Quel ramo non esiste più (decisione del 27/08/2026: lo
    //   stato non decide dove porta la riga), quindi l’adattatore non adattava
    //   più niente. Peggio: mappando `concluded → Confirmed` mandava gli ordini
    //   CONCLUSI su una maschera che allora li rifiutava con «Ordine non
    //   modificabile». Rimosso con il ramo che serviva.
    void this.router.navigateByUrl(
      documentRowPath(
        { id: order.id, type: DocumentType.SupplierOrder },
        this.authService.currentUser(),
      ),
    );
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

  /**
   * ⭐ **Le colonne vengono dalle PREFERENZE**, non più cablate qui.
   *
   * ⛔ C'era scritto che questo elenco «non ha un selettore colonne, e dargliene
   * uno sarebbe aggiungere una funzione mentre se ne assorbe un'altra».
   * Superato dal proprietario il 30/08/2026: da quando i totali seguono le
   * colonne (`14` §0.2), un elenco senza selettore è un elenco in cui non si
   * scelgono né i dati né i totali — e questo era uno dei due soli senza.
   *
   * ⚠️ «Stato» si ordina con l'ordine dell'ENUM — confermato → concluso →
   * annullato, il ciclo di vita dello schema. Qui c'era scritto che il database
   * avrebbe ordinato «in inglese», ed era falso.
   */
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly tableViewId = TableViewId.SupplierOrdersList;

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

  // ── Raggruppa ─────────────────────────────────────────────────────────────

  /**
   * ⚠️ **Raggruppa è PRESENTAZIONE, non un filtro**: non entra in nessuna query,
   * non conta nel badge «Filtri (n)» e «Azzera filtri» non lo tocca. Le righe
   * restano le stesse — cambia come si leggono.
   */
  protected readonly raggruppa = signal<string>('none');
  protected readonly raggruppaPerGiornata = computed(() => this.raggruppa() === 'day');

  protected onRaggruppaChange(value: string): void {
    /*
      ⛔ Passando a «Giorno» l'ordinamento manuale si AZZERA, non si mette in
      pausa: uno stato che esiste e non si vede tornerebbe fuori al cambio
      successivo senza che nessuno l'abbia chiesto.

      ⚠️ È la stessa scelta del Registro Corrispettivi (`10` §20): il
      raggruppamento **è già** una forma di ordinamento strutturato, e un «prima
      il giorno, poi la colonna» spezzerebbe i gruppi e i loro subtotali.
    */
    if (value === 'day') {
      this.updateParams({ sort: null }, true);
    }
    this.raggruppa.set(value);
  }

  /**
   * ⚠️ **Il subtotale somma le righe caricate**, ed è corretto: l'elenco non
   * impagina, quindi ciò che ha in mano **è** il risultato del filtro. Stessa
   * aritmetica della riga totali, un livello più in basso.
   */
  protected readonly tableSections = computed<readonly DataTableSection<SupplierOrder>[]>(() => {
    const valuta = this.orders()[0]?.totalAmount.currencyCode ?? DEFAULT_CURRENCY;
    return sezioniDiElenco(this.orders(), this.raggruppaPerGiornata(), {
      idPiatto: 'ordini',
      giornoDi: (order) => order.orderDate,
      columns: this.tableColumns(),
      emphasis: 'total',
      campi: {
        total: {
          valore: (order) => order.totalAmount.amountMinor,
          formato: (n) => formatMoney({ amountMinor: n, currencyCode: valuta }),
        },
      },
    });
  });

  /*
    ⭐ **La riga totali** (`regole-stile-ui`, «La riga TOTALI di un elenco»): somma
    le colonne visibili, e con una selezione somma quelle scelte.

    ⚠️ **Si somma `amountMinor` e si formatta UNA volta sola**: è la regola del
    denaro — «si arrotonda solo all'uscita, mai nei passaggi intermedi».
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const valuta = this.orders()[0]?.totalAmount.currencyCode ?? DEFAULT_CURRENCY;
    return totaliDiElenco(this.orders(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.tableColumns(),
      campi: {
        total: {
          valore: (o) => o.totalAmount.amountMinor,
          formato: (n) => formatMoney({ amountMinor: n, currencyCode: valuta }),
        },
      },
    });
  });
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return this.tableColumns().some((column) => column.id === columnId);
  }

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
      case 'documentDate':
        return formatDate(order.orderDate);
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
