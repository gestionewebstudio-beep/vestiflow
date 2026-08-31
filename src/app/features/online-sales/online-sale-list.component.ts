import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
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
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import {
  ONLINE_SALE_LIST_COLUMN_DEFS,
  ONLINE_SALE_LIST_COLUMN_PRESETS,
} from './models/online-sale-list-columns.config';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import {
  onlineSaleInventoryStatusLabel,
  onlineSaleInventoryStatusTone,
} from '@domain/sales-orders/models/sales-order-labels.util';
import { GroupByMenuComponent } from '@shared/components/group-by-menu/group-by-menu.component';
import { ListSummaryComponent } from '@shared/components/list-summary/list-summary.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { OnlineSaleListQuery, OnlineSaleRow } from './models/online-sale.model';
import { OnlineSalesService } from './services/online-sales.service';
import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import { sezioniDiElenco } from '@shared/models/list-grouping.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_META: PageMeta = { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 };

type ListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly sales: readonly OnlineSaleRow[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Registro Vendite online (fase 3 §4): solo vendite generate dagli ordini
 * evasi (regola invariante 3). Read-only: nessuna schermata crea o modifica
 * vendite. URL come fonte di verità (page, search, canale, periodo evasione).
 */
@Component({
  selector: 'app-online-sale-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListSummaryComponent,
    GroupByMenuComponent,
    ListPageComponent,
    BadgeComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    DataTableComponent,
    DateInputComponent,
    SelectMenuComponent,
  ],
  templateUrl: './online-sale-list.component.html',
  styleUrl: './online-sale-list.component.scss',
})
export class OnlineSaleListComponent {
  private readonly service = inject(OnlineSalesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.OnlineSalesList;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 8;

  protected readonly channelOptions: readonly SelectMenuOption[] = [
    { value: 'online', label: 'Shopify online' },
    { value: 'pos', label: 'Shopify POS' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed((): OnlineSaleListQuery => {
    const params = this.queryParams();
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    const fulfilledFrom = params.get('fulfilledFrom') ?? '';
    const fulfilledTo = params.get('fulfilledTo') ?? '';
    return {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize:
        Number.isInteger(pageSize) && PAGE_SIZE_OPTIONS.includes(pageSize)
          ? pageSize
          : DEFAULT_PAGE_SIZE,
      search: params.get('search')?.trim() || undefined,
      channel: params.get('channel') ?? undefined,
      fulfilledFrom: ISO_DATE.test(fulfilledFrom) ? fulfilledFrom : undefined,
      fulfilledTo: ISO_DATE.test(fulfilledTo) ? fulfilledTo : undefined,
    };
  });

  private readonly refreshTick = signal(0);
  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        // ⭐ `tutto`: l'elenco mostra tutte le righe del filtro, non una pagina.
        this.service.getOnlineSales(query, { tutto: true }).pipe(
          map((response): ListState => ({
            status: 'success',
            sales: response.data,
            meta: response.meta,
          })),
          startWith<ListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly sales = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.sales : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  /** Pannello filtri mobile (layout comune pagine-registro): pulsante «Filtri (n)». */
  /**
   * Quanti filtri sono attivi, per il badge del pulsante «Filtri». La ricerca
   * non conta: ha il suo campo sempre visibile. Dal/Al formano un unico
   * intervallo e valgono uno.
   */
  protected readonly activeFilterCount = computed(() => {
    const q = this.query();
    let count = 0;
    if (q.channel) count++;
    if (q.fulfilledFrom ?? q.fulfilledTo) count++;
    return count;
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.OnlineSalesList,
      ONLINE_SALE_LIST_COLUMN_DEFS,
      ONLINE_SALE_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.OnlineSalesList);

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));
  }

  protected onChannelFilterChange(value: string | null): void {
    this.updateParams({ channel: value, page: null }, true);
  }

  protected onFulfilledFromChange(value: string): void {
    this.updateParams({ fulfilledFrom: value || null, page: null }, true);
  }

  protected onFulfilledToChange(value: string): void {
    this.updateParams({ fulfilledTo: value || null, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams(
      { search: null, channel: null, fulfilledFrom: null, fulfilledTo: null, page: null },
      true,
    );
  }

  // ── La tabella, sul motore comune (`14` parte H) ────────────────────────

  // ── Raggruppa ─────────────────────────────────────────────────────────────

  /**
   * ⚠️ **Raggruppa è PRESENTAZIONE, non un filtro**: non entra in nessuna query,
   * non conta nel badge «Filtri (n)» e «Azzera filtri» non lo tocca. Le righe
   * restano le stesse — cambia come si leggono.
   */
  protected readonly raggruppa = signal<string>('none');
  protected readonly raggruppaPerGiornata = computed(() => this.raggruppa() === 'day');

  protected onRaggruppaChange(value: string): void {
    this.raggruppa.set(value);
  }

  /**
   * ⭐ **Si raggruppa per la data che l'elenco MOSTRA** — l'evasione, non
   * l'ordine: raggruppare per una data che non è in nessuna colonna darebbe
   * intestazioni che non corrispondono a niente di visibile.
   *
   * ⚠️ **Il subtotale somma le righe caricate**, ed è corretto: l'elenco non
   * impagina, quindi ciò che ha in mano **è** il risultato del filtro. Stessa
   * aritmetica della riga totali, un livello più in basso.
   */
  protected readonly tableSections = computed<readonly DataTableSection<OnlineSaleRow>[]>(() => {
    const valuta = this.sales()[0]?.currency ?? DEFAULT_CURRENCY;
    return sezioniDiElenco(this.sales(), this.raggruppaPerGiornata(), {
      idPiatto: 'all',
      giornoDi: (sale) => sale.fulfilledAt,
      columns: this.tableColumns(),
      emphasis: 'total',
      campi: {
        total: {
          valore: (sale) => sale.totalMinor,
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
    const valuta = this.sales()[0]?.currency ?? DEFAULT_CURRENCY;
    return totaliDiElenco(this.sales(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.tableColumns(),
      campi: {
        total: {
          valore: (s) => s.totalMinor,
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
    return colonnaVisibile(this.tableColumns(), columnId);
  }

  protected readonly rowId = (sale: OnlineSaleRow): string => sale.id;

  protected readonly rowLabel = (sale: OnlineSaleRow): string =>
    `Apri vendita online ${sale.reference} dell'ordine ${sale.orderNumber}`;

  /**
   * ⭐ **Il testo di una cella sta QUI, una volta sola**: la tabella lo usa per
   * il desktop, per la card mobile e per la ricerca. Un template che rendesse
   * un testo diverso sarebbe una seconda verità.
   */
  protected readonly cellText = (sale: OnlineSaleRow, columnId: string): string => {
    switch (columnId) {
      case 'reference':
        return sale.reference;
      case 'channel':
        return sale.channelLabel;
      case 'orderNumber':
        return sale.orderNumber;
      case 'fulfilledAt':
        return formatDate(sale.fulfilledAt);
      case 'customer':
        return sale.customerName;
      case 'location':
        return sale.locationName ?? '—';
      case 'total':
        return formatMoney({ amountMinor: sale.totalMinor, currencyCode: sale.currency });
      case 'inventoryStatus':
        return this.inventoryLabel(sale.inventoryStatus);
      case 'ddt':
        return sale.ddtReference ?? '—';
      case 'refund':
        return sale.refundedAt ? `Rimborso ${formatDate(sale.refundedAt)}` : '—';
      default:
        return '';
    }
  };

  protected readonly inventoryLabel = onlineSaleInventoryStatusLabel;
  protected readonly inventoryTone = onlineSaleInventoryStatusTone;

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openSale(sale: OnlineSaleRow): void {
    void this.router.navigate(['/app/sales/online', sale.id]);
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
}
