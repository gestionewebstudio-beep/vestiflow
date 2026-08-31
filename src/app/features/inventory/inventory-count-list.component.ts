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
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
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

type CountListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sessions: readonly InventoryCountSession[] }
  | { readonly status: 'error'; readonly error: AppError };

/** Elenco sessioni inventario fisico. */
@Component({
  selector: 'app-inventory-count-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  private readonly sessionToDelete = signal<InventoryCountSession | null>(null);

  protected readonly deleteConfirmMessage = computed(() => {
    const session = this.sessionToDelete();
    if (!session) {
      return '';
    }
    return `La sessione "${session.name}" verrà eliminata definitivamente dall'elenco. Operazione non reversibile.`;
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
  protected readonly listActions = computed<readonly ListAction[]>(() => [
    // ⚠️ L'etichetta differisce dal catalogo, ed è voluto: «Nuovo» sotto
    //    «Inventario» direbbe cosa si crea solo a chi lo sa già — una sessione
    //    di conteggio non è un documento.
    comando('new', {
      label: 'Nuova sessione',
      ariaLabel: 'Avvia una nuova sessione di inventario',
      run: () => this.newSession(),
    }),
  ]);

  protected newSession(): void {
    void this.router.navigate(['/app/inventory/counts/new']);
  }

  protected openSession(session: InventoryCountSession): void {
    void this.router.navigate(['/app/inventory/counts', session.id]);
  }

  protected reload(): void {
    this.refreshTick.update((value) => value + 1);
  }

  protected requestDelete(session: InventoryCountSession): void {
    this.sessionToDelete.set(session);
    this.deleteDialogOpen.set(true);
  }

  protected confirmDelete(): void {
    const session = this.sessionToDelete();
    if (!session || this.deleteLoading()) {
      return;
    }

    this.deleteLoading.set(true);
    this.inventoryService
      .deleteInventoryCount(session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteLoading.set(false);
          this.deleteDialogOpen.set(false);
          this.sessionToDelete.set(null);
          this.reload();
        },
        error: () => {
          this.deleteLoading.set(false);
        },
      });
  }
}
