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
import type { Subscription } from 'rxjs';

import { customerDisplayName } from '@core/models/customer.model';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';

import type { PageMeta } from '@core/models/api.model';
import { AuthService } from '@core/auth';
import {
  canExportOperationalData,
  canManageCustomers,
} from '@core/permissions/tenant-permissions.util';
import { CUSTOMERS_CSV_EXPORT_ID } from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import type { Customer } from '@core/models/customer.model';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import type { ListAction } from '@shared/models/list-selection.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { ShopifySyncFeedbackComponent } from '@domain/channels/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import {
  canSyncShopifyCustomersOrOrders,
  isShopifyConnected,
} from '@domain/channels/shopify/models/shopify-page-sync.util';
import {
  formatShopifyCustomersSyncFeedback,
  type ShopifySyncFeedback,
} from '@domain/channels/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@domain/channels/shopify/services/shopify-sync-watch.service';
import { CustomerTableComponent } from './components/customer-table/customer-table.component';
import {
  DEFAULT_CUSTOMER_PAGE_SIZE,
  parseCustomerListQuery,
} from '@domain/customers/models/customer-list-query.model';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  CUSTOMER_LIST_COLUMN_DEFS,
  CUSTOMER_LIST_COLUMN_PRESETS,
  CUSTOMER_LIST_VIEW,
} from './models/customer-table-columns.config';

const SEARCH_DEBOUNCE_MS = 300;
const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_CUSTOMER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type CustomerListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly customers: readonly Customer[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/** Lista clienti (smart). URL come fonte di verita' (page, search). */
@Component({
  selector: 'app-customer-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListActionsBarComponent,
    ListPageComponent,
    CustomerTableComponent,
    ShopifySyncFeedbackComponent,
    DeleteConfirmComponent,
  ],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss',
})
export class CustomerListComponent {
  private readonly service = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly blobExport = inject(BackgroundBlobExportService);
  private readonly authService = inject(AuthService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly customerListView = CUSTOMER_LIST_VIEW;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly skeletonColumns = 5;

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseCustomerListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly shopifyCustomersLoading = signal(false);
  protected readonly exporting = computed(() => this.blobExport.isActive(CUSTOMERS_CSV_EXPORT_ID));
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  protected readonly showShopifyCustomersSync = computed(
    () =>
      isShopifyConnected(this.shopifyConnection()) &&
      canSyncShopifyCustomersOrOrders(this.authService.currentUser()),
  );

  protected readonly canManage = computed(() => canManageCustomers(this.authService.currentUser()));

  protected readonly canExportData = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        // ⭐ `tutto`: l'elenco mostra tutte le righe del filtro, non una pagina.
        this.service.getCustomers(query, { tutto: true }).pipe(
          map((response): CustomerListState => ({
            status: 'success',
            customers: response.data,
            meta: response.meta,
          })),
          startWith<CustomerListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<CustomerListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CustomerListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly customers = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.customers : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      CUSTOMER_LIST_VIEW,
      CUSTOMER_LIST_COLUMN_DEFS,
      CUSTOMER_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(CUSTOMER_LIST_VIEW);

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));

    this.shopifySyncWatch
      .watchRemoteDataChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, page: null }, true);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected syncCustomersFromShopify(): void {
    if (this.shopifyCustomersLoading()) {
      return;
    }

    this.shopifyCustomersLoading.set(true);
    this.clearShopifyFeedback();
    this.shopifySyncError.set(null);

    this.shopifyConnectionService
      .syncCustomers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.shopifyCustomersLoading.set(false);
          this.showShopifyFeedback(formatShopifyCustomersSyncFeedback(result));
          this.reload();
        },
        error: (err: unknown) => {
          this.shopifyCustomersLoading.set(false);
          this.shopifySyncError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected exportCustomers(): void {
    if (this.exporting()) {
      return;
    }

    const { page: _page, pageSize: _pageSize, ...filters } = this.query();

    this.blobExport.start({
      exportId: CUSTOMERS_CSV_EXPORT_ID,
      request: this.service.exportCustomersCsv(filters),
      filename: vestiflowExportFilename('clienti', 'csv'),
      inProgressMessage: 'Export clienti in corso. Puoi continuare a navigare.',
      successMessage: 'Export clienti completato: download avviato.',
      errorMessage: 'Export clienti non riuscito. Riprova tra qualche istante.',
    });
  }

  protected dismissShopifyFeedback(): void {
    this.clearShopifyFeedback();
  }

  /**
   * ⭐ **I comandi dell'elenco, tutti nella barra in basso** (`14` §0.2).
   *
   * ⚠️ I permessi stanno QUI, non nel template: la condizione che decide se un
   * comando esiste sta dove il comando si dichiara, non in un `@if` altrove.
   */
  /*
    ⭐ **La selezione mancava, ed era la differenza che si vedeva** (30/08/2026):
    senza la sua colonna, la prima colonna dei clienti partiva da un'altra
    posizione e l'elenco «sembrava» un altro telaio. Era lo stesso telaio —
    `list-page` e `list-page-fills-viewport`, come i prodotti — con una colonna in
    meno.

    ⚠️ **Oggi la selezione non ha ancora azioni proprie qui**: l'API clienti non
    espone né eliminazione né duplicazione, quindi la barra resta quella che era.
    Serve comunque, ed è utile da subito: il conteggio della riga totali la segue.
  */
  private readonly selection = createListSelection('multiple');

  /**
   * ⭐ **La modalità «Seleziona» della vista a card**, dal telaio.
   *
   * ⛔ Non è scritta qui: `createSelectionMode` porta con sé la regola che
   * spegnerla AZZERA la selezione — a modalità spenta il tocco torna ad aprire
   * la riga, e non resta nessun gesto per deselezionare.
   */
  protected readonly modoSelezione = createSelectionMode(this.selection);

  protected readonly selectedCustomerIds = this.selection.ids;

  /**
   * ⛔ **Al cambio di filtro la selezione si restringe alle righe caricate.**
   * Senza, la barra conterebbe schede che l'operatore non vede più e un'azione —
   * eliminare, per esempio — agirebbe su clienti che credeva di aver lasciato
   * indietro. È la «selezione invisibile o ingannevole» che `14` §15 vieta.
   */
  private readonly potaturaSelezione = toObservable(this.customers)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((righe) => this.selection.prune(righe.map((r) => r.id)));

  // ── Eliminazione: la sequenza a due conferme sta nel componente condiviso ──
  protected readonly deleteWarnOpen = signal(false);
  protected readonly deleteBusy = signal(false);
  private readonly pendingDeleteIds = signal<readonly string[]>([]);

  /*
    ⚠️ **Il titolo NOMINA chi sparisce**, non l'operazione: «Elimina Mario Rossi»
    dice all'operatore che cosa sta per perdere.
  */
  protected readonly deleteWarnTitle = computed(() => {
    const ids = this.pendingDeleteIds();
    if (ids.length === 1) {
      const cliente = this.customers().find((c) => c.id === ids[0]);
      return cliente ? `Elimina ${customerDisplayName(cliente)}` : 'Elimina cliente';
    }
    return `Elimina ${ids.length} clienti`;
  });

  /*
    ⭐ **La conseguenza dice che cosa NON sparisce**, ed è la parte che conta: chi
    elimina un cliente teme di perdere le fatture. Non le perde — il nome resta
    scritto su ogni documento, sparisce solo la scheda.

    ⚠️ È la stessa promessa che l'unità di misura e il Codice IVA fanno già, e
    va detta con le stesse parole: «il dato resta come testo».
  */
  protected readonly deleteWarnMessage = computed(() => {
    const n = this.pendingDeleteIds().length;
    const soggetto = n === 1 ? 'La scheda sparisce' : `Le ${n} schede spariscono`;
    return `${soggetto} dall'anagrafica. Documenti, ordini e vendite restano invariati: il nome resta scritto su ognuno, e si continua a leggere.`;
  });

  private duplicaCliente(id: string): void {
    this.service
      .duplicateCustomer(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (copia) => void this.router.navigate(['/app/customers', copia.id, 'edit']),
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
          this.service.deleteCustomer(id).pipe(
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
          // La potatura arriva col ricaricamento; questo toglie subito ciò che
          // non c'è più, senza aspettare il giro di rete.
          for (const id of eliminati) {
            this.selection.toggle(id, false);
          }
        }
        this.reload();
      });
  }

  protected toggleCustomerSelection(customerId: string, selected: boolean): void {
    this.selection.toggle(customerId, selected);
  }

  /*
    ⚠️ **«Tutti» sono tutti quelli del FILTRO**, non della pagina: da quando
    l'elenco non impagina più, le due cose coincidono — ed è una delle ragioni per
    cui l'impaginazione è stata tolta prima e non dopo.
  */
  protected toggleSelectAll(selected: boolean): void {
    this.selection.setAll(
      this.customers().map((c) => c.id),
      selected,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }

  protected readonly listActions = computed<readonly ListAction[]>(() => {
    const azioni: ListAction[] = [];

    if (this.canManage()) {
      azioni.push(
        comando('new', {
          ariaLabel: 'Nuovo cliente',
          run: () => void this.router.navigate(['/app/customers/new']),
        }),
      );
    }

    /*
      ⭐ **Duplica**: `requires: 'one'` dal catalogo — si duplica una scheda per
      volta, e a selezione multipla il comando è spento CON il motivo.

      ⚠️ **Apre la copia**, non resta sull'elenco: si duplica per rifinire, e la
      prima cosa da fare è cambiare ciò che deve essere diverso.
    */
    if (this.canManage()) {
      azioni.push(
        comando('duplicate', {
          ariaLabel: 'Duplica il cliente selezionato',
          run: (target) => {
            if (target.scope === 'selection' && target.ids[0]) {
              this.duplicaCliente(target.ids[0]);
            }
          },
        }),
      );
    }

    /*
      ⭐ **Elimina, dal catalogo** (30/08/2026): `requires: 'oneOrMore'`, quindi a
      selezione vuota c'è ed è spento CON il motivo.

      ⚠️ **Stesso permesso della modifica**: chi può cambiare un'anagrafica può
      toglierla. Un permesso a sé sarebbe una terza autorità su un'entità che ne
      ha già una.
    */
    if (this.canManage()) {
      azioni.push(
        comando('delete', {
          busy: this.deleteBusy(),
          ariaLabel: 'Elimina i clienti selezionati',
          run: (target) => {
            if (target.scope === 'selection') {
              this.requestDeleteSelection(target.ids);
            }
          },
        }),
      );
    }

    if (this.canExportData()) {
      // ⭐ **Esporta è il MENU dei tracciati**, non un pulsante per formato
      //    (`14` §5.2, deciso dal proprietario il 30/08/2026). Qui era
      //    «Esporta CSV» diretto, e su altre pagine «Esporta» con le voci:
      //    la stessa cosa aveva due forme.
      azioni.push(
        comando('export', {
          busy: this.exporting(),
          ariaLabel: "Esporta l'elenco clienti",
          items: [voceEsporta('csv', () => this.exportCustomers())],
        }),
      );
    }

    if (this.showShopifyCustomersSync()) {
      azioni.push({
        id: 'shopify-sync',
        label: 'Sincronizza da Shopify',
        icon: 'pi-sync',
        requires: 'none',
        busy: this.shopifyCustomersLoading(),
        run: () => this.syncCustomersFromShopify(),
      });
    }

    return azioni;
  });

  protected openCustomer(customer: Customer): void {
    void this.router.navigate(['/app/customers', customer.id]);
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

  private showShopifyFeedback(feedback: ShopifySyncFeedback): void {
    this.clearShopifyFeedback();
    this.shopifyFeedback.set(feedback);
    this.shopifyFeedbackTimer = setTimeout(() => {
      this.shopifyFeedback.set(null);
      this.shopifyFeedbackTimer = null;
    }, SHOPIFY_FEEDBACK_DISMISS_MS);
  }

  private clearShopifyFeedback(): void {
    if (this.shopifyFeedbackTimer) {
      clearTimeout(this.shopifyFeedbackTimer);
      this.shopifyFeedbackTimer = null;
    }
    this.shopifyFeedback.set(null);
  }

  private extractErrorMessage(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Operazione non riuscita. Riprova.';
  }
}
