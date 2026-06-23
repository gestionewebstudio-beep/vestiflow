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
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryCountTableComponent } from './components/inventory-count-table/inventory-count-table.component';
import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { InventoryService } from './services/inventory.service';

type CountListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sessions: readonly InventoryCountSession[] }
  | { readonly status: 'error'; readonly error: AppError };

/** Elenco sessioni inventario fisico. */
@Component({
  selector: 'app-inventory-count-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
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

  protected readonly skeletonColumns = 7;
  private readonly refreshTick = signal(0);

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
          map(
            (sessions): CountListState => ({
              status: 'success',
              sessions,
            }),
          ),
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
