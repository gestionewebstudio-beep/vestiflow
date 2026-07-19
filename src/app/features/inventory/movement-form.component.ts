import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { LocationContextService } from '@core/services/location-context.service';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import { moneyToMajor, parseMoneyInput } from '@core/utils/money.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { StockMovementType } from '@core/models/stock-movement.model';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { CustomerService } from '@features/customers/services/customer.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';

import { InventoryService } from './services/inventory.service';
import type { RegisterMovementBatchInput } from './services/inventory.service';
import type { InventoryLevelListItem } from './models/inventory-list.mapper';

/** Tipi registrabili manualmente (vendite/resi arrivano da POS/canali). */
const MANUAL_TYPES = [
  { value: StockMovementType.Load, label: 'Carico' },
  { value: StockMovementType.Unload, label: 'Scarico' },
  { value: StockMovementType.Adjustment, label: 'Rettifica' },
  { value: StockMovementType.Transfer, label: 'Trasferimento' },
] as const;

/** Causali predefinite per tipo (il campo resta a testo libero: datalist). */
const LOAD_REASON_PRESETS = [
  'Acquisto merce',
  'Reso da cliente',
  'Omaggio fornitore',
  'Rientro conto vendita',
] as const;

const UNLOAD_REASON_PRESETS = [
  'Reso a fornitore',
  'Reso da cliente',
  'Riferimento DDT',
  'Merce danneggiata',
  'Omaggio',
  'Uso interno',
] as const;

const ADJUSTMENT_DEFAULT_REASON = 'Rettifica giacenza';

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;
const VARIANT_SEARCH_PAGE_SIZE = 8;
/** Deep-link productId: massimo consentito dall'API (Max(100) su pageSize). */
const PRODUCT_DEEP_LINK_PAGE_SIZE = 100;

/** Riga articolo del form: quantità per tipo + giacenze per location. */
interface MovementFormLine {
  readonly variantId: string;
  readonly articleCode: string;
  readonly title: string;
  readonly sku: string;
  readonly unitOfMeasure: string;
  readonly purchasePriceMinor: number | null;
  readonly sellingPriceMinor: number | null;
  /** Giacenze su tutte le location (disponibilità/giacenza attuale live). */
  readonly levels: readonly InventoryLevelListItem[];
  readonly quantityText: string;
  /** Solo rettifiche: nuova giacenza da impostare. */
  readonly newOnHandText: string;
  /** Costo unitario (carico) o prezzo unitario (scarico), testo it-IT. */
  readonly unitAmountText: string;
}

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Registra movimento multi-articolo (smart). Il form cambia col tipo
 * (Carico/Scarico/Rettifica/Trasferimento): controparte e causale a contesto,
 * lista articoli con ricerca inline (codice, nome, SKU, EAN) e salvataggio
 * unico di tutte le righe. Azione sensibile: conferma con riepilogo prima
 * del submit (regole-gestionale §Azioni sensibili).
 */
@Component({
  selector: 'app-movement-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BarcodeScannerComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    SelectMenuComponent,
  ],
  templateUrl: './movement-form.component.html',
  styleUrl: './movement-form.component.scss',
})
export class MovementFormComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly productService = inject(ProductService);
  private readonly supplierService = inject(SupplierService);
  private readonly customerService = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;
  protected readonly scanFeedback = signal<string | null>(null);

  // ── Testata ────────────────────────────────────────────────────────────────
  protected readonly type = signal<StockMovementType>(StockMovementType.Load);
  protected readonly operationDate = signal(todayIsoDate());
  protected readonly locationId = signal('');
  protected readonly targetLocationId = signal('');
  protected readonly partyId = signal('');
  protected readonly reason = signal('');

  protected readonly isLoad = computed(() => this.type() === StockMovementType.Load);
  protected readonly isUnload = computed(() => this.type() === StockMovementType.Unload);
  protected readonly isAdjustment = computed(() => this.type() === StockMovementType.Adjustment);
  protected readonly isTransfer = computed(() => this.type() === StockMovementType.Transfer);

  protected readonly reasonPresets = computed<readonly string[]>(() => {
    if (this.isLoad()) {
      return LOAD_REASON_PRESETS;
    }
    if (this.isUnload()) {
      return UNLOAD_REASON_PRESETS;
    }
    if (this.isAdjustment()) {
      return [ADJUSTMENT_DEFAULT_REASON];
    }
    return [];
  });

  /** Controparti da anagrafica (fornitori + clienti) per provenienza/destinatario. */
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

  // Sede predefinita: solo suggerimento — prima nelle opzioni, etichettata
  // "(predefinita)", mai autoselezionata (mono-location gestita dall'effect).
  protected readonly locationSelectOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.actionLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  protected readonly targetLocationSelectOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations
      .transferTargetLocations()
      .filter((location) => location.id !== this.locationId())
      .map((location) => ({ value: location.id, label: location.name })),
  );

  protected readonly isFixedSingleStore = this.operationalLocations.isFixedSingleStore;
  protected readonly fixedSingleStoreLabel = this.operationalLocations.fixedSingleStoreLabel;

  // ── Lista articoli ─────────────────────────────────────────────────────────
  protected readonly lines = signal<readonly MovementFormLine[]>([]);

  // ── Ricerca articolo (codice articolo, nome, SKU, EAN) ────────────────────
  protected readonly searchDraft = signal('');
  protected readonly searching = signal(false);

  protected readonly searchResults = toSignal(
    toObservable(this.searchDraft).pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((search) => {
        const term = search.trim();
        if (term.length < VARIANT_SEARCH_MIN_CHARS) {
          this.searching.set(false);
          return of([] as readonly VariantSummary[]);
        }
        this.searching.set(true);
        return this.productService
          .searchVariantSummaries({
            search: term,
            pageSize: VARIANT_SEARCH_PAGE_SIZE,
            locationId: this.locationId() || undefined,
          })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
      map((results) => {
        this.searching.set(false);
        return results;
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  // ── Conferma e submit ─────────────────────────────────────────────────────
  protected readonly confirmOpen = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  constructor() {
    // Tipo scelto A MONTE (bottoni del tab Movimenti, query param `type`):
    // il form nasce già impostato, senza selettore interno. Default: Carico.
    const typeParam = this.route.snapshot.queryParamMap.get('type');
    const initialType =
      MANUAL_TYPES.find((option) => option.value === typeParam)?.value ?? StockMovementType.Load;
    this.type.set(initialType);
    if (initialType === StockMovementType.Adjustment) {
      this.reason.set(ADJUSTMENT_DEFAULT_REASON);
    }

    effect(() => {
      const fixedId = this.operationalLocations.fixedSingleStoreLocationId();
      if (fixedId) {
        this.locationId.set(fixedId);
        if (this.locationContext.activeLocationId() !== fixedId) {
          this.locationContext.setActiveLocation(fixedId);
        }
        return;
      }
      // Mono-location: preselezione ammessa perché la scelta è obbligata.
      const selectable = this.operationalLocations.actionLocations();
      if (selectable.length === 1 && !this.locationId()) {
        this.locationId.set(selectable[0]?.id ?? '');
      }
    });

    // Deep-link ?variantId= (es. da Cerca giacenza): articolo già in lista.
    const variantId = this.route.snapshot.queryParamMap.get('variantId');
    if (variantId) {
      this.productService
        .searchVariantSummaries({ variantId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => {
          const summary = rows[0];
          if (summary) {
            this.addVariant(summary);
          }
        });
    }

    // Deep-link ?productId= (bottoni Carica/Scarica/Rettifica del dettaglio
    // prodotto): tutte le varianti dell'articolo già in lista.
    const productId = this.route.snapshot.queryParamMap.get('productId');
    if (productId) {
      this.productService
        .searchVariantSummaries({ productId, pageSize: PRODUCT_DEEP_LINK_PAGE_SIZE })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => {
          for (const summary of rows) {
            this.addVariant(summary);
          }
        });
    }
  }

  // ── Etichette e helper riga ───────────────────────────────────────────────

  protected readonly typeLabel = computed(
    () => MANUAL_TYPES.find((option) => option.value === this.type())?.label ?? '',
  );

  protected availableAt(line: MovementFormLine, locationId: string): number {
    return line.levels.find((level) => level.locationId === locationId)?.available ?? 0;
  }

  protected onHandAt(line: MovementFormLine, locationId: string): number {
    return line.levels.find((level) => level.locationId === locationId)?.onHand ?? 0;
  }

  protected lineAvailable(line: MovementFormLine): number {
    return this.availableAt(line, this.locationId());
  }

  protected lineOnHand(line: MovementFormLine): number {
    return this.onHandAt(line, this.locationId());
  }

  /**
   * Nuova giacenza mostrata: quella digitata, altrimenti la giacenza attuale
   * (segue location e caricamento giacenze — riga invariata = nessun delta).
   */
  protected lineNewOnHandValue(line: MovementFormLine): string {
    return line.newOnHandText !== '' ? line.newOnHandText : String(this.lineOnHand(line));
  }

  /** Avviso non bloccante: la quantità supera la disponibilità attuale. */
  protected lineExceedsAvailability(line: MovementFormLine): boolean {
    if (!this.isUnload() && !this.isTransfer()) {
      return false;
    }
    const quantity = parsePositiveInt(line.quantityText);
    return quantity !== null && quantity > this.lineAvailable(line);
  }

  // ── Gestione testata ──────────────────────────────────────────────────────

  protected onOperationDateChange(value: string): void {
    this.operationDate.set(value);
  }

  protected onLocationSelect(value: string | null): void {
    if (this.isFixedSingleStore()) {
      return;
    }
    this.locationId.set(value ?? '');
    this.formError.set(null);
  }

  protected onTargetLocationSelect(value: string | null): void {
    this.targetLocationId.set(value ?? '');
    this.formError.set(null);
  }

  protected onPartySelect(value: string | null): void {
    this.partyId.set(value ?? '');
  }

  protected onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  // ── Gestione righe ────────────────────────────────────────────────────────

  protected onLineQuantityInput(variantId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchLine(variantId, { quantityText: value });
  }

  protected onLineNewOnHandInput(variantId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchLine(variantId, { newOnHandText: value });
  }

  protected onLineUnitAmountInput(variantId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchLine(variantId, { unitAmountText: value });
  }

  protected removeLine(variantId: string): void {
    this.lines.update((lines) => lines.filter((line) => line.variantId !== variantId));
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected addVariant(summary: VariantSummary): void {
    const existing = this.lines().find((line) => line.variantId === summary.variantId);
    if (existing) {
      // Già in lista: per i tipi a quantità è un +1, la rettifica resta com'è.
      if (!this.isAdjustment()) {
        const quantity = parsePositiveInt(existing.quantityText) ?? 0;
        this.patchLine(summary.variantId, { quantityText: String(quantity + 1) });
      }
      return;
    }

    const line: MovementFormLine = {
      variantId: summary.variantId,
      articleCode: summary.articleCode,
      title: summary.title,
      sku: summary.sku,
      unitOfMeasure: summary.unitOfMeasure?.trim() || 'pz',
      purchasePriceMinor: summary.purchasePrice?.amountMinor ?? null,
      sellingPriceMinor: summary.sellingPrice.amountMinor,
      levels: [],
      quantityText: '1',
      newOnHandText: '',
      unitAmountText: '',
    };
    this.lines.update((lines) => [
      ...lines,
      {
        ...line,
        unitAmountText: this.defaultUnitAmountText(line, this.type()),
      },
    ]);
    this.searchDraft.set('');
    this.scanFeedback.set(null);

    // Giacenze live per disponibilità/giacenza attuale su ogni location.
    this.inventoryService
      .getLevelsByVariant(summary.variantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((levels) => {
        this.lines.update((lines) =>
          lines.map((current) =>
            current.variantId === summary.variantId ? { ...current, levels } : current,
          ),
        );
      });
  }

  protected onScanned(code: string): void {
    this.scanFeedback.set(null);
    this.productService
      .findVariantByCode(code)
      .pipe(
        switchMap((variant) =>
          this.productService.searchVariantSummaries({ variantId: variant.variantId }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rows) => {
          const summary = rows[0];
          if (summary) {
            this.addVariant(summary);
          } else {
            this.scanFeedback.set('Nessuna variante trovata per questo SKU o barcode.');
          }
        },
        error: () => {
          this.scanFeedback.set('Nessuna variante trovata per questo SKU o barcode.');
        },
      });
  }

  // ── Salvataggio ───────────────────────────────────────────────────────────

  protected readonly confirmMessage = computed(() => {
    const count = this.lines().length;
    const label = this.typeLabel().toLowerCase();
    const location = this.locationLabel(this.locationId());
    const base = `Registrare ${count} ${count === 1 ? 'articolo' : 'articoli'} come ${label}`;
    if (this.isTransfer()) {
      return `${base} da ${location} a ${this.locationLabel(this.targetLocationId())}?`;
    }
    return `${base} su ${location}?`;
  });

  protected save(): void {
    const error = this.validate();
    this.formError.set(error);
    if (error) {
      return;
    }
    this._submitState.set({ status: 'idle' });
    this.confirmOpen.set(true);
  }

  protected confirmSave(): void {
    if (this.saving()) {
      return;
    }
    const partyOption = this.partyOptions().find((option) => option.value === this.partyId());
    const withParty = this.isLoad() || this.isUnload();
    const withAmount = this.isLoad() || this.isUnload();

    const input: RegisterMovementBatchInput = {
      type: this.type(),
      operationDate: this.operationDate() || undefined,
      locationId: this.locationId(),
      targetLocationId: this.isTransfer() ? this.targetLocationId() : undefined,
      reason: this.reason().trim() || undefined,
      partyId: withParty && this.partyId() ? this.partyId() : undefined,
      partyName: withParty && partyOption ? partyOption.label : undefined,
      lines: this.lines().map((line) => ({
        variantId: line.variantId,
        quantity: this.isAdjustment() ? undefined : (parsePositiveInt(line.quantityText) ?? 1),
        newOnHand: this.isAdjustment()
          ? (parseNonNegativeInt(this.lineNewOnHandValue(line)) ?? 0)
          : undefined,
        unitAmountMinor: withAmount
          ? (parseMoneyInput(line.unitAmountText)?.amountMinor ?? undefined)
          : undefined,
      })),
    };

    this._submitState.set({ status: 'saving' });
    this.inventoryService
      .registerMovementBatch(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmOpen.set(false);
          void this.router.navigateByUrl('/app/inventory/movements');
        },
        error: (err: unknown) => {
          this.confirmOpen.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected dismissConfirm(): void {
    if (!this.saving()) {
      this.confirmOpen.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/app/inventory/movements');
  }

  private validate(): string | null {
    if (!this.locationId()) {
      return this.isTransfer() ? 'Seleziona la location di origine.' : 'Seleziona la location.';
    }
    if (this.isTransfer()) {
      if (!this.targetLocationId()) {
        return 'Seleziona la location di destinazione.';
      }
      if (this.targetLocationId() === this.locationId()) {
        return 'La location di destinazione deve essere diversa dall’origine.';
      }
    }
    if (this.isAdjustment() && !this.reason().trim()) {
      return 'La causale è obbligatoria per le rettifiche.';
    }
    if (this.lines().length === 0) {
      return 'Aggiungi almeno un articolo alla lista.';
    }
    for (const line of this.lines()) {
      if (this.isAdjustment()) {
        if (parseNonNegativeInt(this.lineNewOnHandValue(line)) === null) {
          return `Nuova giacenza non valida per «${line.title}».`;
        }
      } else if (parsePositiveInt(line.quantityText) === null) {
        return `Quantità non valida per «${line.title}» (intero maggiore di zero).`;
      }
    }
    return null;
  }

  private patchLine(variantId: string, patch: Partial<MovementFormLine>): void {
    this.lines.update((lines) =>
      lines.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)),
    );
  }

  /** Costo unitario (carico) / prezzo unitario (scarico) proposti dalla variante. */
  private defaultUnitAmountText(line: MovementFormLine, type: StockMovementType): string {
    const minor =
      type === StockMovementType.Load
        ? line.purchasePriceMinor
        : type === StockMovementType.Unload
          ? line.sellingPriceMinor
          : null;
    if (minor === null || minor === undefined) {
      return '';
    }
    return moneyToMajor({ amountMinor: minor, currencyCode: 'EUR' }).toFixed(2).replace('.', ',');
  }

  private locationLabel(id: string): string {
    return this.operationalLocations.locations().find((location) => location.id === id)?.name ?? id;
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}

/** YYYY-MM-DD in ora locale. */
function todayIsoDate(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function parsePositiveInt(text: string): number | null {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function parseNonNegativeInt(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
