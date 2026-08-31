import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import {
  FILTERED_SCOPE_NOT_AVAILABLE,
  type ListAction,
  type ListActionTarget,
} from '@shared/models/list-selection.model';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';
import { downloadBlob } from '@shared/utils/download-blob.util';
import {
  buildListCsv,
  buildListPrintHtml,
  listExportFileName,
} from '@shared/utils/list-export.util';
import { MOVEMENT_LIST_EXPORT } from './utils/movement-list-export.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSelectionEvent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { sortByKeys } from '@shared/utils/sort-values.util';
import type { SortKey } from '@shared/utils/sort-values.util';
import {
  formatMovementQuantity,
  isMovementSortColumn,
  MOVEMENT_SORT_KINDS,
  movementSignedQuantity,
} from './utils/movement-sort.util';
import { Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import type { PageMeta } from '@core/models/api.model';
import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { canManageInventory } from '@core/permissions/tenant-permissions.util';
import { canSwitchOperationalLocation } from '@core/utils/user-location-scope.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Location } from '@core/models/location.model';
import { MovementOrigin, StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { formatDate, formatDateTime } from '@core/utils/date.util';
import { GroupByMenuComponent } from '@shared/components/group-by-menu/group-by-menu.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';

import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { CustomerService } from '@domain/customers/services/customer.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';

import {
  movementActorLabel,
  movementOriginLabel,
  movementTypeLabel,
  movementTypeTone,
} from './models/inventory-labels.util';
import type { StockMovementRow } from './models/inventory-view.model';
import {
  STOCK_MOVEMENT_COLUMN_DEFS,
  STOCK_MOVEMENT_COLUMN_PRESETS,
} from './models/stock-movements-table-columns.config';
import type { StockMovementsListQuery } from '@domain/inventory/models/inventory-list-query.model';
import {
  DEFAULT_MOVEMENT_PERIOD,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';
import { InventoryService } from '@domain/inventory/services/inventory.service';
import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import { raggruppaPerGiorno } from '@shared/models/list-grouping.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';

interface MovementsData {
  readonly movements: readonly StockMovement[];
  readonly locations: readonly Location[];
  readonly meta: PageMeta;
}

type MovementsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: MovementsData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * ⚠️ `meta` sopravvive alla paginazione, e non per inerzia: `total` è rimasta
 * l'unica misura di quante righe ha il periodo — la leggono lo stato vuoto e il
 * conteggio a schermo. `page` e `pageSize` restano solo per la forma del
 * contratto: non decidono più niente.
 */
const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: 0,
  total: 0,
  totalPages: 1,
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Storico movimenti di magazzino (smart).
 *
 * ⛔ **Non pagina.** A delimitare è il PERIODO, non la pagina: si entra sugli
 * ultimi trenta giorni e «Tutti» è una scelta esplicita. Un registro che ne
 * mostra una parte senza dirlo è peggio di uno che chiede di restringere le date.
 */
@Component({
  selector: 'app-stock-movements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GroupByMenuComponent,
    ListPageComponent,

    ListActionsBarComponent,
    SelectMenuComponent,
    DateInputComponent,
    InventoryTabsComponent,
    BadgeComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    DataTableComponent,
  ],
  templateUrl: './stock-movements.component.html',
  styleUrl: './stock-movements.component.scss',
})
export class StockMovementsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly customerService = inject(CustomerService);
  private readonly supplierService = inject(SupplierService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ── Selezione e azioni (`14` §5) ───────────────────────────────────────────
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
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.StockMovements;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 8;

  /**
   * L'ordinamento scelto dall'operatore, oppure `null` = quello del server
   * (data decrescente).
   *
   * ⭐ È un ELENCO: premere una seconda colonna non cancella la prima, la
   * scavalca. Ordinare per Prodotto e poi per Data lascia le righe di ogni
   * prodotto in ordine cronologico invece che a caso.
   *
   * ⛔ **Non si conserva** (`14` §G1): alla riapertura si torna al predefinito.
   * Ordinare per costo una volta è un gesto del momento, ritrovarlo la
   * settimana dopo è rumore.
   */
  protected readonly sortState = signal<readonly DataTableSort[]>([]);

  protected readonly movementTypeOptions: readonly SelectMenuOption[] = [
    { value: StockMovementType.Load, label: 'Carico' },
    { value: StockMovementType.Unload, label: 'Scarico' },
    { value: StockMovementType.Transfer, label: 'Trasferimento' },
    { value: StockMovementType.Adjustment, label: 'Rettifica' },
    { value: StockMovementType.Sale, label: 'Vendita' },
    { value: StockMovementType.OnlineSale, label: 'Vendita online' },
    { value: StockMovementType.Return, label: 'Reso' },
  ];

  /**
   * Origine del movimento: tutte le origini reali del registro (qui compare
   * OGNI movimento che tocca le giacenze, qualunque sia la fonte). Etichette
   * coerenti con la colonna Origine (movementOriginLabel).
   */
  protected readonly originOptions = computed((): readonly SelectMenuOption[] => {
    const profile = this.authService.currentUser()?.tenantChannelProfile;
    return [
      MovementOrigin.Manual,
      MovementOrigin.Shopify,
      MovementOrigin.Tiktok,
      MovementOrigin.VestiflowPos,
      MovementOrigin.VestiflowOnline,
    ].map((origin) => ({ value: origin, label: movementOriginLabel(origin, profile) }));
  });

  /** Operatori che hanno generato movimenti (snapshot createdByName). */
  protected readonly operatorOptions = toSignal(
    this.inventoryService.getMovementOperators().pipe(
      map((operators): readonly SelectMenuOption[] =>
        operators.map((name) => ({ value: name, label: movementActorLabel(name) })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /** Scelte rapide periodo; il valore vuoto (placeholder «Tutti») non filtra. */
  /**
   * ⭐ «Tutti» è una voce come le altre, non l'assenza di scelta: il registro si
   * apre delimitato, e l'intera storia si chiede **esplicitamente**.
   */
  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: MovementPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: MovementPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: MovementPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: MovementPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: MovementPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: MovementPeriodPreset.LastYear, label: 'Anno scorso' },
    { value: MovementPeriodPreset.Custom, label: 'Personalizzato' },
    { value: MovementPeriodPreset.All, label: 'Tutti' },
  ];

  /** Controparti (fornitori + clienti) per il dropdown con ricerca. */
  protected readonly partyOptions = toSignal(
    forkJoin({
      suppliers: this.supplierService.getSuppliers().pipe(catchError(() => of([]))),
      customers: this.customerService.getAllCustomers().pipe(catchError(() => of([]))),
    }).pipe(
      map(({ suppliers, customers }): readonly SelectMenuOption[] => [
        ...suppliers.map((supplier) => ({
          value: supplier.id,
          label: supplier.name,
          detail: 'Fornitore',
        })),
        ...customers.map((customer) => ({
          value: customer.id,
          label: `${customer.firstName} ${customer.lastName}`.trim(),
          detail: 'Cliente',
        })),
      ]),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /** Azioni registrazione per tipo: aprono il form già impostato sul tipo. */
  protected readonly movementActions = [
    { type: StockMovementType.Load, label: 'Carico', icon: 'pi-plus-circle' },
    { type: StockMovementType.Unload, label: 'Scarico', icon: 'pi-minus-circle' },
    { type: StockMovementType.Adjustment, label: 'Rettifica', icon: 'pi-sliders-h' },
    { type: StockMovementType.Transfer, label: 'Trasferimento', icon: 'pi-arrow-right-arrow-left' },
  ] as const;

  private readonly refreshTick = signal(0);

  protected readonly typeFilter = signal('');
  protected readonly originFilter = signal('');
  /**
   * ⛔ Il registro NON si apre su tutta la storia del tenant. Il periodo
   * predefinito è delimitato; «Tutti» resta a un clic di distanza.
   */
  protected readonly periodFilter = signal<MovementPeriodPreset>(DEFAULT_MOVEMENT_PERIOD);
  // Dal/Al: usati solo con periodo «Personalizzato».
  protected readonly fromFilter = signal('');
  protected readonly toFilter = signal('');
  protected readonly partyFilter = signal('');
  protected readonly operatorFilter = signal('');
  protected readonly searchDraft = signal('');
  private readonly search = signal('');
  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');

  protected readonly isCustomPeriod = computed(
    () => this.periodFilter() === MovementPeriodPreset.Custom,
  );

  protected readonly canManageInventory = computed(() =>
    canManageInventory(this.authService.currentUser()),
  );

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.StockMovements,
      STOCK_MOVEMENT_COLUMN_DEFS,
      STOCK_MOVEMENT_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.StockMovements);

    effect(() => {
      if (!canSwitchOperationalLocation(this.authService.currentUser())) {
        return;
      }
      this.locationFilter.set(this.locationContext.activeLocationId() ?? '');
    });

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.search.set(value));
  }

  private readonly filters = computed(() => ({
    type: this.typeFilter(),
    origin: this.originFilter(),
    period: this.periodFilter(),
    from: this.fromFilter(),
    to: this.toFilter(),
    location: this.locationFilter(),
    search: this.search(),
    party: this.partyFilter(),
    operator: this.operatorFilter(),
  }));

  /** Estremi data effettivi: preset rapido o intervallo custom Dal/Al. */
  private readonly dateRange = computed(() =>
    resolveMovementPeriodRange(this.periodFilter(), this.fromFilter(), this.toFilter()),
  );

  private readonly query = computed((): StockMovementsListQuery => {
    const type = this.typeFilter();
    const origin = this.originFilter();
    const locationId = this.locationFilter();
    const range = this.dateRange();
    return {
      type: type ? (type as StockMovementType) : undefined,
      origin: origin ? (origin as MovementOrigin) : undefined,
      locationId: locationId || undefined,
      search: this.search().trim() || undefined,
      partyId: this.partyFilter() || undefined,
      createdBy: this.operatorFilter() || undefined,
      // Inizio/fine giornata (ora locale) per includere i giorni estremi interi.
      from: range.from ? `${range.from}T00:00:00` : undefined,
      to: range.to ? `${range.to}T23:59:59.999` : undefined,
    };
  });

  private readonly request = computed(() => ({
    query: this.query(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        forkJoin({
          movements: this.inventoryService.getMovements(query),
          locations: this.inventoryService.getLocations(),
        }).pipe(
          map(({ movements, locations }): MovementsState => ({
            status: 'success',
            data: {
              movements: movements.data,
              locations,
              meta: movements.meta,
            },
          })),
          startWith<MovementsState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<MovementsState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies MovementsState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly locations = computed<readonly Location[]>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.locations : [];
  });

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.meta : EMPTY_META;
  });

  protected readonly rows = computed<readonly StockMovementRow[]>(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    const locationById = new Map(current.data.locations.map((location) => [location.id, location]));
    const nameOf = (id: string): string => locationById.get(id)?.name ?? id;

    const profile = this.authService.currentUser()?.tenantChannelProfile;

    const righe = current.data.movements.map((movement): StockMovementRow => ({
      id: movement.id,
      type: movement.type,
      sku: movement.sku,
      articleCode: movement.articleCode ?? '',
      signedQuantity: formatMovementQuantity(movement),
      signedQuantityValue: movementSignedQuantity(movement),
      locationLabel:
        movement.type === StockMovementType.Transfer && movement.targetLocationId
          ? `${nameOf(movement.locationId)} → ${nameOf(movement.targetLocationId)}`
          : nameOf(movement.locationId),
      direction: movement.direction,
      reason: movement.reason,
      createdAtLabel: formatDateTime(movement.createdAt),
      createdAt: movement.createdAt,
      createdByName: movement.createdByName,
      origin: movement.origin,
      originLabel: movementOriginLabel(movement.origin, profile),
      productTitle: movement.productTitle,
      documentReference: movement.documentReference,
    }));

    return this.ordina(righe, current.data.movements);
  });

  /**
   * Applica l'ordinamento scelto, **sui valori canonici**.
   *
   * ⭐ Ordina l’INTERO risultato del filtro, perché è tutto qui: il registro non
   * pagina. Ordinare una pagina darebbe un risultato che sembra giusto e non lo è.
   */
  private ordina(
    righe: readonly StockMovementRow[],
    movimenti: readonly StockMovement[],
  ): readonly StockMovementRow[] {
    /*
      ⛔ **Col raggruppamento acceso l'ordinamento manuale non esiste**, ed è la
      stessa scelta del Registro Corrispettivi (`10` §20): il raggruppamento per
      giornata **è già** una forma di ordinamento strutturato, e pretendere anche
      quello per colonna richiederebbe un «prima il giorno, poi la colonna» che
      spezza i gruppi e i loro subtotali.
    */
    const chiavi = this.raggruppaPerGiornata()
      ? []
      : this.sortState().filter((sort) => isMovementSortColumn(sort.columnId));
    if (chiavi.length === 0) {
      return righe;
    }
    // Riga e movimento viaggiano appaiati: la prima porta le etichette già
    // composte, il secondo i valori grezzi. Il confronto pesca da entrambi.
    interface Coppia {
      readonly row: StockMovementRow;
      readonly movement: StockMovement;
    }
    const coppie: readonly Coppia[] = righe.map((row, indice) => ({
      row,
      movement: movimenti[indice]!,
    }));
    const chiaviDiOrdinamento: readonly SortKey<Coppia>[] = chiavi.map((sort) => {
      const colonna = sort.columnId as keyof typeof MOVEMENT_SORT_KINDS;
      return {
        read: (coppia: Coppia) => this.valoreCanonico(coppia.row, coppia.movement, colonna),
        kind: MOVEMENT_SORT_KINDS[colonna],
        direction: sort.direction,
      };
    });
    return sortByKeys(coppie, chiaviDiOrdinamento, 'EUR').map((coppia) => coppia.row);
  }

  /**
   * Il valore su cui si confronta una colonna.
   *
   * ⛔ **Data e quantità arrivano dal movimento grezzo**, non dalla riga: lì sono
   * già una stampa — «17 ago 2026» e «−2» col meno tipografico — e ordinarle
   * darebbe un ordine alfabetico travestito da cronologia.
   *
   * ⚠️ Tipo, Origine e Location arrivano invece dalla RIGA, cioè dall’etichetta:
   * è la decisione dichiarata in `movement-sort.util`, non una svista.
   */
  private valoreCanonico(
    row: StockMovementRow,
    movement: StockMovement,
    colonna: keyof typeof MOVEMENT_SORT_KINDS,
  ): string | number {
    switch (colonna) {
      case 'createdAt':
        return movement.createdAt;
      case 'signedQuantity':
        return movementSignedQuantity(movement);
      case 'type':
        return movementTypeLabel(row.type);
      case 'origin':
        return row.originLabel ?? '';
      case 'articleCode':
        return row.articleCode;
      case 'sku':
        return row.sku;
      case 'product':
        return row.productTitle ?? '';
      case 'locationLabel':
        return row.locationLabel;
      case 'documentRef':
        return row.documentReference ?? '';
      case 'reason':
        return row.reason ?? '';
      case 'createdByName':
        return movementActorLabel(row.createdByName);
    }
  }

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.data.meta.total === 0;
  });

  protected onTypeFilterChange(value: string | null): void {
    this.typeFilter.set(value ?? '');
  }

  protected onOriginFilterChange(value: string | null): void {
    this.originFilter.set(value ?? '');
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value ?? '');
  }

  protected onPeriodFilterChange(value: string | null): void {
    // ⚠️ `null` non è «Tutti»: da quando «Tutti» è una voce esplicita, un valore
    // assente è un'anomalia e deve ricadere sul predefinito delimitato — non
    // aprire in silenzio l'intera storia del tenant.
    const preset = (value ?? DEFAULT_MOVEMENT_PERIOD) as MovementPeriodPreset;
    this.periodFilter.set(preset);
    // Le date custom valgono solo con «Personalizzato»: altrove vanno azzerate.
    if (preset !== MovementPeriodPreset.Custom) {
      this.fromFilter.set('');
      this.toFilter.set('');
    }
  }

  protected onPartyFilterChange(value: string | null): void {
    this.partyFilter.set(value ?? '');
  }

  protected onOperatorFilterChange(value: string | null): void {
    this.operatorFilter.set(value ?? '');
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onFromFilterChange(value: string): void {
    this.fromFilter.set(value);
  }

  protected onToFilterChange(value: string): void {
    this.toFilter.set(value);
  }

  /*
    ⚠️ **Ricerca e Periodo restano fuori** (`14` §0.2, ribadito dal proprietario
    il 31/08/2026): hanno il proprio controllo sempre a vista in barra e non
    seguono il pulsante «Filtri». Qui il periodo è la terna
    `periodFilter`/`fromFilter`/`toFilter`.

    ⛔ Era l'elenco che ne azzerava di più — periodo compreso — quindi spegnere
    «Filtri» riportava le date al predefinito senza che nessuno lo chiedesse.
  */
  protected resetFilters(): void {
    this.typeFilter.set('');
    this.originFilter.set('');
    this.locationFilter.set('');
    this.partyFilter.set('');
    this.operatorFilter.set('');
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected newMovement(type: StockMovementType): void {
    void this.router.navigate(['/app/inventory/movements/new'], { queryParams: { type } });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  // ── Le azioni del registro ────────────────────────────────────────────────

  protected readonly selectedMovements = computed(() =>
    this.rows().filter((row) => this.selectedIds().has(row.id)),
  );

  /**
   * ⚠️ Stampa ed Esporta valgono sulla SELEZIONE: il registro è paginato lato
   * server, e servirle dalle righe caricate darebbe una pagina su N senza
   * dirlo (`14` §5.3). Diventeranno `none` quando ci sarà un export che
   * conosce il filtro.
   */
  protected readonly listActions = computed<readonly ListAction[]>(() => [
    // ⭐ **I quattro «registra» stanno QUI, non in testata** — decisione del
    //    proprietario, 30/08/2026: tutti i comandi in una riga in basso.
    //
    // ⚠️ Sono QUATTRO azioni, non una: carico, scarico, rettifica e
    //    trasferimento aprono la stessa maschera su tipi diversi, e il tipo si
    //    sceglie prima, non dentro. Restano dichiarate una volta sola in
    //    `movementActions`.
    ...(this.canManageInventory()
      ? this.movementActions.map((azione): ListAction => ({
          id: 'new-' + azione.type,
          label: azione.label,
          icon: azione.icon,
          requires: 'none',
          ariaLabel: 'Registra ' + azione.label.toLowerCase(),
          run: () => this.newMovement(azione.type),
        }))
      : []),
    comando('print', {
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      ariaLabel: 'Stampa i movimenti selezionati',
      run: (bersaglio) => this.printSelection(bersaglio),
    }),
    comando('export', {
      disabled: this.selectionCount() === 0,
      disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
      items: [voceEsporta('csv', (bersaglio) => this.exportCsv(bersaglio))],
    }),
  ]);

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
    */
    this.raggruppa.set(value);
    if (value === 'day') {
      this.sortState.set([]);
    }
  }

  /**
   * ⭐ **Una sezione sola quando non si raggruppa**; una per giornata quando sì,
   * col subtotale della giornata nel piede.
   *
   * ⚠️ **Il subtotale SOMMA le righe caricate**, e qui è corretto: il registro
   * non impagina più, quindi l'insieme che ha in mano **è** il risultato del
   * filtro. È la stessa aritmetica della riga totali qui sotto, un livello più in
   * basso — non un secondo motore economico.
   *
   * ⛔ **Sui Corrispettivi non sarebbe corretto**, ed è la ragione per cui quel
   * registro costruisce le sezioni per conto proprio: i suoi subtotali arrivano
   * dall'API, perché il suo risultato è più grande di quello che ha a schermo.
   */
  protected readonly sezioni = computed<readonly DataTableSection<StockMovementRow>[]>(() => {
    const righe = this.rows();
    if (!this.raggruppaPerGiornata()) {
      return [{ id: 'movimenti', rows: righe }];
    }
    return raggruppaPerGiorno(righe, {
      giornoDi: (row) => row.createdAt,
      etichetta: (giorno) => (giorno ? formatDate(giorno) : 'Senza data'),
      columns: this.tableColumns(),
      emphasis: 'signedQuantity',
      campi: {
        signedQuantity: {
          valore: (row) => row.signedQuantityValue,
          formato: (n) => (n > 0 ? `+${n}` : String(n)),
        },
      },
    });
  });

  /*
    ⭐ **La riga totali dei movimenti somma la quantità COL SEGNO**, ed è l'unico
    numero che ha senso sommare qui: dice quanto è entrato al netto di quanto è
    uscito nel periodo filtrato.

    ⛔ **Sommare `quantity` senza segno darebbe il TRAFFICO, non il saldo**: dieci
    caricati e dieci scaricati farebbero venti, che non è una giacenza né una
    variazione — è un numero che non risponde a nessuna domanda.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.rows(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.tableColumns(),
      campi: {
        signedQuantity: {
          valore: (row) => row.signedQuantityValue,
          formato: (n) => (n > 0 ? `+${n}` : String(n)),
        },
      },
    }),
  );
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.tableColumns(), columnId);
  }

  protected readonly rowId = (row: StockMovementRow): string => row.id;
  protected readonly selectionLabel = (row: StockMovementRow): string =>
    `Seleziona movimento ${row.sku}`;

  /**
   * Il testo delle celle che sono testo — cioè undici colonne su dodici.
   *
   * ⚠️ I trattini non sono decorazione: una cella vuota in una tabella densa si
   * legge come un errore di caricamento, non come «non c'è».
   */
  protected readonly cellText = (row: StockMovementRow, columnId: string): string => {
    switch (columnId) {
      case 'createdAt':
        return row.createdAtLabel;
      case 'articleCode':
        return row.articleCode || '—';
      case 'sku':
        return row.sku;
      case 'product':
        return row.productTitle ?? '—';
      case 'signedQuantity':
        return row.signedQuantity;
      case 'locationLabel':
        return row.locationLabel;
      case 'documentRef':
        return row.documentReference ?? '—';
      case 'reason':
        return row.reason ?? '—';
      case 'origin':
        return row.originLabel ?? '—';
      case 'createdByName':
        return movementActorLabel(row.createdByName);
      default:
        return '';
    }
  };

  protected readonly typeLabel = movementTypeLabel;
  protected readonly typeTone = movementTypeTone;

  protected onToggleSelection(event: DataTableSelectionEvent<StockMovementRow>): void {
    this.selection.toggle(event.row.id, event.selected);
  }

  /** La checkbox di testata agisce sulle righe CARICATE (`14` §4.1). */
  protected onToggleSelectAll(checked: boolean): void {
    this.selection.setAll(
      this.rows().map((row) => row.id),
      checked,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }

  private movimentiDelBersaglio(bersaglio: ListActionTarget): readonly StockMovementRow[] {
    return bersaglio.scope === 'selection' ? this.selectedMovements() : this.rows();
  }

  private printSelection(bersaglio: ListActionTarget): void {
    const righe = this.movimentiDelBersaglio(bersaglio);
    if (righe.length === 0) {
      return;
    }
    const finestra = window.open('', '_blank');
    if (!finestra) {
      return;
    }
    finestra.document.write(buildListPrintHtml(righe, MOVEMENT_LIST_EXPORT));
    finestra.document.close();
    finestra.focus();
    finestra.print();
  }

  private exportCsv(bersaglio: ListActionTarget): void {
    const righe = this.movimentiDelBersaglio(bersaglio);
    if (righe.length === 0) {
      return;
    }
    downloadBlob(
      new Blob([buildListCsv(righe, MOVEMENT_LIST_EXPORT)], { type: 'text/csv;charset=utf-8' }),
      listExportFileName(MOVEMENT_LIST_EXPORT, 'csv'),
    );
  }
}
