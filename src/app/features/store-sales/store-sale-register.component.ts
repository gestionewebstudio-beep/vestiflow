import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { catchError, firstValueFrom, map, of, switchMap, take } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import type { Money } from '@core/models/money.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { formatDate } from '@core/utils/date.util';
import {
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
} from '@core/utils/money.util';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
// Stesse formule e stessi arrotondamenti del server: l'aritmetica IVA è una sola.
import {
  computeVatLineAmounts,
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossExact,
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
} from '@domain/documents/utils/document-vat.util';
import type { ProductEmbeddedCreatePrefill } from '@domain/products/models/product-form.mapper';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductFormComponent } from '@domain/products/product-form.component';
import { ProductService } from '@domain/products/services/product.service';

import type {
  FiscalPrintPayload,
  PendingFiscalReceipt,
} from '@domain/fiscal/models/fiscal-print.model';
import { EpsonFiscalPrinterService } from '@domain/fiscal/services/epson-fiscal-printer.service';
import { FiscalReceiptsService } from '@domain/fiscal/services/fiscal-receipts.service';
import type {
  RecentStoreSale,
  StoreSaleLookupItem,
  StoreSalePaymentMethod,
  StoreSaleResult,
} from '@domain/store-sales/models/store-sale.model';
import {
  canConcludeTender,
  tenderChangeMinor,
  tenderHasCashShortfall,
  tenderRemainingMinor,
  tenderToPaymentsPayload,
  type TenderRow,
} from '@domain/store-sales/models/store-sale-tender.util';
import { CashSessionBarComponent } from './components/cash-session-bar/cash-session-bar.component';
import { PosPaymentPanelComponent } from './components/pos-payment-panel/pos-payment-panel.component';
import type {
  CashSessionSummary,
  CloseCashSessionPayload,
  CreateCashMovementPayload,
} from './models/cash-session.model';
import { CashSessionsService } from './services/cash-sessions.service';
import { StoreSalesService } from './services/store-sales.service';

type RegisterMode = 'sale' | 'return';

/** Riga del carrello cassa: quantità, prezzo modificabile e sconto (§7). */
interface CartLine {
  readonly variantId: EntityId;
  readonly sku: string;
  readonly description: string;
  /**
   * Prezzo unitario NETTO: è il dato, quello che viaggia verso il server.
   * Al banco si vede e si digita ivato — la conversione sta nei metodi di
   * questa classe, non nel valore.
   */
  readonly unitPriceMinor: number;
  readonly quantity: number;
  readonly discountPercent: number;
  /** Aliquota % del Codice IVA risolto (solo display, da vatCodeId). */
  readonly vatRatePercent: number | null;
  /** Codice IVA risolto silenziosamente da articolo/predefinito aziendale; override manuale sempre possibile. */
  readonly vatCodeId: string | null;
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

/** Riga del reso: quantità da rientrare e stato vendibile (§9). */
interface ReturnLine {
  readonly variantId: EntityId | null;
  readonly sku: string;
  readonly description: string;
  readonly soldQuantity: number;
  /** Prezzo unitario NETTO della vendita originale. */
  readonly unitPriceMinor: number;
  /** Aliquota della riga venduta: per mostrare quanto si restituisce davvero. */
  readonly vatRatePercent: number | null;
  readonly returnQuantity: number;
  readonly restockable: boolean;
}

const PAYMENT_OPTIONS: readonly SelectMenuOption[] = [
  { value: 'cash', label: 'Contanti' },
  { value: 'card', label: 'Carta' },
  { value: 'other', label: 'Altro' },
];

/** Codice non risolto: origine per il prefill di «Crea articolo rapido». */
interface UnresolvedCode {
  readonly code: string;
  /** `barcode` = EAN scansionato (solo cifre); `text` = testo di ricerca manuale. */
  readonly kind: 'barcode' | 'text';
}

/** EAN/UPC plausibile: solo cifre, 8-14 caratteri (EAN-8 … GTIN-14). */
function looksLikeBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

/**
 * Cassa negozio (fase 3 §7-§9): vendita immediata non fiscale a carrello e
 * Reso vendita negozio collegato. Nessun movimento prima di «Concludi
 * vendita»: il backend crea documento + movimenti in un'unica transazione.
 * Il controllo è sulla DISPONIBILE (giacenza − impegnata), non sulla giacenza.
 */
@Component({
  selector: 'app-store-sale-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BackButtonComponent,
    BarcodeScannerComponent,
    ButtonComponent,
    CashSessionBarComponent,
    ConfirmDialogComponent,
    InlineBannerComponent,
    PosPaymentPanelComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    ProductFormComponent,
    DocumentProductSearchPanelComponent,
  ],
  templateUrl: './store-sale-register.component.html',
  styleUrl: './store-sale-register.component.scss',
})
export class StoreSaleRegisterComponent implements CanComponentDeactivate {
  private readonly service = inject(StoreSalesService);
  private readonly cashSessionsService = inject(CashSessionsService);
  private readonly fiscalReceiptsService = inject(FiscalReceiptsService);
  private readonly epsonPrinter = inject(EpsonFiscalPrinterService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly productService = inject(ProductService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);

  // Codici IVA attivi vendita/entrambi: override compatto per riga carrello
  // (§Piano IVA fase 3 — cassa veloce: risoluzione silenziosa, override
  // sempre possibile ma mai un passaggio obbligato).
  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );
  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );
  protected readonly vatSelectOptions = computed((): readonly SelectMenuOption[] =>
    this.vatCodes()
      .filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode))
      .map((vatCode) => ({ value: vatCode.id, label: vatCodeOptionLabel(vatCode) })),
  );

  /** Codice IVA vendite predefinito del tenant, per il prefill di «Crea articolo rapido». */
  private readonly defaultSalesVatCodeId = computed(
    () =>
      this.vatCodes().find(
        (vatCode) => vatCode.isDefault && vatCode.isActive && isSalesVatCode(vatCode),
      )?.id ?? null,
  );

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;
  protected readonly paymentOptions = PAYMENT_OPTIONS;
  protected readonly formatDate = formatDate;

  protected readonly mode = signal<RegisterMode>('sale');

  // ── Location ────────────────────────────────────────────────────────────

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.actionLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly isFixedSingleStore = this.operationalLocations.isFixedSingleStore;
  protected readonly fixedLocationLabel = this.operationalLocations.fixedSingleStoreLabel;

  protected readonly selectedLocationId = signal<EntityId | null>(
    this.locationContext.activeLocationId(),
  );

  // ── Sessione di cassa della sede ─────────────────────────────────────────

  protected readonly cashSession = signal<CashSessionSummary | null>(null);
  protected readonly cashSessionPending = signal(false);
  protected readonly cashSessionError = signal<string | null>(null);
  /** Esito dell'ultima chiusura (differenza contanti), mostrato sotto la fascia. */
  protected readonly cashSessionNotice = signal<string | null>(null);

  private cashSessionSubscription: Subscription | null = null;

  /** La sessione segue la sede selezionata (cassa aperta ≠ per ogni sede). */
  private readonly loadCashSessionOnLocation = effect(() => {
    const locationId = this.selectedLocationId();
    this.reloadCashSession(locationId);
    this.reloadPendingFiscal(locationId);
  });

  // ── Fiscalizzazione: esito emissione e coda «da fiscalizzare» ────────────

  /** Esito dell'ultima emissione (null = nessuna emissione in questa sessione). */
  protected readonly fiscalOutcome = signal<{
    readonly state: 'printing' | 'emitted' | 'failed';
    readonly fiscalNumber?: string | null;
    readonly message?: string;
  } | null>(null);
  protected readonly pendingFiscal = signal<readonly PendingFiscalReceipt[]>([]);
  protected readonly fiscalPrintPending = signal(false);

  private pendingFiscalSubscription: Subscription | null = null;

  private readonly pinFixedOperationalLocation = effect(() => {
    const fixedId = this.operationalLocations.fixedSingleStoreLocationId();
    if (!fixedId) {
      return;
    }
    const selectable = this.operationalLocations.actionLocations();
    if (!selectable.some((location) => location.id === fixedId)) {
      return;
    }
    this.selectedLocationId.set(fixedId);
    if (this.locationContext.activeLocationId() !== fixedId) {
      this.locationContext.setActiveLocation(fixedId);
    }
  });

  // ── Cliente (opzionale, per fidelizzazione) ─────────────────────────────

  private readonly customers = toSignal(
    this.customerService.getAllCustomers().pipe(catchError(() => of([] as readonly Customer[]))),
    { initialValue: [] as readonly Customer[] },
  );

  protected readonly customerOptions = computed((): readonly SelectMenuOption[] =>
    this.customers().map((customer) => ({
      value: customer.id,
      label: customerDisplayName(customer),
    })),
  );

  protected readonly selectedCustomerId = signal<EntityId | null>(null);

  // ── Vendita: ricerca articolo e carrello ────────────────────────────────

  protected readonly searchDraft = signal('');
  protected readonly lookupPending = signal(false);
  protected readonly lookupResults = signal<readonly StoreSaleLookupItem[] | null>(null);
  protected readonly lookupMessage = signal<string | null>(null);
  /** Codice/testo senza alcun risultato: mostra «Cerca articolo» e «Crea articolo rapido». */
  protected readonly unresolvedCode = signal<UnresolvedCode | null>(null);

  // ── Crea articolo rapido (ProductFormComponent in slide-panel) ──────────

  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelPrefill = signal<ProductEmbeddedCreatePrefill | null>(null);
  protected readonly quickAddPending = signal(false);

  /** AudioContext lazy per il beep di errore scansione (nessun file audio). */
  private audioContext: AudioContext | null = null;

  // ── Ricerca articolo con il pannello condiviso degli altri documenti ────

  protected readonly searchPanelOpen = signal(false);
  protected readonly searchPanelLaunchTerm = signal('');
  /** Incrementato a ogni apertura: reinizializza la query del pannello. */
  protected readonly searchPanelLaunchSeq = signal(0);

  protected readonly cart = signal<readonly CartLine[]>([]);
  /**
   * Pagamenti per metodo (multi-tender). Con una sola riga la quota segue il
   * totale del carrello da sola: è l'incasso intero, non c'è nulla da
   * ripartire. Con più righe la ripartizione è dell'operatore.
   */
  protected readonly paymentRows = signal<readonly TenderRow[]>([
    { method: 'cash', methodNote: '', amountMinor: 0, tenderedMinor: null },
  ]);
  protected readonly saleNotes = signal('');
  protected readonly salePending = signal(false);
  protected readonly saleError = signal<string | null>(null);
  protected readonly saleConfirmOpen = signal(false);
  protected readonly lastSaleResult = signal<StoreSaleResult | null>(null);

  /** Totale di cassa: quello che il cliente paga, cioè la somma dei lordi. */
  protected readonly cartTotalMinor = computed(() =>
    this.cart().reduce((sum, line) => sum + this.lineAmounts(line).lineGrossMinor, 0),
  );

  protected readonly cartQuantity = computed(() =>
    this.cart().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** Righe che superano la Disponibile: avviso non bloccante (§16 post-audit). */
  protected readonly overAvailableLines = computed(() =>
    this.cart().filter((line) => line.quantity > line.available),
  );

  protected readonly hasAvailabilityWarning = computed(() => this.overAvailableLines().length > 0);

  // ── Pagamento: quadratura quote e resto ─────────────────────────────────

  /** Riga unica ⇒ la quota è il totale, sempre (vedi commento su paymentRows). */
  private readonly syncSingleTenderRow = effect(() => {
    const total = this.cartTotalMinor();
    const rows = this.paymentRows();
    if (rows.length === 1 && rows[0]!.amountMinor !== total) {
      this.paymentRows.set([{ ...rows[0]!, amountMinor: total }]);
    }
  });

  /** Quanto manca alla quadratura (negativo = quote oltre il totale). */
  protected readonly paymentRemainingMinor = computed(() =>
    tenderRemainingMinor(this.cartTotalMinor(), this.paymentRows()),
  );

  /** Resto da rendere: contanti consegnati oltre la quota da incassare. */
  protected readonly paymentChangeMinor = computed(() => tenderChangeMinor(this.paymentRows()));

  /** Contanti digitati sotto la quota: avviso e conclusione bloccata. */
  protected readonly paymentHasCashShortfall = computed(() =>
    tenderHasCashShortfall(this.paymentRows()),
  );

  protected readonly paymentsComplete = computed(() =>
    canConcludeTender(this.cartTotalMinor(), this.paymentRows()),
  );

  protected readonly canConcludeSale = computed(
    () =>
      this.cart().length > 0 &&
      !!this.selectedLocationId() &&
      !this.salePending() &&
      this.paymentsComplete(),
  );

  // ── Reso: vendita origine e righe di rientro ────────────────────────────

  protected readonly recentSearchDraft = signal('');
  protected readonly recentPending = signal(false);
  protected readonly recentSales = signal<readonly RecentStoreSale[]>([]);
  protected readonly recentError = signal<string | null>(null);

  protected readonly selectedSale = signal<RecentStoreSale | null>(null);
  protected readonly returnLines = signal<readonly ReturnLine[]>([]);
  protected readonly returnReason = signal('');
  /** Come viene rimborsato il cliente (default contanti, come al banco). */
  protected readonly returnRefundMethod = signal<StoreSalePaymentMethod>('cash');
  protected readonly returnNotes = signal('');
  protected readonly returnPending = signal(false);
  protected readonly returnError = signal<string | null>(null);
  protected readonly returnConfirmOpen = signal(false);
  protected readonly lastReturnResult = signal<StoreSaleResult | null>(null);

  protected readonly returnableQuantity = computed(() =>
    this.returnLines().reduce((sum, line) => sum + line.returnQuantity, 0),
  );

  protected readonly restockQuantity = computed(() =>
    this.returnLines()
      .filter((line) => line.restockable)
      .reduce((sum, line) => sum + line.returnQuantity, 0),
  );

  protected readonly canConcludeReturn = computed(
    () =>
      this.returnableQuantity() > 0 &&
      this.returnReason().trim().length > 0 &&
      !!this.selectedLocationId() &&
      !this.returnPending(),
  );

  // ── Uscita con operazione in corso (guard) ──────────────────────────────

  /** Lavoro non salvato: carrello di vendita pieno o reso con quantità inserite. */
  protected readonly hasPendingWork = computed(() =>
    this.mode() === 'sale' ? this.cart().length > 0 : this.returnableQuantity() > 0,
  );

  /** «Salva e concludi» abilitato solo se l'operazione attiva è concludibile. */
  protected readonly canSaveAndClose = computed(() =>
    this.mode() === 'sale' ? this.canConcludeSale() : this.canConcludeReturn(),
  );

  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private lookupSubscription: Subscription | null = null;
  private quickAddSubscription: Subscription | null = null;
  private saleSubscription: Subscription | null = null;
  private recentSubscription: Subscription | null = null;
  private returnSubscription: Subscription | null = null;

  constructor() {
    afterNextRender(() => {
      this.focusSearchInput();
    });
    this.destroyRef.onDestroy(() => {
      void this.audioContext?.close().catch(() => undefined);
      this.audioContext = null;
    });
  }

  // ── Mode ─────────────────────────────────────────────────────────────────

  protected setMode(mode: RegisterMode): void {
    if (this.mode() === mode) {
      return;
    }
    this.mode.set(mode);
    if (mode === 'return' && this.recentSales().length === 0) {
      this.loadRecentSales();
    }
    if (mode === 'sale') {
      this.focusSearchInput();
    }
  }

  protected onLocationChange(value: string | null): void {
    if (this.isFixedSingleStore()) {
      return;
    }
    this.selectedLocationId.set(value);
    this.locationContext.setActiveLocation(value);
    // Le disponibilità in carrello si riferiscono alla location: svuota.
    this.cart.set([]);
    this.lookupResults.set(null);
    this.lookupMessage.set(null);
    this.unresolvedCode.set(null);
  }

  protected onCustomerChange(value: string | null): void {
    this.selectedCustomerId.set(value || null);
  }

  // ── Fiscalizzazione: emissione, esito, ristampa ──────────────────────────

  private reloadPendingFiscal(locationId: EntityId | null): void {
    if (!locationId) {
      this.pendingFiscal.set([]);
      return;
    }
    this.pendingFiscalSubscription = this.fiscalReceiptsService
      .listPending(locationId)
      .pipe(
        catchError(() => of([] as readonly PendingFiscalReceipt[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((pending) => this.pendingFiscal.set(pending));
  }

  /**
   * Emette il documento commerciale sulla stampante della sede e riporta
   * l'esito al server. Il fallimento NON blocca la cassa: la vendita resta
   * in coda «da fiscalizzare» e si riemette da lì.
   */
  private async emitFiscal(payload: FiscalPrintPayload): Promise<void> {
    if (this.fiscalPrintPending()) {
      return;
    }
    this.fiscalPrintPending.set(true);
    this.fiscalOutcome.set({ state: 'printing' });
    try {
      const outcome =
        payload.brand === 'epson'
          ? await this.epsonPrinter.print(payload)
          : {
              ok: false as const,
              errorMessage: `Driver ${payload.brand} non ancora disponibile: emetti sul registratore e segna l'esito.`,
            };

      await firstValueFrom(
        this.fiscalReceiptsService.reportOutcome(payload.documentId, {
          outcome: outcome.ok ? 'emitted' : 'failed',
          fiscalNumber: outcome.ok ? outcome.fiscalNumber : undefined,
          serialNumber: outcome.ok ? outcome.serialNumber : undefined,
          errorMessage: outcome.ok ? undefined : outcome.errorMessage,
        }),
      ).catch(() => undefined);

      this.fiscalOutcome.set(
        outcome.ok
          ? { state: 'emitted', fiscalNumber: outcome.fiscalNumber ?? null }
          : { state: 'failed', message: outcome.errorMessage },
      );
    } finally {
      this.fiscalPrintPending.set(false);
      this.reloadPendingFiscal(this.selectedLocationId());
    }
  }

  /** «Riemetti» dalla coda: stesso flusso dell'emissione alla vendita. */
  protected retryFiscal(item: PendingFiscalReceipt): void {
    void this.emitFiscal(item.payload);
  }

  // ── Sessione di cassa: apertura, movimenti, chiusura ─────────────────────

  private reloadCashSession(locationId: EntityId | null): void {
    if (!locationId) {
      this.cashSession.set(null);
      return;
    }
    this.cashSessionSubscription = this.cashSessionsService
      .current(locationId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((session) => this.cashSession.set(session));
  }

  protected onOpenCashSession(payload: { openingFloatMinor: number; notes?: string }): void {
    const locationId = this.selectedLocationId();
    if (!locationId || this.cashSessionPending()) {
      return;
    }
    this.cashSessionPending.set(true);
    this.cashSessionError.set(null);
    this.cashSessionNotice.set(null);
    this.cashSessionSubscription = this.cashSessionsService
      .open({ locationId, ...payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.cashSessionPending.set(false);
          this.cashSession.set(session);
        },
        error: (err: unknown) => {
          this.cashSessionPending.set(false);
          this.cashSessionError.set(this.errorMessage(err));
        },
      });
  }

  protected onAddCashMovement(payload: CreateCashMovementPayload): void {
    const session = this.cashSession();
    if (!session || this.cashSessionPending()) {
      return;
    }
    this.cashSessionPending.set(true);
    this.cashSessionError.set(null);
    this.cashSessionSubscription = this.cashSessionsService
      .addMovement(session.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.cashSessionPending.set(false);
          this.cashSession.set(updated);
        },
        error: (err: unknown) => {
          this.cashSessionPending.set(false);
          this.cashSessionError.set(this.errorMessage(err));
        },
      });
  }

  protected onCloseCashSession(payload: CloseCashSessionPayload): void {
    const session = this.cashSession();
    if (!session || this.cashSessionPending()) {
      return;
    }
    this.cashSessionPending.set(true);
    this.cashSessionError.set(null);
    this.cashSessionSubscription = this.cashSessionsService
      .close(session.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (closed) => {
          this.cashSessionPending.set(false);
          this.cashSession.set(null);
          const difference =
            closed.countedCashMinor != null
              ? closed.countedCashMinor - closed.expectedCashMinor
              : 0;
          this.cashSessionNotice.set(
            difference === 0
              ? `Cassa chiusa: quadrata (contanti ${this.money(closed.countedCashMinor ?? 0)}).`
              : `Cassa chiusa con ${difference > 0 ? 'eccedenza' : 'ammanco'} di ${this.money(
                  Math.abs(difference),
                )}. Il dettaglio è in Chiusure di cassa.`,
          );
        },
        error: (err: unknown) => {
          this.cashSessionPending.set(false);
          this.cashSessionError.set(this.errorMessage(err));
        },
      });
  }

  // ── Vendita: ricerca ─────────────────────────────────────────────────────

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.commitScan(this.searchDraft());
  }

  protected onBarcodeScanned(code: string): void {
    this.searchDraft.set(code);
    this.commitScan(code);
  }

  protected addResultToCart(item: StoreSaleLookupItem): void {
    this.addToCart(item);
    this.lookupResults.set(null);
    this.searchDraft.set('');
    this.focusSearchInput();
  }

  // ── Ricerca articolo: pannello condiviso (come gli altri documenti) ──────

  /** «Cerca»: apre il pannello di ricerca articolo comune ai documenti. */
  protected openProductSearchPanel(): void {
    this.searchPanelLaunchTerm.set(this.searchDraft().trim());
    this.searchPanelLaunchSeq.update((seq) => seq + 1);
    this.searchPanelOpen.set(true);
  }

  protected closeProductSearchPanel(): void {
    this.searchPanelOpen.set(false);
    this.focusSearchInput();
  }

  /** Variante scelta dal pannello: risolta come articolo di carrello e aggiunta. */
  protected onVariantSelectedFromSearch(event: { readonly variantId: string }): void {
    this.searchPanelOpen.set(false);
    this.searchDraft.set('');
    this.addVariantToCartById(event.variantId);
  }

  /**
   * Percorso unico scanner/invio: parsing «N*codice» + risoluzione ESATTA
   * condivisa (BarcodeLookupService). Match esatto → subito in carrello;
   * nessun match esatto → ricerca libera (lista risultati); zero risultati →
   * beep di errore + azioni «Cerca articolo» / «Crea articolo rapido», mai
   * righe incomplete. Il focus torna SEMPRE al campo scansione.
   */
  private commitScan(raw: string): void {
    const { quantity, code } = this.barcodeLookup.parseScanInput(raw);
    if (!code || this.lookupPending()) {
      return;
    }
    const locationId = this.selectedLocationId();
    if (!locationId) {
      this.lookupMessage.set('Seleziona la location del negozio.');
      return;
    }
    this.lookupPending.set(true);
    this.lookupMessage.set(null);
    this.unresolvedCode.set(null);
    this.lookupSubscription = this.barcodeLookup
      .resolveVariantIdByCode(code, { locationId })
      .pipe(
        switchMap((variantId) =>
          this.service.lookupItems(code, locationId).pipe(
            map((items) => ({
              exact: variantId
                ? (items.find((item) => item.variantId === variantId) ?? null)
                : null,
              items,
            })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ exact, items }) => {
          this.lookupPending.set(false);
          if (exact) {
            this.addToCart(exact, quantity);
            this.lookupResults.set(null);
            this.searchDraft.set('');
            this.focusSearchInput();
            return;
          }
          if (items.length === 0) {
            this.handleCodeNotFound(code);
            return;
          }
          this.lookupResults.set(items);
          this.focusSearchInput();
        },
        error: (err: unknown) => {
          this.lookupPending.set(false);
          this.lookupMessage.set(this.errorMessage(err));
          this.focusSearchInput();
        },
      });
  }

  /** Nessuna riga incompleta: beep non bloccante + azioni di recupero (§spec EAN). */
  private handleCodeNotFound(code: string): void {
    this.lookupResults.set(null);
    this.lookupMessage.set('Articolo non trovato.');
    this.unresolvedCode.set({ code, kind: looksLikeBarcode(code) ? 'barcode' : 'text' });
    this.playErrorBeep();
    this.focusSearchInput(true);
  }

  private addToCart(item: StoreSaleLookupItem, quantity = 1): void {
    this.saleError.set(null);
    this.lastSaleResult.set(null);
    this.lookupMessage.set(null);
    this.unresolvedCode.set(null);
    this.cart.update((lines) => {
      const existing = lines.find((line) => line.variantId === item.variantId);
      if (existing) {
        return lines.map((line) =>
          line.variantId === item.variantId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      const next: CartLine = {
        variantId: item.variantId,
        sku: item.sku,
        description: item.optionSummary
          ? `${item.productName} — ${item.optionSummary}`
          : item.productName,
        unitPriceMinor: item.sellingPriceMinor,
        quantity,
        discountPercent: 0,
        vatRatePercent: item.vatRatePercent,
        vatCodeId: item.vatCodeId,
        onHand: item.onHand,
        committed: item.committed,
        available: item.available,
      };
      return [...lines, next];
    });
    // Conferma sonora: l'operatore sa che l'articolo è entrato senza guardare.
    this.playSuccessBeep();
  }

  // ── EAN non trovato: azioni di recupero ──────────────────────────────────

  /** «Cerca articolo»: focus sulla ricerca manuale con il codice selezionato. */
  protected focusManualSearch(): void {
    this.focusSearchInput(true);
  }

  /**
   * «Crea articolo rapido»: ProductFormComponent nel pannello laterale.
   * Prefill: barcode = EAN scansionato non trovato, nome = testo cercato,
   * IVA = codice IVA vendite predefinito del tenant. SKU facoltativo.
   */
  protected openQuickProductCreate(): void {
    const unresolved = this.unresolvedCode();
    this.productPanelPrefill.set({
      name: unresolved?.kind === 'text' ? unresolved.code : undefined,
      barcode: unresolved?.kind === 'barcode' ? unresolved.code : undefined,
      defaultVatCodeId: this.defaultSalesVatCodeId(),
    });
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelPrefill.set(null);
    this.focusSearchInput();
  }

  /** Variante appena creata dal pannello: in carrello con quantità 1. */
  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    this.productPanelOpen.set(false);
    this.productPanelPrefill.set(null);
    this.addVariantToCartById(event.variantId);
  }

  /** «Salva senza aggiungere»: prodotto creato ma non aggiunto al carrello. */
  protected onProductSavedWithoutAttach(_event: { readonly variantId: string }): void {
    this.closeProductPanel();
  }

  /**
   * Carica i dati di carrello di una variante per id (creata al volo o scelta
   * dal pannello di ricerca): lookup cassa per barcode/SKU (prezzo, IVA
   * risolta e disponibilità alla location) con fallback sul riepilogo
   * variante (articolo nuovo: disponibilità 0).
   */
  private addVariantToCartById(variantId: string): void {
    const locationId = this.selectedLocationId();
    this.quickAddPending.set(true);
    this.quickAddSubscription = this.productService
      .searchVariantSummaries({ variantId })
      .pipe(
        take(1),
        switchMap((rows) => {
          const row = rows[0];
          if (!row) {
            return of<StoreSaleLookupItem | null>(null);
          }
          const code = row.barcode?.trim() || row.sku.trim();
          if (!code || !locationId) {
            return of(this.lookupItemFromSummary(row));
          }
          return this.service.lookupItems(code, locationId).pipe(
            map(
              (items) =>
                items.find((item) => item.variantId === variantId) ??
                this.lookupItemFromSummary(row),
            ),
            catchError(() => of(this.lookupItemFromSummary(row))),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (item) => {
          this.quickAddPending.set(false);
          if (item) {
            this.addToCart(item);
            this.searchDraft.set('');
          } else {
            this.lookupMessage.set(
              'Articolo creato ma non aggiunto al carrello: cercalo per aggiungerlo.',
            );
          }
          this.focusSearchInput();
        },
        error: () => {
          this.quickAddPending.set(false);
          this.lookupMessage.set(
            'Articolo creato ma non aggiunto al carrello: cercalo per aggiungerlo.',
          );
          this.focusSearchInput();
        },
      });
  }

  /** Fallback per varianti appena create: nessun livello ⇒ disponibilità 0. */
  private lookupItemFromSummary(row: VariantSummary): StoreSaleLookupItem {
    const vatCodeId = row.defaultVatCodeId ?? this.defaultSalesVatCodeId();
    const vatCode = vatCodeId ? this.vatCodeById().get(vatCodeId) : undefined;
    const separator = ' — ';
    const optionSummary = row.title.startsWith(`${row.productName}${separator}`)
      ? row.title.slice(row.productName.length + separator.length)
      : '';
    return {
      variantId: row.variantId,
      sku: row.sku,
      barcode: row.barcode ?? null,
      productName: row.productName,
      optionSummary,
      sellingPriceMinor: row.sellingPrice.amountMinor,
      currency: row.sellingPrice.currencyCode,
      vatRatePercent: vatCode ? Math.round(vatCode.ratePercent) : null,
      vatCodeId: vatCode?.id ?? null,
      vatCodeLabel: vatCode ? vatCodeOptionLabel(vatCode) : null,
      onHand: 0,
      committed: 0,
      available: 0,
    };
  }

  /**
   * Beep di errore via Web Audio API: onda quadra grave ~200ms. Timbro netto
   * e "negativo", distinto dal beep di conferma. AudioContext lazy.
   */
  private playErrorBeep(): void {
    this.playBeep({ type: 'square', frequency: 220, gain: 0.08, durationSec: 0.2 });
  }

  /**
   * Beep di conferma articolo aggiunto: onda sinusoidale acuta e breve,
   * chiaramente diversa dal beep di errore così l'operatore distingue i due
   * esiti senza guardare lo schermo.
   */
  private playSuccessBeep(): void {
    this.playBeep({ type: 'sine', frequency: 880, gain: 0.06, durationSec: 0.09 });
  }

  /** Genera un tono via Web Audio API; l'audio mancante non blocca la cassa. */
  private playBeep(options: {
    type: OscillatorType;
    frequency: number;
    gain: number;
    durationSec: number;
  }): void {
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      this.audioContext ??= new AudioContextCtor();
      const context = this.audioContext;
      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = options.type;
      oscillator.frequency.value = options.frequency;
      gain.gain.value = options.gain;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const now = context.currentTime;
      oscillator.start(now);
      oscillator.stop(now + options.durationSec);
    } catch {
      // Audio non disponibile (permessi/ambiente): resta il feedback a video.
    }
  }

  // ── Vendita: carrello ────────────────────────────────────────────────────

  protected changeQuantity(variantId: EntityId, delta: number): void {
    this.cart.update((lines) =>
      lines.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.max(1, line.quantity + delta) }
          : line,
      ),
    );
  }

  protected onQuantityInput(variantId: EntityId, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 1) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) => (line.variantId === variantId ? { ...line, quantity: value } : line)),
    );
  }

  /** Il prezzo si digita lordo e si memorizza netto: la vista non è il dato. */
  protected onPriceInput(variantId: EntityId, event: Event): void {
    const parsed = parseMoneyInput((event.target as HTMLInputElement).value);
    if (!parsed || parsed.amountMinor < 0) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) =>
        line.variantId === variantId
          ? {
              ...line,
              // Scorporo ESATTO: il netto memorizzato porta la coda decimale, ed
              // è quella a far tornare il prezzo digitato quando il campo lo
              // rimostra ivato (§sei decimali).
              unitPriceMinor: toStorableMinor(
                netFromGrossExact(parsed.amountMinor, this.lineRate(line)),
              ),
            }
          : line,
      ),
    );
  }

  protected onDiscountInput(variantId: EntityId, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) =>
        line.variantId === variantId ? { ...line, discountPercent: value } : line,
      ),
    );
  }

  protected removeLine(variantId: EntityId): void {
    this.cart.update((lines) => lines.filter((line) => line.variantId !== variantId));
  }

  /** Override manuale del Codice IVA riga (compatto: la risoluzione di default resta silenziosa). */
  protected onLineVatSelect(variantId: EntityId, value: string | null): void {
    this.cart.update((lines) =>
      lines.map((line) => (line.variantId === variantId ? { ...line, vatCodeId: value } : line)),
    );
  }

  /** Opzioni riga: codici attivi + eventuale codice risolto ora disattivato. */
  protected lineVatOptions(line: CartLine): readonly SelectMenuOption[] {
    const options = this.vatSelectOptions();
    if (!line.vatCodeId || options.some((option) => option.value === line.vatCodeId)) {
      return options;
    }
    const selected = this.vatCodeById().get(line.vatCodeId);
    if (!selected) {
      return options;
    }
    return [...options, { value: selected.id, label: vatCodeOptionLabel(selected) }];
  }

  // ── Netto memorizzato, ivato al banco ─────────────────────────────────────
  //
  // Il prezzo dell'articolo è netto, come ogni prezzo del gestionale. Alla cassa
  // però si ragiona su quello che il cliente paga: i campi mostrano il lordo e
  // l'operatore digita il lordo. La conversione avviene qui, all'aliquota della
  // riga; al server va sempre il netto.

  /** Dati IVA della riga: dal Codice IVA scelto, o dall'aliquota già risolta. */
  private lineVat(line: CartLine): VatComputationInput {
    const vatCode = line.vatCodeId ? this.vatCodeById().get(line.vatCodeId) : undefined;
    return vatCode ? vatInputFromVatCode(vatCode) : vatInputFromLegacyRate(line.vatRatePercent);
  }

  /** Aliquota effettiva per la conversione (0 = niente da aggiungere). */
  private lineRate(line: CartLine): number {
    const vat = this.lineVat(line);
    return entryIncludesVat('vat_included', vat) ? vat.ratePercent : 0;
  }

  /** Importi di riga con le stesse formule del server (una sola aritmetica). */
  private lineAmounts(line: CartLine) {
    return computeVatLineAmounts({
      enteredUnitCostMinor: line.unitPriceMinor,
      costEntryMode: 'vat_excluded',
      quantity: line.quantity,
      discountPercent: line.discountPercent,
      vat: this.lineVat(line),
    });
  }

  protected lineTotal(line: CartLine): string {
    return this.money(this.lineAmounts(line).lineGrossMinor);
  }

  /** Nel campo prezzo si vede il lordo: è il prezzo che il cliente paga. */
  protected priceInputValue(line: CartLine): string {
    const grossMinor = grossFromNetMinor(line.unitPriceMinor, this.lineRate(line));
    return moneyToDecimalString({ amountMinor: grossMinor, currencyCode: 'EUR' }).replace('.', ',');
  }

  /** Prezzo lordo di un articolo in lista ricerca, prima di entrare nel carrello. */
  protected lookupPrice(item: StoreSaleLookupItem): string {
    const vatCode = item.vatCodeId ? this.vatCodeById().get(item.vatCodeId) : undefined;
    const vat = vatCode
      ? vatInputFromVatCode(vatCode)
      : vatInputFromLegacyRate(item.vatRatePercent);
    const rate = entryIncludesVat('vat_included', vat) ? vat.ratePercent : 0;
    return this.money(grossFromNetMinor(item.sellingPriceMinor, rate));
  }

  /** Messaggio §8 con i tre valori, mostrato inline sulla riga eccedente (avviso). */
  protected availabilityMessage(line: CartLine): string {
    return `Quantità superiore alla disponibilità. Giacenza ${line.onHand}, impegnata ${line.committed}, disponibile ${line.available}. La vendita procederà comunque.`;
  }

  // ── Pagamento: righe multi-tender ────────────────────────────────────────

  protected onPaymentRowMethodChange(index: number, value: string | null): void {
    if (value !== 'cash' && value !== 'card' && value !== 'other') {
      return;
    }
    this.paymentRows.update((rows) =>
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              method: value,
              // Nota e «ricevuti» seguono il metodo: fuori dal loro metodo
              // sono rumore da non trascinare.
              methodNote: value === 'other' ? row.methodNote : '',
              tenderedMinor: value === 'cash' ? row.tenderedMinor : null,
            }
          : row,
      ),
    );
  }

  /** Quota già in unità minori: il parsing lo fa il pannello pagamenti. */
  protected onPaymentRowAmount(index: number, amountMinor: number): void {
    this.paymentRows.update((rows) => {
      const updated = rows.map((row, i) => (i === index ? { ...row, amountMinor } : row));
      // L'ultima riga assorbe il residuo quando si ritocca una quota sopra:
      // «20 in contanti, il resto in carta» si digita una volta sola.
      const last = updated.length - 1;
      if (updated.length > 1 && index !== last) {
        const others = updated.slice(0, last).reduce((sum, row) => sum + row.amountMinor, 0);
        const remainder = Math.max(0, this.cartTotalMinor() - others);
        return updated.map((row, i) => (i === last ? { ...row, amountMinor: remainder } : row));
      }
      return updated;
    });
  }

  protected onPaymentRowNote(index: number, note: string): void {
    this.paymentRows.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, methodNote: note } : row)),
    );
  }

  /** «Ricevuti» sui contanti: null = non digitato (nessun resto da mostrare). */
  protected onPaymentRowTendered(index: number, tenderedMinor: number | null): void {
    this.paymentRows.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, tenderedMinor } : row)),
    );
  }

  /** «Dividi pagamento»: nuova riga a quota zero, da ripartire subito sopra. */
  protected addPaymentRow(): void {
    const rows = this.paymentRows();
    if (rows.length >= 3) {
      return;
    }
    const used = new Set(rows.map((row) => row.method));
    const method: StoreSalePaymentMethod = !used.has('card')
      ? 'card'
      : !used.has('cash')
        ? 'cash'
        : 'other';
    this.paymentRows.update((list) => [
      ...list,
      { method, methodNote: '', amountMinor: 0, tenderedMinor: null },
    ]);
  }

  protected removePaymentRow(index: number): void {
    this.paymentRows.update((rows) =>
      rows.length > 1 ? rows.filter((_, i) => i !== index) : rows,
    );
  }

  private resetPaymentRows(): void {
    this.paymentRows.set([{ method: 'cash', methodNote: '', amountMinor: 0, tenderedMinor: null }]);
  }

  protected onSaleNotesInput(event: Event): void {
    this.saleNotes.set((event.target as HTMLTextAreaElement).value);
  }

  protected openSaleConfirm(): void {
    if (!this.canConcludeSale()) {
      return;
    }
    this.saleConfirmOpen.set(true);
  }

  protected readonly saleConfirmMessage = computed(() => {
    const base =
      `Confermi la vendita di ${this.cartQuantity()} articoli per un totale di ` +
      `${this.money(this.cartTotalMinor())}? La giacenza e la disponibilità verranno ` +
      `scaricate alla conferma.`;
    if (!this.hasAvailabilityWarning()) {
      return base;
    }
    return (
      `${base}\n\nAttenzione: una o più righe superano la disponibilità attuale. ` +
      `La vendita procederà comunque e la giacenza potrà andare in negativo.`
    );
  });

  protected concludeSale(onDone?: () => void): void {
    const locationId = this.selectedLocationId();
    if (!locationId || this.salePending() || !this.paymentsComplete()) {
      return;
    }
    this.salePending.set(true);
    this.saleError.set(null);
    this.saleSubscription = this.service
      .createSale({
        locationId,
        ...tenderToPaymentsPayload(this.cartTotalMinor(), this.paymentRows()),
        customerId: this.selectedCustomerId() ?? undefined,
        notes: this.saleNotes().trim() || undefined,
        lines: this.cart().map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent || undefined,
          vatCodeId: line.vatCodeId ?? undefined,
        })),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.salePending.set(false);
          this.saleConfirmOpen.set(false);
          this.lastSaleResult.set(result);
          this.cart.set([]);
          this.saleNotes.set('');
          this.resetPaymentRows();
          this.selectedCustomerId.set(null);
          // La vendita è entrata nella sessione: la fascia deve rifletterla.
          this.reloadCashSession(locationId);
          // Sede fiscale: emetti subito il documento commerciale.
          if (result.fiscal) {
            void this.emitFiscal(result.fiscal);
          } else {
            this.fiscalOutcome.set(null);
          }
          this.focusSearchInput();
          onDone?.();
        },
        error: (err: unknown) => {
          this.salePending.set(false);
          this.saleConfirmOpen.set(false);
          this.saleError.set(this.errorMessage(err));
        },
      });
  }

  // ── Reso vendita negozio ─────────────────────────────────────────────────

  protected onRecentSearchInput(event: Event): void {
    this.recentSearchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onRecentSearchSubmit(event: Event): void {
    event.preventDefault();
    this.loadRecentSales();
  }

  protected loadRecentSales(): void {
    if (this.recentPending()) {
      return;
    }
    this.recentPending.set(true);
    this.recentError.set(null);
    this.recentSubscription = this.service
      .getRecentSales(this.recentSearchDraft().trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sales) => {
          this.recentPending.set(false);
          this.recentSales.set(sales);
        },
        error: (err: unknown) => {
          this.recentPending.set(false);
          this.recentError.set(this.errorMessage(err));
        },
      });
  }

  protected selectSale(sale: RecentStoreSale): void {
    this.selectedSale.set(sale);
    this.lastReturnResult.set(null);
    this.returnError.set(null);
    this.returnLines.set(
      sale.lines.map((line): ReturnLine => ({
        variantId: line.variantId,
        sku: line.sku ?? '',
        description: line.description,
        soldQuantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        vatRatePercent: line.vatRatePercent,
        returnQuantity: 0,
        restockable: true,
      })),
    );
  }

  protected clearSelectedSale(): void {
    this.selectedSale.set(null);
    this.returnLines.set([]);
    this.returnReason.set('');
    this.returnNotes.set('');
    this.returnRefundMethod.set('cash');
  }

  protected onReturnRefundMethodChange(value: string | null): void {
    if (value === 'cash' || value === 'card' || value === 'other') {
      this.returnRefundMethod.set(value);
    }
  }

  protected onReturnQuantityInput(index: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.returnLines.update((lines) =>
      lines.map((line, i) =>
        i === index && Number.isInteger(value) && value >= 0
          ? { ...line, returnQuantity: Math.min(value, line.soldQuantity) }
          : line,
      ),
    );
  }

  protected onRestockableToggle(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.returnLines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, restockable: checked } : line)),
    );
  }

  protected onReturnReasonInput(event: Event): void {
    this.returnReason.set((event.target as HTMLInputElement).value);
  }

  protected onReturnNotesInput(event: Event): void {
    this.returnNotes.set((event.target as HTMLTextAreaElement).value);
  }

  protected openReturnConfirm(): void {
    if (!this.canConcludeReturn()) {
      return;
    }
    this.returnConfirmOpen.set(true);
  }

  protected readonly returnConfirmMessage = computed(() => {
    const total = this.returnableQuantity();
    const restock = this.restockQuantity();
    const excluded = total - restock;
    const suffix =
      excluded > 0 ? ` ${excluded} articoli non vendibili verranno documentati senza carico.` : '';
    return (
      `Confermi il reso di ${total} articoli? Solo la merce vendibile (${restock}) ` +
      `rientra in giacenza.${suffix}`
    );
  });

  protected concludeReturn(onDone?: () => void): void {
    const locationId = this.selectedLocationId();
    const sale = this.selectedSale();
    if (!locationId || this.returnPending()) {
      return;
    }
    const lines = this.returnLines().filter(
      (line) => line.returnQuantity > 0 && line.variantId != null,
    );
    if (lines.length === 0) {
      return;
    }
    this.returnPending.set(true);
    this.returnError.set(null);
    this.returnSubscription = this.service
      .createReturn({
        locationId,
        saleDocumentId: sale?.id,
        reason: this.returnReason().trim(),
        refundMethod: this.returnRefundMethod(),
        notes: this.returnNotes().trim() || undefined,
        lines: lines.map((line) => ({
          variantId: line.variantId!,
          quantity: line.returnQuantity,
          restockable: line.restockable,
          unitPriceMinor: line.unitPriceMinor,
        })),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.returnPending.set(false);
          this.returnConfirmOpen.set(false);
          this.lastReturnResult.set(result);
          this.clearSelectedSale();
          this.loadRecentSales();
          // Il rimborso è uscito dalla sessione: la fascia deve rifletterlo.
          this.reloadCashSession(locationId);
          // Sede fiscale: emetti il documento commerciale di reso.
          if (result.fiscal) {
            void this.emitFiscal(result.fiscal);
          } else {
            this.fiscalOutcome.set(null);
          }
          onDone?.();
        },
        error: (err: unknown) => {
          this.returnPending.set(false);
          this.returnConfirmOpen.set(false);
          this.returnError.set(this.errorMessage(err));
        },
      });
  }

  // ── Uscita con operazione in corso ───────────────────────────────────────

  /**
   * Guard di route: con lavoro in corso (carrello o reso) chiede conferma con
   * tre scelte. Risolve la Promise quando l'operatore decide.
   */
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.hasPendingWork()) {
      return true;
    }
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  /** «Annulla»: resta sulla schermata. */
  protected cancelExitDialog(): void {
    this.exitDialogOpen.set(false);
    this.pendingDeactivate?.(false);
    this.pendingDeactivate = null;
  }

  /** «Esci senza salvare»: svuota il lavoro in corso e procede. */
  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.cart.set([]);
    this.resetPaymentRows();
    this.clearSelectedSale();
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  /**
   * «Salva e chiudi»: conclude l'operazione attiva e, solo a salvataggio
   * riuscito, lascia proseguire la navigazione. Su errore resta sulla
   * schermata col messaggio già mostrato dal flusso di conclusione.
   */
  protected confirmExitSaveAndClose(): void {
    if (!this.canSaveAndClose()) {
      return;
    }
    const done = (): void => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    };
    if (this.mode() === 'sale') {
      this.concludeSale(done);
    } else {
      this.concludeReturn(done);
    }
  }

  // ── Utils ────────────────────────────────────────────────────────────────

  protected money(amountMinor: number): string {
    const money: Money = { amountMinor, currencyCode: 'EUR' };
    return formatMoney(money);
  }

  private errorMessage(err: unknown): string {
    if (isAppError(err)) {
      if (err.kind === AppErrorKind.NotFound) {
        return 'Nessun articolo trovato per questo codice.';
      }
      return err.message;
    }
    return 'Operazione non riuscita. Riprova.';
  }

  /** Il focus torna sempre al campo scansione; `selectText` evidenzia il codice. */
  private focusSearchInput(selectText = false): void {
    const input = this.searchInputRef()?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    if (selectText) {
      input.select();
    }
  }
}
