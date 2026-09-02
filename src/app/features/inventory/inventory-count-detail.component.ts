import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { BarcodeDetectionService } from '@core/services/barcode-detection.service';
import { AuthService } from '@core/auth';
import { inventoryCountCloseHint } from '@core/models/tenant-channel-profile.model';
import { InventoryCountStatus } from '@core/models/inventory-count.model';
import type { InventoryCountLine, InventoryCountSession } from '@core/models/inventory-count.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { formatDateTime } from '@core/utils/date.util';
import { ProductService } from '@domain/products/services/product.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import type {
  DataTableRowTone,
  DataTableSection,
} from '@shared/components/data-table/data-table.model';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import {
  INVENTORY_COUNT_LINE_COLUMN_DEFS,
  INVENTORY_COUNT_LINE_COLUMN_PRESETS,
  INVENTORY_COUNT_LINES_VIEW,
} from './models/inventory-count-lines-table-columns.config';

import { inventoryCountLineDelta } from '@domain/inventory/models/inventory-count.mapper';
import {
  inventoryCountStatusLabel,
  inventoryCountStatusTone,
} from './models/inventory-count-labels.util';
import { InventoryService } from '@domain/inventory/services/inventory.service';

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
    BackButtonComponent,
    BadgeComponent,
    BarcodeScannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    RouterLink,
    InlineBannerComponent,
    DataTableComponent,
    DataTableCellDirective,
    TableColumnPickerComponent,
  ],
  templateUrl: './inventory-count-detail.component.html',
  styleUrl: './inventory-count-detail.component.scss',
})
export class InventoryCountDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly config = inject(APP_CONFIG);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly filterStore = inject(ColumnFilterStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * ⭐ **«Filtri» accende i controlli nelle intestazioni**, ed è lo stesso
   * comando che su ogni elenco porta il telaio `app-list-page` — che questa
   * pagina non usa, perché è un dettaglio e non un elenco.
   *
   * ⚠️ **Spegnere AZZERA** (`regole-stile-ui`, «I filtri di un elenco stanno
   * nelle sue colonne»): lo fa lo store, non questo componente. Un filtro attivo
   * il cui controllo non si vede è il difetto che quella regola evita.
   */
  protected readonly filtriAccesi = this.filterStore.acceso(INVENTORY_COUNT_LINES_VIEW);

  protected commutaFiltri(): void {
    this.filterStore.commuta(INVENTORY_COUNT_LINES_VIEW);
  }

  protected readonly closeHint = computed(() =>
    inventoryCountCloseHint(this.authService.currentUser()?.tenantChannelProfile),
  );

  private highlightTimeout: ReturnType<typeof setTimeout> | null = null;

  // La stessa risposta di tutti gli altri: bandiera d'ambiente, fotocamera
  // presente, e schermo compatto. Su scrivania resta il lettore HID.
  protected readonly barcodeScannerEnabled = inject(BarcodeDetectionService).cameraScanOffered;

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
          map((session): DetailState => ({
            status: 'success',
            session,
          })),
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
    this.columnPreferences.registerView(
      INVENTORY_COUNT_LINES_VIEW,
      INVENTORY_COUNT_LINE_COLUMN_DEFS,
      INVENTORY_COUNT_LINE_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(INVENTORY_COUNT_LINES_VIEW);

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

  /**
   * Le colonne accese adesso, dalle preferenze dell'operatore.
   *
   * ⚠️ **Assegnata nel costruttore, dopo `registerView`**: il servizio pretende
   * che la vista esista prima di consegnarne lo stato.
   */
  protected readonly tableColumns: Signal<readonly ResolvedTableColumn[]>;

  protected readonly lineColumnsView = INVENTORY_COUNT_LINES_VIEW;

  /** L'identità di riga per il motore: è quella su cui si aggancia la pistola. */
  protected readonly lineId = (line: InventoryCountLine): string => line.id;

  /**
   * Il testo di una cella — serve al motore per la ricerca, i filtri di colonna
   * e l'esportazione, non per disegnare: a disegnare sono i template `appCell`.
   */
  protected readonly lineCellText = (line: InventoryCountLine, columnId: string): string => {
    switch (columnId) {
      case 'productName':
        return line.productName;
      case 'sku':
        return line.sku;
      case 'systemQuantity':
        return String(line.systemQuantity);
      case 'countedQuantity':
        return line.countedQuantity === null ? '' : String(line.countedQuantity);
      case 'delta': {
        const delta = inventoryCountLineDelta(line);
        return delta === null ? '' : String(delta);
      }
      default:
        return '';
    }
  };

  /**
   * ⛔ **Il tono dice cosa la riga È, non cosa è appena successo.** Qui una riga
   * con differenza si segna perché quella differenza **resta** finché non la si
   * corregge: è una proprietà del conteggio. Il lampo della scansione è un'altra
   * cosa e passa da `highlightedRowId`.
   */
  protected readonly lineTone = (line: InventoryCountLine): DataTableRowTone | null => {
    const delta = inventoryCountLineDelta(line);
    return delta !== null && delta !== 0 ? 'negative' : null;
  };

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

  /**
   * I filtri di COLONNA, sopra quelli della schermata.
   *
   * ⚠️ **Convivono con la ricerca e con i tre pulsanti** («Tutte», «Da contare»,
   * «Con differenza»), e non è una duplicazione: quelli sono domande sul
   * conteggio — uno stato del lavoro —, questi restringono per il valore di una
   * colonna. Si compongono, come la ricerca e il periodo su un elenco.
   *
   * ⛔ **Senza, i controlli di filtro sarebbero comandi finti**: passare il
   * `viewId` al motore accende le tendine nelle intestazioni, e se nessuno le
   * applica l'elenco non si restringe. Lo dice `npm run check:filtri-colonna`,
   * che ha preso esattamente questo caso il 02/09/2026.
   */
  private readonly righeFiltratePerColonna = createColumnFilters<InventoryCountLine>({
    viewId: () => INVENTORY_COUNT_LINES_VIEW,
    righe: () => this.filteredLines(),
    cellText: this.lineCellText,
    // ⚠️ Le tre colonne numeriche si filtrano per intervallo, e sul testo il
    // confronto metterebbe «−5» dopo «10».
    numeroDi: (line, columnId) => {
      switch (columnId) {
        case 'systemQuantity':
          return line.systemQuantity;
        case 'countedQuantity':
          return line.countedQuantity;
        case 'delta':
          return inventoryCountLineDelta(line);
        default:
          return null;
      }
    },
  });

  /**
   * Le righe per il motore: **una sezione sola**, senza intestazione né piede.
   * Qui non si raggruppa niente — è la forma piatta che il motore dichiara.
   */
  protected readonly lineSections = computed(
    (): readonly DataTableSection<InventoryCountLine>[] => [
      { id: 'lines', rows: this.righeFiltratePerColonna() },
    ],
  );

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

  /**
   * La riga appena scansionata si accende e si porta in vista.
   *
   * ⚠️ **`block: 'nearest'` e non `'start'`**: `nearest` non fa niente se la riga
   * è già visibile, mentre `start` sposta sempre la vista. Qui la differenza si
   * sente poco — si conta e basta —, ma è la forma che va portata anche nelle
   * maschere documento (`docs/DA-FARE.md`), dove chi sta compilando una riga non
   * deve ritrovarsi altrove per una scansione.
   *
   * ⚠️ **Si aggancia a `[data-row-id]`, che scrive il motore tabella**: era un
   * `id` HTML messo a mano sulla riga, e con il motore quella riga non la disegna
   * più questa schermata.
   */
  private highlightLine(lineId: string): void {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }
    this.highlightedLineId.set(lineId);
    queueMicrotask(() => {
      this.host.nativeElement
        .querySelector(`[data-row-id="${CSS.escape(lineId)}"]`)
        ?.scrollIntoView({
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
