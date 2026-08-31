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
  concatMap,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
  take,
  toArray,
} from 'rxjs';

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier } from '@core/models/supplier.model';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { comando } from '@shared/models/list-action-catalog';
import type { ListAction } from '@shared/models/list-selection.model';

import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { SupplierTableComponent } from './components/supplier-table/supplier-table.component';
import {
  SUPPLIER_LIST_COLUMN_DEFS,
  SUPPLIER_LIST_COLUMN_PRESETS,
} from './models/supplier-table-columns.config';
import {
  DEFAULT_SUPPLIER_PAGE_SIZE,
  parseSupplierListQuery,
  supplierListQueryToParams,
} from './models/supplier-list-query.model';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_SUPPLIER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type SupplierListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly suppliers: readonly Supplier[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-supplier-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListActionsBarComponent,
    ListPageComponent,
    SupplierTableComponent,
    DeleteConfirmComponent,
  ],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.scss',
})
export class SupplierListComponent {
  private readonly service = inject(SupplierService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.SuppliersList;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 5;
  protected readonly canManage = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  private readonly refreshTick = signal(0);
  /**
   * ⚠️ Lo scrive il telaio: `app-list-page` possiede il campo di ricerca e
   *    emette la stringa. Qui non c'è più un gestore di evento — il
   *    `(input)` con il cast a `HTMLInputElement` viveva in undici pagine.
   */
  protected readonly searchDraft = signal('');
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  private readonly listQuery = computed(() => ({
    ...parseSupplierListQuery(this.queryParams()),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap(({ page, pageSize, search }) =>
        // ⭐ `tutto`: l'elenco mostra tutte le righe del filtro, non una pagina.
        this.service.list({ page, pageSize, search }, { tutto: true }).pipe(
          map((response): SupplierListState => ({
            status: 'success',
            suppliers: response.data,
            meta: response.meta,
          })),
          startWith<SupplierListState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies SupplierListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly suppliers = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.suppliers : [];
  });
  protected readonly meta = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });
  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.suppliers().length === 0,
  );

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.SuppliersList,
      SUPPLIER_LIST_COLUMN_DEFS,
      SUPPLIER_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.SuppliersList);

    toObservable(this.queryParams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.searchDraft.set(params.get('search') ?? '');
      });

    toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => {
        const current = parseSupplierListQuery(this.queryParams());
        if (search === current.search) {
          return;
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: supplierListQueryToParams({ ...current, page: 1, search }),
        });
      });
  }

  protected resetFilters(): void {
    const current = parseSupplierListQuery(this.queryParams());
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: supplierListQueryToParams({ ...current, page: 1, search: '' }),
    });
  }

  /**
   * ⭐ **I comandi dell'elenco, tutti nella barra in basso** (`14` §0.2).
   *
   * ⚠️ L'etichetta è corta perché il nome dell'entità è già scritto sopra, a
   * caratteri grandi: «Nuovo» sotto «Fornitori» non è ambiguo. Il nome per
   * esteso resta nell'`ariaLabel`, per chi la pagina non la vede.
   */
  protected readonly listActions = computed<readonly ListAction[]>(() =>
    this.canManage()
      ? [
          comando('new', {
            ariaLabel: 'Nuovo fornitore',
            run: () => this.createSupplier(),
          }),
          /*
            ⭐ **Duplica**: `requires: 'one'` dal catalogo — una scheda per volta.
            Apre la copia, perché si duplica per rifinire.
          */
          comando('duplicate', {
            ariaLabel: 'Duplica il fornitore selezionato',
            run: (target) => {
              if (target.scope === 'selection' && target.ids[0]) {
                this.duplicaFornitore(target.ids[0]);
              }
            },
          }),
          /*
            ⭐ **Elimina**: `requires: 'oneOrMore'`, con la doppia conferma del
            componente condiviso. Lo storico resta — vedi `delete` nel servizio API.
          */
          comando('delete', {
            busy: this.deleteBusy(),
            ariaLabel: 'Elimina i fornitori selezionati',
            run: (target) => {
              if (target.scope === 'selection') {
                this.requestDeleteSelection(target.ids);
              }
            },
          }),
        ]
      : [],
  );

  // ── Selezione ─────────────────────────────────────────────────────────────
  protected readonly selectedSupplierIds = signal<ReadonlySet<string>>(new Set<string>());

  protected toggleSupplierSelection(supplierId: string, selected: boolean): void {
    this.selectedSupplierIds.update((correnti) => {
      const prossimi = new Set(correnti);
      if (selected) {
        prossimi.add(supplierId);
      } else {
        prossimi.delete(supplierId);
      }
      return prossimi;
    });
  }

  protected toggleSelectAll(selected: boolean): void {
    this.selectedSupplierIds.set(
      selected ? new Set(this.suppliers().map((s) => s.id)) : new Set<string>(),
    );
  }

  protected clearSelection(): void {
    this.selectedSupplierIds.set(new Set<string>());
  }

  // ── Eliminazione: la sequenza a due conferme sta nel componente condiviso ──
  protected readonly deleteWarnOpen = signal(false);
  protected readonly deleteBusy = signal(false);
  private readonly pendingDeleteIds = signal<readonly string[]>([]);

  /** ⚠️ Il titolo NOMINA chi sparisce, non l'operazione. */
  protected readonly deleteWarnTitle = computed(() => {
    const ids = this.pendingDeleteIds();
    if (ids.length === 1) {
      const fornitore = this.suppliers().find((s) => s.id === ids[0]);
      return fornitore ? `Elimina ${fornitore.name}` : 'Elimina fornitore';
    }
    return `Elimina ${ids.length} fornitori`;
  });

  /*
    ⭐ **La conseguenza dice che cosa NON sparisce.** Chi elimina un fornitore teme
    di perdere ordini e fatture d'acquisto: non li perde — il nome resta scritto su
    ognuno.

    ⚠️ **E dice anche che cosa sparisce davvero**: i legami prodotto-fornitore,
    che erano SUOI. È l'unica cosa che si perde, e va detta prima.
  */
  protected readonly deleteWarnMessage = computed(() => {
    const n = this.pendingDeleteIds().length;
    const soggetto = n === 1 ? 'La scheda sparisce' : `Le ${n} schede spariscono`;
    return `${soggetto} dall'anagrafica, insieme ai collegamenti con gli articoli. Ordini e documenti restano invariati: il nome resta scritto su ognuno.`;
  });

  private duplicaFornitore(id: string): void {
    this.service
      .duplicateSupplier(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (copia) => void this.router.navigate(['/app/suppliers', copia.id, 'edit']),
      });
  }

  private requestDeleteSelection(ids: readonly string[]): void {
    if (ids.length === 0 || this.deleteBusy()) {
      return;
    }
    this.pendingDeleteIds.set(ids);
    this.deleteWarnOpen.set(true);
  }

  protected onDeleteCancel(): void {
    if (this.deleteBusy()) {
      return;
    }
    this.pendingDeleteIds.set([]);
  }

  /*
    ⚠️ **`concatMap`, non `forkJoin`**: una per una, così un fallimento a metà
    lascia uno stato leggibile invece di un esito unico che non dice quali.
  */
  protected onDeleteConfirm(): void {
    const ids = this.pendingDeleteIds();
    if (ids.length === 0 || this.deleteBusy()) {
      this.deleteWarnOpen.set(false);
      return;
    }
    this.deleteBusy.set(true);
    from(ids)
      .pipe(
        concatMap((id) =>
          this.service.deleteSupplier(id).pipe(
            map(() => ({ ok: true, id })),
            catchError(() => of({ ok: false, id })),
          ),
        ),
        toArray(),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((esiti) => {
        this.deleteBusy.set(false);
        this.deleteWarnOpen.set(false);
        this.pendingDeleteIds.set([]);
        const eliminati = new Set(esiti.filter((e) => e.ok).map((e) => e.id));
        if (eliminati.size > 0) {
          this.selectedSupplierIds.update(
            (correnti) => new Set([...correnti].filter((id) => !eliminati.has(id))),
          );
        }
        this.reload();
      });
  }

  protected openSupplier(supplier: Supplier): void {
    void this.router.navigate(['/app/suppliers', supplier.id]);
  }

  private createSupplier(): void {
    void this.router.navigate(['/app/suppliers/new']);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  private toErrorState(err: unknown): SupplierListState {
    if (isAppError(err)) {
      return { status: 'error', error: err };
    }
    return { status: 'error', error: { kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } };
  }
}
