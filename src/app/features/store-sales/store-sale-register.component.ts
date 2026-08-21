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
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import type { Money } from '@core/models/money.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import {
  canAccessInventorySection,
  canManageCatalog,
} from '@core/permissions/tenant-permissions.util';
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
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
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
  StoreSaleLookupItem,
  StoreSalePaymentMethod,
  StoreSaleResult,
} from '@domain/store-sales/models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';
import {
  requireStoreSaleMode,
  STORE_SALE_ROOT_PATH,
  storeSaleModeOfDocumentType,
  type StoreSaleMode,
} from '@domain/store-sales/models/store-sale-routing.util';
import { DocumentService } from '@domain/documents/services/document.service';
import type { DocumentRecord } from '@core/models/document.model';

/** I quattro stati del caricamento, come nelle altre sei maschere. */
type LoadState = 'ready' | 'loading' | 'not-found' | 'error';

/**
 * Identità di una riga NUOVA, generata dal client.
 *
 * ⚠️ Il prefisso la distingue da un id del server: una riga caricata da un
 * documento esistente porta il proprio, ed è quello che fa AGGIORNARE il
 * movimento collegato invece di ricrearlo. Al salvataggio le righe nuove
 * mandano `id` assente — questo serve solo dentro la maschera, per dare a ogni
 * riga un'identità stabile mentre la si compila.
 */
let contatoreRighe = 0;
function nuovoIdRiga(): string {
  contatoreRighe += 1;
  return `nuova-${contatoreRighe}`;
}

/** Alias locale: il modo della maschera vive nel registro delle rotte. */
type RegisterMode = StoreSaleMode;

/**
 * Una **riga documento** del banco: quantità, prezzo, sconto.
 *
 * ⛔ Si chiamava `CartLine` ed era il carrello della vecchia mini-cassa. La
 * Vendita al banco è un documento VestiFlow (`11`), e le sue righe hanno
 * un'**identità propria** come quelle di ogni altro documento.
 *
 * ⚠️ **`id` non è `variantId`**, ed è la differenza che conta: due righe dello
 * stesso articolo sono due righe — caso legittimo, e `regole-gestionale` dice
 * che restano due movimenti distinti. Indirizzando per variante collassavano in
 * una, e al salvataggio la seconda spariva col suo movimento.
 *
 * ⛔ **Due identità distinte, MAI la stessa cosa** (T1/T2, 21/08/2026):
 * `uiId` è la chiave stabile della riga DENTRO la maschera — `track`, i
 * gestori di click/input, la rimozione — e su una riga nuova è generata dal
 * client (`nuovoIdRiga()`); su una riga caricata vale lo stesso id del
 * server, ma resta un id di UI. `serverLineId` è l'unico che il payload può
 * mandare: `null` su una riga nuova, l'id vero su una caricata. Un id di
 * sessione (`nuova-3`) finito nel payload sarebbe scambiato dal server per
 * un id sconosciuto e rifiutato con 422 — separare i campi lo rende
 * strutturalmente impossibile, non solo un pattern da riconoscere.
 */
interface DocumentLineDraft {
  readonly uiId: string;
  /** Id persistito di `DocumentLine`. `null` = riga non ancora salvata. */
  readonly serverLineId: string | null;
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

/**
 * Riga del reso.
 *
 * ⛔ Nessun `soldQuantity`: il Reso **non ha documento origine** (`11` A11), e
 * senza un venduto non esiste un tetto da cui derivare un massimo. La vendita
 * reale puo' essere stata battuta su una cassa esterna e non esistere affatto
 * in VestiFlow.
 *
 * `uiId`/`serverLineId`: stessa distinzione di `DocumentLineDraft` (T1/T2) —
 * vedi il suo docblock.
 */
interface ReturnLine {
  readonly uiId: string;
  readonly serverLineId: string | null;
  readonly variantId: EntityId | null;
  readonly sku: string;
  readonly description: string;
  /** Prezzo unitario NETTO reso, dall'anagrafica secondo il contratto comune. */
  readonly unitPriceMinor: number;
  /** Aliquota del Codice IVA risolto dall'articolo: per mostrare l'ivato. */
  readonly vatRatePercent: number | null;
  readonly returnQuantity: number;
  /** Spunta «Carica giacenze» della riga (`11` A11-ter). */
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
 * Vendita al banco (fase 3 §7-§9): vendita immediata non fiscale a carrello e
 * Reso al banco collegato. Nessun movimento prima di «Concludi
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
    ConfirmDialogComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ProductFormComponent,
    DocumentProductSearchPanelComponent,
  ],
  templateUrl: './store-sale-register.component.html',
  styleUrl: './store-sale-register.component.scss',
})
export class StoreSaleRegisterComponent implements CanComponentDeactivate {
  private readonly service = inject(StoreSalesService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly productService = inject(ProductService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly route = inject(ActivatedRoute);
  private readonly documents = inject(DocumentService);
  private readonly router = inject(Router);

  // ── Cosa può fare chi sta al banco ───────────────────────────────────────

  /**
   * Chi batte alla cassa non sempre può creare articoli: senza questo permesso
   * il comando che apre l'anagrafica non compare, e al suo posto resta scritto
   * a chi chiedere l'articolo mancante.
   */
  protected readonly puoGestireCatalogo = computed(() => canManageCatalog(this.auth.currentUser()));

  /** Senza la sezione Magazzino lo storico movimenti rimbalza sulla dashboard. */
  protected readonly puoVedereMagazzino = computed(() =>
    canAccessInventorySection(this.auth.currentUser()),
  );

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

  /**
   * Vendita o Reso, e lo decide la ROTTA.
   *
   * ⛔ Nessun valore predefinito: `requireStoreSaleMode` lancia se la rotta non
   * lo dichiara. I due modi hanno effetti di magazzino OPPOSTI — uno scarica,
   * l'altro carica — e un fallback su `sale` farebbe compilare una vendita a
   * chi ha aperto «Nuovo reso al banco», senza che niente lo segnali.
   *
   * ⚠️ Si legge dallo `snapshot` e non dal flusso: le due rotte di creazione
   * sono voci distinte, quindi il componente viene DISTRUTTO e ricreato
   * passando dall'una all'altra (`TabRouteReuseStrategy.shouldReuseRoute`
   * confronta `routeConfig`). Non esiste il caso «stessa istanza, dato nuovo».
   *
   * ⛔ **In sola lettura dal 19/08/2026** (`11` C4): l'interruttore interno
   * non c'è più, e con lui l'unico modo che la maschera aveva di contraddire
   * l'indirizzo da cui si è entrati. Per cambiare tipo si cambia pagina.
   */
  protected readonly mode: Signal<RegisterMode> = signal(
    requireStoreSaleMode(this.route.snapshot.data),
  ).asReadonly();

  /**
   * Titolo e sottotestata SEGUONO il tipo della rotta.
   *
   * ⚠️ Erano fissi sulla vendita, e finché il tipo si cambiava da dentro non
   * si notava. Con due indirizzi distinti aprire «Nuovo reso al banco» avrebbe
   * mostrato «Vendita al banco» e una sottotestata che dichiara lo SCARICO
   * della giacenza — il contrario di quello che un reso fa.
   */
  protected readonly pageTitle = computed(() =>
    this.mode() === 'sale' ? 'Nuova vendita al banco' : 'Nuovo reso al banco',
  );

  protected readonly pageSubtitle = computed(() =>
    this.mode() === 'sale'
      ? 'Alla conclusione la giacenza e la disponibilità vengono scaricate; l’impegnata resta invariata. Non è un documento fiscale.'
      : 'Alla conclusione la merce resa rientra in giacenza, riga per riga secondo la spunta «Carica giacenze». Non è un documento fiscale.',
  );

  // ── Caricamento di un documento esistente (`11` C 3b) ────────────────────
  //
  // ⛔ È il pattern comune, non una variante: sei maschere lo ripetono identico
  // — `paramMap` (mai `snapshot`: il router riusa l'istanza passando da un
  // documento all'altro), un solo `loadTick`/`loadState` a quattro stati, e in
  // template la catena scheletro → errore → non modificabile → form.

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** L'id del documento da modificare, o `null` se se ne sta creando uno. */
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  private readonly loadTick = signal(0);

  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editDocumentId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<LoadState>('ready');
        }
        return this.documents.getDocumentById(id).pipe(
          map((doc): LoadState => {
            // ⚠️ Il tipo lo dice la ROTTA, non il documento: se non coincidono
            // l'indirizzo è sbagliato, e mostrarlo comunque farebbe compilare
            // un reso su una maschera che dice vendita.
            if (storeSaleModeOfDocumentType(doc.type) !== this.mode()) {
              return 'not-found';
            }
            this.patchFromDocument(doc);
            return 'ready';
          }),
          startWith<LoadState>('loading'),
          catchError(() => of<LoadState>('error')),
        );
      }),
    ),
    { initialValue: this.editDocumentId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-found');

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  /** Ritorno all'elenco dallo stato «non disponibile». */
  protected goToList(): void {
    void this.router.navigateByUrl(STORE_SALE_ROOT_PATH);
  }

  /**
   * Riempie la maschera da un documento salvato.
   *
   * ⛔ Le righe conservano l'**id del server**: è quello che fa AGGIORNARE il
   * movimento collegato invece di cancellarlo e riscriverlo — e riscriverlo
   * ricongelerebbe il costo di oggi su una vendita di marzo (`11` A2).
   *
   * ⚠️ I valori si prendono dal DOCUMENTO, non dall'anagrafica: è la regola «la
   * riga di un documento è una fotografia». Solo la disponibilità è un dato
   * live, e resta a zero finché non la si rilegge — al banco non serve a
   * decidere, serve a avvisare, e su un documento già salvato la merce è già
   * stata scaricata.
   */
  private patchFromDocument(doc: DocumentRecord): void {
    this.loadedDocument.set(doc);
    this.selectedLocationId.set(doc.locationId ?? null);
    this.cart.set(
      (doc.lines ?? []).map((line) => ({
        // uiId serve solo alla maschera (track/click); serverLineId è quello
        // che T1/T2 rimanda al server per far AGGIORNARE questa riga invece
        // di duplicarla — vedi il docblock di DocumentLineDraft.
        uiId: line.id,
        serverLineId: line.id,
        variantId: line.variantId ?? '',
        sku: line.sku ?? '',
        description: line.description,
        unitPriceMinor: line.unitPrice.amountMinor,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        vatRatePercent: line.vatSnapshot?.ratePercent ?? null,
        vatCodeId: line.vatCodeId ?? null,
        onHand: 0,
        committed: 0,
        available: 0,
      })),
    );
  }

  /** Il documento caricato, per i valori di testata che non si ricalcolano. */
  protected readonly loadedDocument = signal<DocumentRecord | null>(null);

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

  protected readonly cart = signal<readonly DocumentLineDraft[]>([]);
  protected readonly paymentMethod = signal<StoreSalePaymentMethod>('cash');
  /** Testo libero quando il metodo è «Altro» (es. «Assegno», «Bonifico»). */
  protected readonly paymentOtherText = signal('');
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

  protected readonly canConcludeSale = computed(
    () => this.cart().length > 0 && !!this.selectedLocationId() && !this.salePending(),
  );

  // ── Reso: vendita origine e righe di rientro ────────────────────────────

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
    this.addResolvedItem(item);
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
      this.lookupMessage.set('Seleziona la location.');
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
            this.addResolvedItem(exact, quantity);
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

  /**
   * La porta d'ingresso e' UNA SOLA per pistola e tastiera (`11` A14): la
   * ricerca e la risoluzione dell'articolo sono le stesse, e qui si decide
   * soltanto su quale documento finisce la riga.
   *
   * ⛔ Il Reso non dipende dal carrello della Vendita: ha le proprie righe. In
   * comune c'e' l'articolo risolto, non lo stato.
   */
  private addResolvedItem(item: StoreSaleLookupItem, quantity = 1): void {
    if (this.mode() === 'return') {
      this.addToReturn(item, quantity);
      return;
    }
    this.addToCart(item, quantity);
  }

  /** Stessa forma di `addToCart`, sull'altro documento. */
  private addToReturn(item: StoreSaleLookupItem, quantity = 1): void {
    this.returnError.set(null);
    this.lastReturnResult.set(null);
    this.lookupMessage.set(null);
    this.unresolvedCode.set(null);
    this.returnLines.update((lines) => {
      const existing = lines.find((line) => line.variantId === item.variantId);
      if (existing) {
        return lines.map((line) =>
          line.variantId === item.variantId
            ? { ...line, returnQuantity: line.returnQuantity + quantity }
            : line,
        );
      }
      const next: ReturnLine = {
        uiId: nuovoIdRiga(),
        serverLineId: null,
        variantId: item.variantId,
        sku: item.sku,
        description: item.optionSummary
          ? `${item.productName} — ${item.optionSummary}`
          : item.productName,
        // ⛔ Mai da una vendita precedente (`11` A11): l'unica fonte disponibile
        // e' l'anagrafica, secondo il contratto prezzi comune. Resta modificabile.
        unitPriceMinor: item.sellingPriceMinor,
        vatRatePercent: item.vatRatePercent,
        returnQuantity: quantity,
        restockable: true,
      };
      return [...lines, next];
    });
    this.playSuccessBeep();
  }

  private addToCart(item: StoreSaleLookupItem, quantity = 1): void {
    this.saleError.set(null);
    this.lastSaleResult.set(null);
    this.lookupMessage.set(null);
    this.unresolvedCode.set(null);
    this.cart.update((lines) => {
      // ⚠️ **La fusione per variante vive SOLO qui**, ed è una comodità della
      // scansione: passare due volte lo stesso capo sul lettore deve fare «2»,
      // non due righe. Fuori da questo punto le righe hanno identità propria e
      // due righe dello stesso articolo restano due — caso legittimo, e
      // `regole-gestionale` dice che sono due movimenti distinti.
      const existing = lines.find((line) => line.variantId === item.variantId);
      if (existing) {
        return lines.map((line) =>
          line.uiId === existing.uiId ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }
      const next: DocumentLineDraft = {
        uiId: nuovoIdRiga(),
        serverLineId: null,
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
            this.addResolvedItem(item);
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

  /** Genera un tono via Web Audio API; l'audio mancante non blocca la vendita. */
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

  protected changeQuantity(lineId: string, delta: number): void {
    this.cart.update((lines) =>
      lines.map((line) =>
        line.uiId === lineId ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line,
      ),
    );
  }

  protected onQuantityInput(lineId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 1) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) => (line.uiId === lineId ? { ...line, quantity: value } : line)),
    );
  }

  /** Il prezzo si digita lordo e si memorizza netto: la vista non è il dato. */
  protected onPriceInput(lineId: string, event: Event): void {
    const parsed = parseMoneyInput((event.target as HTMLInputElement).value);
    if (!parsed || parsed.amountMinor < 0) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) =>
        line.uiId === lineId
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

  protected onDiscountInput(lineId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return;
    }
    this.cart.update((lines) =>
      lines.map((line) => (line.uiId === lineId ? { ...line, discountPercent: value } : line)),
    );
  }

  protected removeLine(lineId: string): void {
    this.cart.update((lines) => lines.filter((line) => line.uiId !== lineId));
  }

  /** Override manuale del Codice IVA riga (compatto: la risoluzione di default resta silenziosa). */
  protected onLineVatSelect(lineId: string, value: string | null): void {
    this.cart.update((lines) =>
      lines.map((line) => (line.uiId === lineId ? { ...line, vatCodeId: value } : line)),
    );
  }

  /** Opzioni riga: codici attivi + eventuale codice risolto ora disattivato. */
  protected lineVatOptions(line: DocumentLineDraft): readonly SelectMenuOption[] {
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
  // Il prezzo dell'articolo è netto, come ogni prezzo del gestionale. Al banco
  // però si ragiona su quello che il cliente paga: i campi mostrano il lordo e
  // l'operatore digita il lordo. La conversione avviene qui, all'aliquota della
  // riga; al server va sempre il netto.

  /** Dati IVA della riga: dal Codice IVA scelto, o dall'aliquota già risolta. */
  private lineVat(line: DocumentLineDraft): VatComputationInput {
    const vatCode = line.vatCodeId ? this.vatCodeById().get(line.vatCodeId) : undefined;
    return vatCode ? vatInputFromVatCode(vatCode) : vatInputFromLegacyRate(line.vatRatePercent);
  }

  /** Aliquota effettiva per la conversione (0 = niente da aggiungere). */
  private lineRate(line: DocumentLineDraft): number {
    const vat = this.lineVat(line);
    return entryIncludesVat('vat_included', vat) ? vat.ratePercent : 0;
  }

  /** Importi di riga con le stesse formule del server (una sola aritmetica). */
  private lineAmounts(line: DocumentLineDraft) {
    return computeVatLineAmounts({
      enteredUnitCostMinor: line.unitPriceMinor,
      costEntryMode: 'vat_excluded',
      quantity: line.quantity,
      discountPercent: line.discountPercent,
      vat: this.lineVat(line),
    });
  }

  protected lineTotal(line: DocumentLineDraft): string {
    return this.money(this.lineAmounts(line).lineGrossMinor);
  }

  /** Nel campo prezzo si vede il lordo: è il prezzo che il cliente paga. */
  protected priceInputValue(line: DocumentLineDraft): string {
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
  protected availabilityMessage(line: DocumentLineDraft): string {
    return `Quantità superiore alla disponibilità. Giacenza ${line.onHand}, impegnata ${line.committed}, disponibile ${line.available}. La vendita procederà comunque.`;
  }

  protected onPaymentMethodChange(value: string | null): void {
    if (value === 'cash' || value === 'card' || value === 'other') {
      this.paymentMethod.set(value);
    }
  }

  protected onPaymentOtherInput(event: Event): void {
    this.paymentOtherText.set((event.target as HTMLInputElement).value);
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
    if (!locationId || this.salePending()) {
      return;
    }
    const method = this.paymentMethod();
    this.salePending.set(true);
    this.saleError.set(null);
    this.saleSubscription = this.service
      .createSale({
        // T1/T2: id assente = crea; presente = risalva LO STESSO documento.
        // Mai un id di sessione (uiId): solo serverLineId, mai confuso col
        // primo — vedi il docblock di DocumentLineDraft.
        id: this.editDocumentId() ?? undefined,
        locationId,
        paymentMethod: method,
        paymentMethodNote:
          method === 'other' ? this.paymentOtherText().trim() || undefined : undefined,
        customerId: this.selectedCustomerId() ?? undefined,
        notes: this.saleNotes().trim() || undefined,
        lines: this.cart().map((line) => ({
          id: line.serverLineId ?? undefined,
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
          this.paymentOtherText.set('');
          this.selectedCustomerId.set(null);
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

  // ── Reso al banco ─────────────────────────────────────────────────

  /** Svuota il reso in corso: righe, causale e note. */
  protected clearReturn(): void {
    this.returnLines.set([]);
    this.returnReason.set('');
    this.returnNotes.set('');
  }

  protected onReturnQuantityInput(index: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.returnLines.update((lines) =>
      lines.map((line, i) =>
        i === index && Number.isInteger(value) && value >= 0
          ? { ...line, returnQuantity: value }
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
        // T1/T2: stesso contratto della Vendita — vedi concludeSale.
        id: this.editDocumentId() ?? undefined,
        locationId,
        reason: this.returnReason().trim(),
        notes: this.returnNotes().trim() || undefined,
        lines: lines.map((line) => ({
          id: line.serverLineId ?? undefined,
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
          this.clearReturn();
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
    this.clearReturn();
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
