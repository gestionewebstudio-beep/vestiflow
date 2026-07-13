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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { Money } from '@core/models/money.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney, moneyToDecimalString, parseMoneyInput } from '@core/utils/money.util';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type {
  RecentStoreSale,
  StoreSaleLookupItem,
  StoreSalePaymentMethod,
  StoreSaleResult,
} from './models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';

type RegisterMode = 'sale' | 'return';

/** Riga del carrello cassa: quantità, prezzo modificabile e sconto (§7). */
interface CartLine {
  readonly variantId: EntityId;
  readonly sku: string;
  readonly description: string;
  readonly unitPriceMinor: number;
  readonly quantity: number;
  readonly discountPercent: number;
  readonly vatRatePercent: number | null;
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
  readonly unitPriceMinor: number;
  readonly returnQuantity: number;
  readonly restockable: boolean;
}

const PAYMENT_OPTIONS: readonly SelectMenuOption[] = [
  { value: 'cash', label: 'Contanti' },
  { value: 'card', label: 'Carta' },
  { value: 'other', label: 'Altro' },
];

function lineTotalMinor(line: CartLine): number {
  return Math.round((line.quantity * line.unitPriceMinor * (100 - line.discountPercent)) / 100);
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
    BarcodeScannerComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    SelectMenuComponent,
  ],
  templateUrl: './store-sale-register.component.html',
  styleUrl: './store-sale-register.component.scss',
})
export class StoreSaleRegisterComponent {
  private readonly service = inject(StoreSalesService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);

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

  // ── Vendita: ricerca articolo e carrello ────────────────────────────────

  protected readonly searchDraft = signal('');
  protected readonly lookupPending = signal(false);
  protected readonly lookupResults = signal<readonly StoreSaleLookupItem[] | null>(null);
  protected readonly lookupMessage = signal<string | null>(null);

  protected readonly cart = signal<readonly CartLine[]>([]);
  protected readonly paymentMethod = signal<StoreSalePaymentMethod>('cash');
  protected readonly saleNotes = signal('');
  protected readonly salePending = signal(false);
  protected readonly saleError = signal<string | null>(null);
  protected readonly saleConfirmOpen = signal(false);
  protected readonly lastSaleResult = signal<StoreSaleResult | null>(null);

  protected readonly cartTotalMinor = computed(() =>
    this.cart().reduce((sum, line) => sum + lineTotalMinor(line), 0),
  );

  protected readonly cartQuantity = computed(() =>
    this.cart().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** Righe che superano la Disponibile: avviso non bloccante (§16 post-audit). */
  protected readonly overAvailableLines = computed(() =>
    this.cart().filter((line) => line.quantity > line.available),
  );

  protected readonly hasAvailabilityWarning = computed(() => this.overAvailableLines().length > 0);

  protected readonly canConcludeSale = computed(
    () => this.cart().length > 0 && !!this.selectedLocationId() && !this.salePending(),
  );

  // ── Reso: vendita origine e righe di rientro ────────────────────────────

  protected readonly recentSearchDraft = signal('');
  protected readonly recentPending = signal(false);
  protected readonly recentSales = signal<readonly RecentStoreSale[]>([]);
  protected readonly recentError = signal<string | null>(null);

  protected readonly selectedSale = signal<RecentStoreSale | null>(null);
  protected readonly returnLines = signal<readonly ReturnLine[]>([]);
  protected readonly returnReason = signal('');
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

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private lookupSubscription: Subscription | null = null;
  private saleSubscription: Subscription | null = null;
  private recentSubscription: Subscription | null = null;
  private returnSubscription: Subscription | null = null;

  constructor() {
    afterNextRender(() => {
      this.focusSearchInput();
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
  }

  // ── Vendita: ricerca ─────────────────────────────────────────────────────

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.lookupCode(this.searchDraft().trim());
  }

  protected onBarcodeScanned(code: string): void {
    this.searchDraft.set(code);
    this.lookupCode(code);
  }

  protected addResultToCart(item: StoreSaleLookupItem): void {
    this.addToCart(item);
    this.lookupResults.set(null);
    this.searchDraft.set('');
    this.focusSearchInput();
  }

  private lookupCode(code: string): void {
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
    this.lookupSubscription = this.service
      .lookupItems(code, locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.lookupPending.set(false);
          if (items.length === 0) {
            this.lookupResults.set(null);
            this.lookupMessage.set('Nessun articolo trovato per questo codice.');
            return;
          }
          const exact = items.find(
            (item) =>
              item.sku.toLowerCase() === code.toLowerCase() ||
              item.barcode?.toLowerCase() === code.toLowerCase(),
          );
          if (exact && items.length === 1) {
            this.addToCart(exact);
            this.lookupResults.set(null);
            this.searchDraft.set('');
            this.focusSearchInput();
            return;
          }
          this.lookupResults.set(items);
        },
        error: (err: unknown) => {
          this.lookupPending.set(false);
          this.lookupMessage.set(this.errorMessage(err));
        },
      });
  }

  private addToCart(item: StoreSaleLookupItem): void {
    this.saleError.set(null);
    this.lastSaleResult.set(null);
    this.cart.update((lines) => {
      const existing = lines.find((line) => line.variantId === item.variantId);
      if (existing) {
        return lines.map((line) =>
          line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      const next: CartLine = {
        variantId: item.variantId,
        sku: item.sku,
        description: item.optionSummary
          ? `${item.productName} — ${item.optionSummary}`
          : item.productName,
        unitPriceMinor: item.sellingPriceMinor,
        quantity: 1,
        discountPercent: 0,
        vatRatePercent: item.vatRatePercent,
        onHand: item.onHand,
        committed: item.committed,
        available: item.available,
      };
      return [...lines, next];
    });
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

  protected onPriceInput(variantId: EntityId, event: Event): void {
    const parsed = parseMoneyInput((event.target as HTMLInputElement).value);
    if (!parsed || parsed.amountMinor < 0) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) =>
        line.variantId === variantId ? { ...line, unitPriceMinor: parsed.amountMinor } : line,
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

  protected lineTotal(line: CartLine): string {
    return this.money(lineTotalMinor(line));
  }

  protected priceInputValue(line: CartLine): string {
    return moneyToDecimalString({ amountMinor: line.unitPriceMinor, currencyCode: 'EUR' }).replace(
      '.',
      ',',
    );
  }

  /** Messaggio §8 con i tre valori, mostrato inline sulla riga eccedente (avviso). */
  protected availabilityMessage(line: CartLine): string {
    return `Quantità superiore alla disponibilità. Giacenza ${line.onHand}, impegnata ${line.committed}, disponibile ${line.available}. La vendita procederà comunque.`;
  }

  protected onPaymentMethodChange(value: string | null): void {
    if (value === 'cash' || value === 'card' || value === 'other') {
      this.paymentMethod.set(value);
    }
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

  protected concludeSale(): void {
    const locationId = this.selectedLocationId();
    if (!locationId || this.salePending()) {
      return;
    }
    this.salePending.set(true);
    this.saleError.set(null);
    this.saleSubscription = this.service
      .createSale({
        locationId,
        paymentMethod: this.paymentMethod(),
        notes: this.saleNotes().trim() || undefined,
        lines: this.cart().map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent || undefined,
          vatRatePercent: line.vatRatePercent ?? undefined,
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
          this.focusSearchInput();
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
      sale.lines.map(
        (line): ReturnLine => ({
          variantId: line.variantId,
          sku: line.sku ?? '',
          description: line.description,
          soldQuantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          returnQuantity: 0,
          restockable: true,
        }),
      ),
    );
  }

  protected clearSelectedSale(): void {
    this.selectedSale.set(null);
    this.returnLines.set([]);
    this.returnReason.set('');
    this.returnNotes.set('');
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

  protected concludeReturn(): void {
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
        },
        error: (err: unknown) => {
          this.returnPending.set(false);
          this.returnConfirmOpen.set(false);
          this.returnError.set(this.errorMessage(err));
        },
      });
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

  private focusSearchInput(): void {
    this.searchInputRef()?.nativeElement.focus();
  }
}
