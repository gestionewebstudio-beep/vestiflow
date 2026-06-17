import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { InventoryCountStatus } from '@core/models/inventory-count.model';
import type { InventoryCountLine, InventoryCountSession } from '@core/models/inventory-count.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { inventoryCountLineDelta } from './models/inventory-count.mapper';
import {
  inventoryCountStatusLabel,
  inventoryCountStatusTone,
} from './models/inventory-count-labels.util';
import { InventoryService } from './services/inventory.service';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly session: InventoryCountSession }
  | { readonly status: 'error'; readonly error: AppError };

type LineFilter = 'all' | 'pending' | 'delta';

/** Dettaglio sessione inventario: conteggio, revisione e chiusura. */
@Component({
  selector: 'app-inventory-count-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './inventory-count-detail.component.html',
  styleUrl: './inventory-count-detail.component.scss',
})
export class InventoryCountDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly inventoryService = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly InventoryCountStatus = InventoryCountStatus;
  protected readonly formatDate = formatDateTime;
  protected readonly statusLabel = inventoryCountStatusLabel;
  protected readonly statusTone = inventoryCountStatusTone;
  protected readonly lineDelta = inventoryCountLineDelta;

  protected readonly skeletonColumns = 5;
  protected readonly search = signal('');
  protected readonly lineFilter = signal<LineFilter>('all');
  protected readonly actionPending = signal(false);
  protected readonly actionError = signal<AppError | null>(null);
  protected readonly savingLineId = signal<string | null>(null);

  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  private readonly refreshTick = signal(0);

  private readonly detailState = toSignal(
    combineLatest([toObservable(this.refreshTick), toObservable(this.sessionId)]).pipe(
      switchMap(([, id]) => {
        if (!id) {
          return of({
            status: 'error',
            error: {
              kind: AppErrorKind.NotFound,
              message: 'Sessione non trovata.',
              status: 404,
            },
          } satisfies DetailState);
        }
        return this.inventoryService.getInventoryCount(id).pipe(
          map(
            (session): DetailState => ({
              status: 'success',
              session,
            }),
          ),
          catchError((error: unknown) =>
            of({
              status: 'error' as const,
              error: isAppError(error)
                ? error
                : {
                    kind: AppErrorKind.Unknown,
                    message: 'Impossibile caricare la sessione inventario.',
                  },
            }),
          ),
          startWith({ status: 'loading' } satisfies DetailState),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.detailState().status === 'loading');
  protected readonly error = computed((): AppError | null => {
    const state = this.detailState();
    return state.status === 'error' ? state.error : null;
  });
  protected readonly session = computed((): InventoryCountSession | null => {
    const state = this.detailState();
    return state.status === 'success' ? state.session : null;
  });

  protected readonly lines = computed(() => this.session()?.lines ?? []);

  protected readonly filteredLines = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.lineFilter();
    return this.lines().filter((line: InventoryCountLine) => {
      if (filter === 'pending' && line.countedQuantity !== null) {
        return false;
      }
      if (filter === 'delta') {
        const delta = inventoryCountLineDelta(line);
        if (delta === null || delta === 0) {
          return false;
        }
      }
      if (!query) {
        return true;
      }
      return (
        line.sku.toLowerCase().includes(query) || line.productName.toLowerCase().includes(query)
      );
    });
  });

  protected readonly progressLabel = computed(() => {
    const session = this.session();
    if (!session) {
      return '';
    }
    return `${session.linesCounted} / ${session.lineCount} varianti contate`;
  });

  protected readonly canEdit = computed(
    () => this.session()?.status === InventoryCountStatus.InProgress,
  );

  protected readonly canReview = computed(
    () => this.session()?.status === InventoryCountStatus.Review,
  );

  protected readonly isClosed = computed(() => {
    const status = this.session()?.status;
    return status === InventoryCountStatus.Completed || status === InventoryCountStatus.Cancelled;
  });

  protected back(): void {
    void this.router.navigate(['/app/inventory/counts']);
  }

  protected reload(): void {
    this.refreshTick.update((value) => value + 1);
  }

  protected onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setLineFilter(filter: LineFilter): void {
    this.lineFilter.set(filter);
  }

  protected onCountedBlur(line: InventoryCountLine, event: Event): void {
    if (!this.canEdit()) {
      return;
    }
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') {
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === line.countedQuantity) {
      return;
    }
    this.saveLineCount(line, parsed);
  }

  protected submitForReview(): void {
    const session = this.session();
    if (!session || this.actionPending()) {
      return;
    }
    this.runAction(() => this.inventoryService.submitInventoryCount(session.id));
  }

  protected finalize(): void {
    const session = this.session();
    if (!session || this.actionPending()) {
      return;
    }
    this.runAction(() => this.inventoryService.finalizeInventoryCount(session.id));
  }

  protected cancelSession(): void {
    const session = this.session();
    if (!session || this.actionPending()) {
      return;
    }
    this.runAction(() => this.inventoryService.cancelInventoryCount(session.id));
  }

  private saveLineCount(line: InventoryCountLine, countedQuantity: number): void {
    const session = this.session();
    if (!session) {
      return;
    }
    this.savingLineId.set(line.id);
    this.inventoryService
      .updateInventoryCountLine(session.id, line.id, countedQuantity)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savingLineId.set(null);
          this.reload();
        },
        error: () => {
          this.savingLineId.set(null);
          this.actionError.set({
            kind: AppErrorKind.Unknown,
            message: 'Salvataggio quantità non riuscito. Riprova.',
          });
        },
      });
  }

  private runAction(action: () => ReturnType<InventoryService['submitInventoryCount']>): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    action()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionPending.set(false);
          this.reload();
        },
        error: (error: unknown) => {
          this.actionPending.set(false);
          this.actionError.set(
            isAppError(error)
              ? error
              : {
                  kind: AppErrorKind.Unknown,
                  message: 'Operazione non riuscita. Riprova.',
                },
          );
        },
      });
  }
}
