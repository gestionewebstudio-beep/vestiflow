import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { InventoryCountStatus } from '@core/models/inventory-count.model';
import type { InventoryCountSession } from '@core/models/inventory-count.model';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { comando } from '@shared/models/list-action-catalog';
import type { ListAction } from '@shared/models/list-selection.model';

import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';

import {
  INVENTORY_COUNT_COLUMN_DEFS,
  INVENTORY_COUNT_COLUMN_PRESETS,
} from './models/inventory-count-table-columns.config';
import { InventoryCountTableComponent } from './components/inventory-count-table/inventory-count-table.component';
import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { InventoryService } from '@domain/inventory/services/inventory.service';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';
import { GroupByMenuComponent } from '@shared/components/group-by-menu/group-by-menu.component';

type CountListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sessions: readonly InventoryCountSession[] }
  | { readonly status: 'error'; readonly error: AppError };

/** Elenco sessioni inventario fisico. */
@Component({
  selector: 'app-inventory-count-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GroupByMenuComponent,
    ListPageComponent,
    ListActionsBarComponent,
    DeleteConfirmComponent,
    InventoryTabsComponent,
    InventoryCountTableComponent,
  ],
  templateUrl: './inventory-count-list.component.html',
  styleUrl: './inventory-count-list.component.scss',
})
export class InventoryCountListComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  /*
    ⭐ **Il selettore Colonne, che qui non c'era**: la tabella aveva sette `<th>`
    fissi, quindi niente da scegliere. È l'ultima schermata a prenderlo (30/08/2026).
  */
  protected readonly tableViewId = TableViewId.InventoryCounts;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 6;
  private readonly refreshTick = signal(0);

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.InventoryCounts,
      INVENTORY_COUNT_COLUMN_DEFS,
      INVENTORY_COUNT_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.InventoryCounts);
  }

  protected readonly deleteDialogOpen = signal(false);
  protected readonly deleteLoading = signal(false);
  private readonly sessionsToDelete = signal<readonly InventoryCountSession[]>([]);

  protected readonly deleteConfirmMessage = computed(() => {
    const scelte = this.sessionsToDelete();
    if (scelte.length === 0) {
      return '';
    }
    // ⚠️ Una sola si nomina: chi la elimina deve poter riconoscere QUALE prima
    //    di confermare. Da due in su il nome diventa un elenco lungo dentro un
    //    dialogo, e il numero dice abbastanza.
    const sola = scelte.length === 1 ? scelte[0] : undefined;
    if (sola) {
      return `La sessione "${sola.name}" verrà eliminata definitivamente dall'elenco. Operazione non reversibile.`;
    }
    return `${scelte.length} sessioni annullate verranno eliminate definitivamente dall'elenco. Operazione non reversibile.`;
  });

  private readonly listState = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        this.inventoryService.listInventoryCounts().pipe(
          map((sessions): CountListState => ({
            status: 'success',
            sessions,
          })),
          catchError((error: unknown) =>
            of({
              status: 'error' as const,
              error: isAppError(error)
                ? error
                : {
                    kind: AppErrorKind.Unknown,
                    message: 'Impossibile caricare le sessioni inventario.',
                  },
            }),
          ),
          startWith({ status: 'loading' } satisfies CountListState),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CountListState },
  );

  protected readonly loading = computed(() => this.listState().status === 'loading');
  protected readonly error = computed((): AppError | null => {
    const state = this.listState();
    return state.status === 'error' ? state.error : null;
  });
  protected readonly sessions = computed((): readonly InventoryCountSession[] => {
    const state = this.listState();
    return state.status === 'success' ? state.sessions : [];
  });
  protected readonly isEmpty = computed(
    () => this.listState().status === 'success' && this.sessions().length === 0,
  );

  /**
   * ⭐ **I comandi dell'elenco, tutti nella barra in basso** (`14` §0.2).
   *
   * ⚠️ «Nuova sessione» stava in testata: si è spostata, non duplicata.
   */
  // ── Selezione ─────────────────────────────────────────────────────────────
  private readonly selection = createListSelection('multiple');

  /**
   * ⭐ **La modalità «Seleziona» della vista a card**, dal telaio.
   *
   * ⛔ Non è scritta qui: `createSelectionMode` porta con sé la regola che
   * spegnerla AZZERA la selezione — a modalità spenta il tocco torna ad aprire
   * la riga, e non resta nessun gesto per deselezionare.
   */
  protected readonly modoSelezione = createSelectionMode(this.selection);

  protected readonly selectedSessionIds = this.selection.ids;

  /** ⛔ Al cambio di filtro la selezione si restringe alle righe caricate. */
  private readonly potaturaSelezione = toObservable(this.sessions)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((righe) => this.selection.prune(righe.map((s) => s.id)));

  protected toggleSessionSelection(sessionId: string, selected: boolean): void {
    this.selection.toggle(sessionId, selected);
  }

  protected toggleSelectAllSessions(selected: boolean): void {
    this.selection.setAll(
      this.sessions().map((s) => s.id),
      selected,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
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
    this.raggruppa.set(value);
  }

  /** Fra le selezionate, quelle che la regola di dominio lascia eliminare. */
  private readonly selezionateEliminabili = computed(() => {
    const scelte = this.selectedSessionIds();
    return this.sessions().filter(
      (s) => scelte.has(s.id) && s.status === InventoryCountStatus.Cancelled,
    );
  });

  protected readonly listActions = computed<readonly ListAction[]>(() => {
    const scelte = this.selectedSessionIds().size;
    const eliminabili = this.selezionateEliminabili().length;
    return [
      // ⚠️ L'etichetta differisce dal catalogo, ed è voluto: «Nuovo» sotto
      //    «Inventario» direbbe cosa si crea solo a chi lo sa già — una sessione
      //    di conteggio non è un documento.
      comando('new', {
        label: 'Nuova sessione',
        ariaLabel: 'Avvia una nuova sessione di inventario',
        run: () => this.newSession(),
      }),
      /*
        ⭐ **Elimina è passata dalla RIGA alla barra** — `14` §«Tutte le funzioni
        stanno nella barra in basso» (29/08/2026) e §«Il menu tre-puntini di riga
        SPARISCE» (30/08/2026). Qui era rimasto un cestino dentro la riga: uno
        dei due elenchi che non avevano seguito la decisione.

        ⚠️ **La regola di dominio non cambia**: si elimina solo una sessione
        ANNULLATA — una completata è la traccia di un conteggio avvenuto. Da
        pulsante di riga quella regola faceva sparire il cestino; nella barra
        diventa un'azione **spenta con il motivo**, che è la forma prescritta:
        l'operatore legge perché non si può, invece di non trovare il comando.
      */
      comando('delete', {
        label: eliminabili === scelte ? 'Elimina' : `Elimina ${eliminabili} di ${scelte}`,
        disabled: scelte > 0 && eliminabili === 0,
        disabledReason:
          'Si eliminano solo le sessioni annullate: una completata è la traccia di un conteggio avvenuto.',
        busy: this.deleteLoading(),
        run: () => this.requestDeleteSelection(),
      }),
    ];
  });

  /**
   * ⚠️ **Il dialogo di conferma resta uno**, e chiede su un elenco di sessioni
   * invece che su una sola: il contratto della barra è che l'azione lavora sulla
   * SELEZIONE, e una selezione può contenerne più d'una.
   */
  protected requestDeleteSelection(): void {
    const eliminabili = this.selezionateEliminabili();
    if (eliminabili.length === 0) {
      return;
    }
    this.sessionsToDelete.set(eliminabili);
    this.deleteDialogOpen.set(true);
  }

  protected newSession(): void {
    void this.router.navigate(['/app/inventory/counts/new']);
  }

  protected openSession(session: InventoryCountSession): void {
    void this.router.navigate(['/app/inventory/counts', session.id]);
  }

  protected reload(): void {
    this.refreshTick.update((value) => value + 1);
  }

  protected confirmDelete(): void {
    const scelte = this.sessionsToDelete();
    if (scelte.length === 0 || this.deleteLoading()) {
      return;
    }

    this.deleteLoading.set(true);
    // ⚠️ `forkJoin` e non una catena: le eliminazioni sono indipendenti fra
    //    loro, e una per volta farebbe attendere N round-trip in fila.
    forkJoin(scelte.map((session) => this.inventoryService.deleteInventoryCount(session.id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteLoading.set(false);
          this.deleteDialogOpen.set(false);
          this.sessionsToDelete.set([]);
          // ⚠️ La selezione si azzera: punterebbe a righe che non esistono più.
          this.clearSelection();
          this.reload();
        },
        error: () => {
          this.deleteLoading.set(false);
        },
      });
  }
}
