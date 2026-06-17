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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { InventoryCountStatus } from '@core/models/inventory-count.model';
import type { InventoryCountLine, InventoryCountSession } from '@core/models/inventory-count.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { formatDateTime } from '@core/utils/date.util';
import { ProductService } from '@features/products/services/product.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
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

interface ScanFeedback {
  readonly tone: 'success' | 'error';
  readonly message: string;
}

/** Dettaglio sessione inventario: conteggio, revisione e chiusura. */
@Component({
  selector: 'app-inventory-count-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BadgeComponent,
    BarcodeScannerComponent,
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
  private readonly productService = inject(ProductService);
  private readonly config = inject(APP_CONFIG);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private highlightTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;

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
  protected readonly scanPending = signal(false);
  protected readonly scanFeedback = signal<ScanFeedback | null>(null);
  protected readonly highlightedLineId = signal<string | null>(null);

  protected readonly scanForm = this.fb.group({
    code: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
  });

  protected readonly session = signal<InventoryCountSession | null>(null);

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

  constructor() {
    effect(() => {
      const state = this.detailState();
      if (state.status === 'success') {
        this.session.set(state.session);
      } else if (state.status === 'error') {
        this.session.set(null);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.highlightTimeout) {
        clearTimeout(this.highlightTimeout);
      }
    });
  }

  protected readonly loading = computed(
    () => this.detailState().status === 'loading' && this.session() === null,
  );
  protected readonly error = computed((): AppError | null => {
    const state = this.detailState();
    return state.status === 'error' ? state.error : null;
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

  protected onScanned(code: string): void {
    this.scanForm.controls.code.setValue(code);
    this.applyScanCode(code);
  }

  protected submitScanCode(): void {
    if (this.scanForm.invalid) {
      this.scanForm.markAllAsTouched();
      return;
    }
    this.applyScanCode(this.scanForm.controls.code.value);
  }

  protected applyScanCode(rawCode: string): void {
    if (!this.canEdit() || this.scanPending()) {
      return;
    }

    const code = rawCode.trim();
    if (!code) {
      return;
    }

    const localLine = this.findLineBySku(code);
    if (localLine) {
      this.incrementLineCount(localLine);
      return;
    }

    this.scanPending.set(true);
    this.scanFeedback.set(null);
    this.productService
      .findVariantByCode(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variant) => {
          this.scanPending.set(false);
          const line = this.lines().find((entry) => entry.variantId === variant.variantId);
          if (!line) {
            this.scanFeedback.set({
              tone: 'error',
              message: `${variant.productName} non è in questa sessione di inventario.`,
            });
            return;
          }
          this.incrementLineCount(line);
        },
        error: (err: unknown) => {
          this.scanPending.set(false);
          this.scanFeedback.set({
            tone: 'error',
            message:
              isAppError(err) && err.kind === AppErrorKind.NotFound
                ? 'Nessuna variante trovata per questo SKU o barcode.'
                : 'Ricerca variante non riuscita. Riprova.',
          });
        },
      });
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

  private incrementLineCount(line: InventoryCountLine): void {
    const nextCount = (line.countedQuantity ?? 0) + 1;
    this.scanFeedback.set({
      tone: 'success',
      message: `${line.productName} (${line.sku}): contato ${nextCount}`,
    });
    this.highlightLine(line.id);
    this.saveLineCount(line, nextCount);
  }

  private findLineBySku(code: string): InventoryCountLine | undefined {
    const normalized = code.toLowerCase();
    return this.lines().find((line) => line.sku.toLowerCase() === normalized);
  }

  private highlightLine(lineId: string): void {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }
    this.highlightedLineId.set(lineId);
    queueMicrotask(() => {
      document.getElementById(`count-line-${lineId}`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
    this.highlightTimeout = setTimeout(() => {
      if (this.highlightedLineId() === lineId) {
        this.highlightedLineId.set(null);
      }
    }, 2500);
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
          this.patchSessionLine(line.id, countedQuantity);
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

  private patchSessionLine(lineId: string, countedQuantity: number): void {
    this.session.update((current) => {
      if (!current?.lines) {
        return current;
      }

      const lines = current.lines.map((entry) =>
        entry.id === lineId ? { ...entry, countedQuantity } : entry,
      );

      return {
        ...current,
        lines,
        linesCounted: lines.filter((entry) => entry.countedQuantity !== null).length,
        linesWithDelta: lines.filter(
          (entry) =>
            entry.countedQuantity !== null && entry.countedQuantity !== entry.systemQuantity,
        ).length,
      };
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
