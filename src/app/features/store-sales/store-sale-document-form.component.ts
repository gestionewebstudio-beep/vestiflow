import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, map, of, startWith, switchMap, take, type Observable } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import {
  creationIntentErrorOf,
  creationIntentStillHeld,
} from '@core/models/creation-intent-error.util';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { parseEffectiveDiscountPercent } from '@core/utils/discount-percent.util';
import { LocationContextService } from '@core/services/location-context.service';
import { VatCodeService } from '@core/services/vat-code.service';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
} from '@core/utils/money.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { PriceModeMenuComponent } from '@domain/documents/components/price-mode-menu/price-mode-menu.component';
import { priceModeRowLabel } from '@domain/documents/models/document-price-mode.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentLineSearchPanelStore } from '@domain/documents/state/document-line-search-panel.store';
import { vatOptionsIncludingSelected } from '@domain/documents/utils/document-vat-options.util';
import {
  computeVatLineAmounts,
  grossFromNetMinor,
  netFromGrossExact,
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
  type VatLineAmounts,
} from '@domain/documents/utils/document-vat.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { ProductService } from '@domain/products/services/product.service';
import {
  newStoreSaleLineUiId,
  storeSaleLineFromDocumentLine,
  storeReturnLinePayload,
  storeSaleLinePayload,
  type StoreSaleDocumentLine,
} from '@domain/store-sales/models/store-sale-document-line.model';
import {
  STORE_SALE_LINE_COLUMNS,
  STORE_SALE_LINES_VIEW,
  STORE_SALE_LINE_PRESETS,
} from '@domain/store-sales/models/store-sale-line-columns.config';
import { storeSaleModeDescriptor } from '@domain/store-sales/models/store-sale-mode.descriptor';
import {
  requireStoreSaleMode,
  STORE_SALE_ROOT_PATH,
  storeSaleModeOfDocumentType,
} from '@domain/store-sales/models/store-sale-routing.util';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import {
  lineColumnQuotaWidth,
  sumVisibleLineColumnsPx,
} from '@shared/table-columns/line-column-quota.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import type { DocumentRecord } from '@core/models/document.model';
import type {
  CreateStoreReturnPayload,
  CreateStoreSalePayload,
  StoreSaleResult,
} from '@domain/store-sales/models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';

/** I quattro stati del caricamento, come nelle altre sei maschere. */
type LoadState = 'ready' | 'loading' | 'not-found' | 'error';

/**
 * I campi di testata che questa fase **conserva senza ancora mostrarli**.
 *
 * ⛔ Non sono un ripiego: il server riscrive la testata da quello che riceve —
 * `notes: dto.notes?.trim() || null`, e lo stesso per la causale. Ometterli
 * risalvando un documento esistente li **cancellerebbe**. Qui si caricano dal
 * documento e si rimandano tali e quali; i loro campi arrivano col piede.
 *
 * ⛔ **Il PAGAMENTO non sta qui, e non è una svista** (`11` A8): la sua
 * gestione è differita al blocco Pagamenti/Tesoreria, quindi questa maschera
 * non lo tocca in nessun modo — né campo, né valore, né trasporto. Il dato
 * storico lo protegge il server, che senza `paymentMethod` dichiarato conserva
 * quello persistito.
 */
interface PreservedHeader {
  readonly notes: string;
  readonly causale: string;
}

const PRESERVED_HEADER_VUOTA: PreservedHeader = {
  notes: '',
  causale: '',
};

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * La maschera **nuova** di Vendita e Reso al banco: un documento VestiFlow, non
 * una cassa con un carrello (`11`).
 *
 * ⛔ **Non è ancora montata su nessuna rotta**, e la decisione è del
 * proprietario (21/08/2026): le quattro rotte operative restano su
 * `StoreSaleRegisterComponent` finché questa maschera non ha almeno testata e
 * area righe, cioè finché non è realmente utilizzabile. Fino ad allora si
 * verifica con i test, e non si espone una maschera a metà.
 *
 * **Che cosa c'è:**
 *
 * ```text
 * modo dalla ROTTA · descrittore · UN modello di riga · UNA collezione
 * testata: sede · cliente (facoltativo, entrambi i modi) · data
 * righe: celle comuni, colonne del banco, spunta di magazzino, netto/ivato
 * porta d'ingresso: ricerca e scansione, EAN ripetuto che incrementa
 * caricamento per id, salvataggio create/update, intento di creazione (T15)
 * ```
 *
 * **Che cosa NON c'è ancora**, e va saputo prima di montarla:
 *
 * | manca                        | arriva con                       |
 * | ---------------------------- | -------------------------------- |
 * | vista a card sotto `lg`      | il blocco mobile                 |
 * | Numero/Serie in testata      | T8B, col giro dei contatori      |
 * | piede: totali, note, azioni  | il blocco piede                  |
 * | `canDeactivate` e il dialogo | il piede, insieme alle azioni    |
 * | battuta HID riconosciuta     | il blocco scanner (misura M1/M2) |
 *
 * ⚠️ Finché `canDeactivate` non c'è, `unsavedChangesGuard` lascia uscire senza
 * chiedere (per costruzione: usa l'optional chaining). Va scritto **nello
 * stesso passo** che monta le rotte, o si esce da un documento aperto senza che
 * nessuno lo chieda.
 */
@Component({
  selector: 'app-store-sale-document-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    DateInputComponent,
    DocumentLineSelectCellComponent,
    DocumentMobilePanelComponent,
    DocumentProductSearchPanelComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    PriceModeMenuComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableColumnPickerComponent,
    TableColumnResizeDirective,
    TableSkeletonComponent,
  ],
  templateUrl: './store-sale-document-form.component.html',
  styleUrl: './store-sale-document-form.component.scss',
})
export class StoreSaleDocumentFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(StoreSalesService);
  private readonly documents = inject(DocumentService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);

  /**
   * Vendita o Reso, e lo decide la **rotta**.
   *
   * ⛔ Nessun valore predefinito: `requireStoreSaleMode` lancia se la rotta non
   * lo dichiara. I due modi hanno effetti di magazzino opposti, e un fallback
   * su `sale` farebbe compilare una vendita a chi ha aperto «Nuovo reso al
   * banco», senza che niente lo segnali.
   *
   * ⚠️ È un valore fisso, non un signal: le due rotte di creazione sono voci
   * distinte, quindi il componente viene distrutto e ricreato passando dall'una
   * all'altra. Non esiste il caso «stessa istanza, modo nuovo».
   */
  private readonly mode = requireStoreSaleMode(this.route.snapshot.data);

  /** Tutte le differenze fra i due modi, dichiarate in un posto solo. */
  protected readonly descriptor = storeSaleModeDescriptor(this.mode);

  // ── Caricamento di un documento esistente ───────────────────────────────
  //
  // È il pattern comune delle altre maschere: `paramMap` (mai `snapshot`, il
  // router riusa l'istanza passando da un documento all'altro), un `loadTick`
  // per il «riprova», e quattro stati letti dal template.

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** L'id del documento da modificare, o `null` se se ne sta creando uno. */
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  protected readonly pageTitle = computed(() =>
    this.isEditMode() ? this.descriptor.editTitle : this.descriptor.createTitle,
  );

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
            // l'indirizzo è sbagliato, e mostrarlo comunque farebbe correggere
            // un reso su una maschera che dice vendita.
            if (storeSaleModeOfDocumentType(doc.type) !== this.mode) {
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

  // ── Testata ─────────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    locationId: this.fb.control('', { validators: [Validators.required] }),
    /** Facoltativo, e solo sulla Vendita: il contratto del Reso non lo prevede. */
    customerId: this.fb.control(''),
    documentDate: this.fb.control(oggiIso(), { validators: [Validators.required] }),
  });

  // Snapshot reattivo del form: i computed qui sotto leggono i FormControl, che
  // non sono signal — senza questa dipendenza resterebbero memoizzati.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /**
   * I campi di testata che questa fase conserva senza mostrarli. Vedi
   * `PreservedHeader`: non mandarli al risalvataggio li cancellerebbe.
   */
  private readonly preserved = signal<PreservedHeader>(PRESERVED_HEADER_VUOTA);

  /**
   * Le righe del documento. **Una collezione sola**, per Vendita e Reso: i due
   * modi condividono struttura e modello, e divergono solo negli effetti che la
   * conclusione produce.
   */
  protected readonly lines = signal<readonly StoreSaleDocumentLine[]>([]);

  /** Il documento non ha ancora righe: lo stato vuoto lo dice. */
  protected readonly hasLines = computed(() => this.lines().length > 0);

  private patchLine(uiId: string, patch: Partial<StoreSaleDocumentLine>): void {
    this.lines.update((lines) =>
      lines.map((line) => (line.uiId === uiId ? { ...line, ...patch } : line)),
    );
  }

  protected removeLine(uiId: string): void {
    this.lines.update((lines) => lines.filter((line) => line.uiId !== uiId));
  }

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.actionLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /**
   * La sede **precompila, e resta un normale controllo comune** (`11` A13).
   *
   * ⛔ Una sola sede disponibile non cambia la natura del campo: la maschera
   * legacy in quel caso mostrava un'etichetta al posto della tendina, e
   * portarsela dietro avrebbe fatto di un default una regola funzionale
   * diversa. Il default riempie; cambiarlo resta possibile, e l'autorizzazione
   * la fa il server (T6).
   *
   * ⛔ **In modifica non scrive niente**: vince la sede persistita sul
   * documento. Sovrascriverla con la sede corrente lo sposterebbe di magazzino
   * aprendolo, e un cambio dev'essere esplicito.
   */
  private readonly precompilaSedePredefinita = effect(() => {
    if (this.isEditMode() || this.form.controls.locationId.value) {
      return;
    }
    const preferita = this.locationContext.activeLocationId();
    const disponibili = this.operationalLocations.actionLocations();
    const scelta =
      disponibili.find((loc) => loc.id === preferita)?.id ??
      (disponibili.length === 1 ? disponibili[0]!.id : null);
    if (!scelta) {
      return;
    }
    this.form.controls.locationId.setValue(scelta);
  });

  // Il cliente è facoltativo e sta nella testata di ENTRAMBI i modi (`11` A13):
  // l'elenco si carica allo stesso modo su Vendita e Reso.
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

  /**
   * Il cambio di sede è **esplicito**: lo fa l'operatore, e da lì in poi il
   * valore è una scelta. L'autorizzazione la verifica il server su entrambe le
   * sedi, quella del documento e quella richiesta (T6).
   */
  protected onLocationChange(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsDirty();
    this.locationContext.setActiveLocation(value);
  }

  protected onCustomerChange(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsDirty();
  }

  // ── Prima la testata, poi le righe ──────────────────────────────────────
  //
  // Finché manca il campo che governa le righe, al posto della tabella c'è uno
  // stato vuoto che dice **cosa manca** (`regole-stile-ui` §7). Non una tabella
  // spenta a metà tinta: se una cosa non è utilizzabile, non c'è.
  //
  // Al banco il campo è **uno solo**: la sede, che decide da quale giacenza si
  // scarica o in quale rientra la merce. Il cliente è facoltativo e non entra
  // nel gate (`11` A13).

  protected readonly headerGateActive = computed(() => {
    this.formValue();
    return !this.form.controls.locationId.value;
  });

  protected readonly linesEmptyTitle = computed(() =>
    this.headerGateActive() ? 'Scegli la sede' : 'Nessuna riga inserita',
  );

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'La sede decide il magazzino movimentato: senza, la disponibilità mostrata sulle righe non sarebbe quella su cui si sta lavorando.'
      : 'Le righe si aggiungono cercando un articolo per codice, SKU, EAN o nome.',
  );

  /**
   * Campo obbligatorio ancora vuoto che tiene ferme le righe: si segna col
   * colore del **campo in attesa** (`--color-field-waiting`), non col rosso
   * dell'errore — aprire un documento nuovo non è uno sbaglio dell'operatore.
   */
  protected readonly locationWaiting = computed(() => this.headerGateActive());

  protected locationInvalid(): boolean {
    const control = this.form.controls.locationId;
    return control.invalid && (control.touched || control.dirty);
  }

  // ── Testata mobile: un pannello apribile, come sulle altre maschere ──────

  protected readonly mobilePanelTitle = computed(() => {
    this.formValue();
    const sede = this.operationalLocations
      .actionLocations()
      .find((loc) => loc.id === this.form.controls.locationId.value)?.name;
    return sede ?? 'Sede da scegliere';
  });

  protected readonly mobilePanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const parts: string[] = [];
    const cliente = this.customerOptions().find(
      (option) => option.value === this.form.controls.customerId.value,
    );
    if (cliente) {
      parts.push(cliente.label);
    }
    const data = this.form.controls.documentDate.value;
    parts.push(data ? formatIsoDate(data) : 'Data non indicata');
    return parts;
  });

  protected readonly mobileHeaderReady = computed(() => !this.headerGateActive());

  protected readonly mobilePanelStatus = computed(() =>
    this.mobileHeaderReady() ? 'Dati principali completi.' : 'La sede è obbligatoria.',
  );

  // ── Intento di creazione (T15) ──────────────────────────────────────────

  /**
   * L'identità dell'**intento di creazione** della compilazione in corso: è ciò
   * che rende riconoscibile un reinvio. Se la transazione ha già committato e
   * la risposta si è persa, il server ritrova questa identità e restituisce il
   * documento già registrato invece di crearne un secondo.
   *
   * ⛔ **Non si deriva dal contenuto**: due clienti che comprano la stessa
   * maglietta nello stesso minuto producono payload identici, e a distinguere
   * le due vendite può essere solo l'intento.
   */
  private readonly _creationIntentId = signal<string | null>(null);

  /**
   * L'intento da mandare, generato alla prima occorrenza.
   *
   * ⚠️ `undefined` in MODIFICA: lì non si crea niente, e rivendicare un intento
   * impedirebbe la seconda modifica legittima dello stesso documento.
   */
  private creationIntentForSave(): string | undefined {
    if (this.editDocumentId()) {
      return undefined;
    }
    const gia = this._creationIntentId();
    if (gia) {
      return gia;
    }
    const nuovo = crypto.randomUUID();
    this._creationIntentId.set(nuovo);
    return nuovo;
  }

  /**
   * Chiude l'intento **solo se l'errore dice con certezza che non è stato creato
   * niente**. Conservarlo su un esito incerto costa un messaggio da rileggere;
   * chiuderlo per sbaglio costa un secondo documento.
   *
   * ⛔ Il 409 **non è una categoria sola**: `document_number_taken` ha fatto
   * rollback e libera l'intento, mentre `creation_intent_mismatch` e
   * `_in_progress` dicono che un documento c'è o sta nascendo.
   */
  private rotateCreationIntentIfCertain(error: unknown): void {
    if (creationIntentStillHeld(error)) {
      return;
    }
    const incerto =
      !isAppError(error) ||
      error.kind === AppErrorKind.Timeout ||
      error.kind === AppErrorKind.Network ||
      error.kind === AppErrorKind.Server ||
      error.kind === AppErrorKind.Unknown;
    if (!incerto) {
      this._creationIntentId.set(null);
    }
  }

  /**
   * Il documento che quell'intento aveva già creato, quando il server lo nomina
   * (T15 I7): serve a **ricondurre l'operatore al documento**, non a decidere.
   * Chi decide se l'intento è riusabile è il codice dell'errore.
   */
  readonly alreadyCreatedDocumentId = signal<string | null>(null);

  // ── La porta d'ingresso delle righe ──────────────────────────────────────
  //
  // `11` A14: **una sola** porta per pistola e tastiera. Si digita o si spara;
  // la riga nasce solo quando un articolo è davvero risolto — una query digitata
  // non è una riga — e dopo l'aggiunta il campo torna pronto.
  //
  // ⛔ Nessun movimento di magazzino qui: l'effetto fisico nasce alla
  // conclusione (`11` A18).

  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly productService = inject(ProductService);
  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly searchDraft = signal('');
  protected readonly searchPending = signal(false);
  /** Esito dell'ultima scansione non risolta: nessuna riga, solo il messaggio. */
  protected readonly searchMessage = signal<string | null>(null);

  /** Pannello di ricerca articolo: lo stato è quello comune (E-5). */
  protected readonly lineSearchPanel = new DocumentLineSearchPanelStore();

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.commitScan(this.searchDraft());
  }

  /** Apre la ricerca assistita col testo già digitato. */
  protected openProductSearch(): void {
    this.lineSearchPanel.open(this.searchDraft().trim());
  }

  /** Apertura dalla riga: la cella articolo la chiede, e la porta è la stessa. */
  protected openLineProductSearch(lineIndex: number): void {
    const line = this.lines()[lineIndex];
    this.lineSearchPanel.openForLine(lineIndex, line?.description ?? '');
  }

  protected closeProductSearch(): void {
    this.lineSearchPanel.close();
  }

  /**
   * Scelta dal pannello: **è la selezione reale a creare la riga** (A14).
   *
   * Se il pannello era stato aperto DA una riga, la scelta sostituisce
   * l'articolo di quella riga invece di aggiungerne una — altrimenti aprire la
   * ricerca da una riga esistente ne creerebbe una seconda.
   */
  protected onProductSearchPick(variantId: string): void {
    const lineIndex = this.lineSearchPanel.lineIndex();
    this.lineSearchPanel.close();
    if (lineIndex === null) {
      this.acquireVariant(variantId, 1);
      return;
    }
    const target = this.lines()[lineIndex];
    if (!target) {
      return;
    }
    this.readVariant(variantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((summary) => {
        if (!summary) {
          return;
        }
        this.lines.update((lines) =>
          lines.map((line) =>
            line.uiId === target.uiId ? { ...line, ...this.lineFromVariant(summary, line) } : line,
          ),
        );
      });
  }

  /**
   * Una battuta completa: codice (con eventuale moltiplicatore) → articolo.
   *
   * ⚠️ Il **riconoscimento della battuta da lettore** — soglia fra i tasti,
   * prefissi, firme — non sta qui: è la capacità comune del blocco scanner, che
   * richiede la misura con un lettore vero. Qui la porta è quella di oggi, e
   * funziona con la pistola configurata a mandare Invio.
   */
  protected commitScan(raw: string): void {
    const codice = raw.trim();
    if (!codice || this.searchPending()) {
      return;
    }
    const { quantity, code } = this.barcodeLookup.parseScanInput(codice);
    this.searchPending.set(true);
    this.searchMessage.set(null);
    this.barcodeLookup
      .resolveVariantIdByCode(code)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId: string | null) => {
          if (!variantId) {
            this.searchPending.set(false);
            this.notFound(code);
            return;
          }
          this.acquireVariant(variantId, quantity);
        },
        error: () => {
          this.searchPending.set(false);
          this.notFound(code);
        },
      });
  }

  /**
   * Codice non trovato: **segnale acustico, nessuna riga, nessun popup**, e
   * subito pronti alla scansione successiva (A14).
   */
  private notFound(code: string): void {
    this.searchMessage.set(`Nessun articolo per «${code}».`);
    this.beep();
    this.focusSearchInput(true);
  }

  /**
   * L'articolo entra nel documento.
   *
   * ⭐ **Stesso EAN due volte → la riga esistente cresce** (A14): al banco
   * passare due volte lo stesso capo sul lettore vuol dire due pezzi, non due
   * righe. È la regola del banco, e vale per la maschera — non la decide la
   * scansione.
   */
  private acquireVariant(variantId: string, quantity: number): void {
    const esistente = this.lines().find((line) => line.variantId === variantId);
    if (esistente) {
      this.patchLine(esistente.uiId, { quantity: esistente.quantity + Math.max(1, quantity) });
      this.searchPending.set(false);
      this.afterAcquire();
      return;
    }
    this.readVariant(variantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((summary) => {
        this.searchPending.set(false);
        if (!summary) {
          this.notFound(variantId);
          return;
        }
        const nuova: StoreSaleDocumentLine = {
          uiId: newStoreSaleLineUiId(),
          serverLineId: null,
          variantId,
          sku: '',
          description: '',
          persistedDescription: null,
          quantity: Math.max(1, quantity),
          unitPriceMinor: 0,
          discountPercent: 0,
          vatCodeId: null,
          persistedVatCodeId: null,
          vatRatePercent: null,
          loadsStock: true,
          onHand: 0,
          committed: 0,
          available: 0,
        };
        this.lines.update((lines) => [...lines, { ...nuova, ...this.lineFromVariant(summary) }]);
        this.afterAcquire();
      });
  }

  /**
   * I valori che una riga NUOVA prende dall'anagrafica.
   *
   * ⚠️ Su una riga già esistente si passa `previous`: descrizione e prezzo
   * restano quelli del documento, perché la riga è una fotografia — si aggiorna
   * ciò che segue l'articolo (identità, disponibilità), non ciò che l'operatore
   * ha già scritto.
   */
  private lineFromVariant(
    summary: VariantSummary,
    previous?: StoreSaleDocumentLine,
  ): Partial<StoreSaleDocumentLine> {
    return {
      variantId: summary.variantId,
      sku: previous?.serverLineId ? previous.sku : summary.sku,
      description: previous?.serverLineId ? previous.description : summary.title,
      unitPriceMinor: previous?.serverLineId
        ? previous.unitPriceMinor
        : summary.sellingPrice.amountMinor,
      vatCodeId: previous?.serverLineId ? previous.vatCodeId : (summary.defaultVatCodeId ?? null),
      // ⏸ Default della spunta: **dal contratto documentale comune**, non dalla
      // vecchia maschera del banco — un articolo gestito a magazzino movimenta, uno no
      // (`VariantSummary.managesStock`, `11` A11-ter «vale la logica documentale
      // già comune»). Il valore predefinito non è dichiarato in A: è il punto
      // che resta da confermare.
      loadsStock: previous?.serverLineId ? previous.loadsStock : summary.managesStock !== false,
      onHand: summary.stockOnHand ?? 0,
      committed: Math.max(0, (summary.stockOnHand ?? 0) - (summary.stockAvailable ?? 0)),
      available: summary.stockAvailable ?? 0,
    };
  }

  /** Riepilogo della variante alla sede del documento: giacenze comprese. */
  private readVariant(variantId: string): Observable<VariantSummary | null> {
    return this.productService
      .searchVariantSummaries({
        variantId,
        locationId: this.form.controls.locationId.value || undefined,
        pageSize: 1,
      })
      .pipe(
        take(1),
        map((rows) => rows[0] ?? null),
        catchError(() => of(null)),
      );
  }

  /** Dopo ogni inserimento riuscito: campo pulito e fuoco lì (A14, A19). */
  private afterAcquire(): void {
    this.searchDraft.set('');
    this.searchMessage.set(null);
    this.focusSearchInput();
  }

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

  /** Beep di esito: al banco si sente senza guardare, ed è la conferma. */
  private audioContext: AudioContext | null = null;

  private beep(): void {
    try {
      this.audioContext ??= new AudioContext();
      const context = this.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 220;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // Nessun audio disponibile: il messaggio a schermo resta.
    }
  }

  // ── Colonne della griglia ────────────────────────────────────────────────
  //
  // Il piano colonne è PROPRIO del banco (`STORE_SALE_LINE_COLUMNS`, scritto il
  // 19/08 e finora mai usato), l'implementazione è quella comune. ⛔ La lista non
  // dichiara il COSTO: al banco non deve esistere nemmeno come colonna spenta, e
  // la sola via per non offrirlo nel selettore è non dichiararlo.

  private readonly columnPreferences = inject(TableColumnPreferenceService);
  protected readonly lineColumnsView = STORE_SALE_LINES_VIEW;

  constructor() {
    // La vista si dichiara al servizio comune: colonne e preset del banco.
    // Senza, il selettore Colonne non saprebbe che cosa offrire e le larghezze
    // salvate non avrebbero un posto dove vivere.
    this.columnPreferences.registerView(
      this.lineColumnsView,
      STORE_SALE_LINE_COLUMNS,
      STORE_SALE_LINE_PRESETS,
    );
  }

  protected isLineColumnVisible(columnId: string): boolean {
    return this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  private lineColumnPx(columnId: string): number {
    const def = STORE_SALE_LINE_COLUMNS.find((column) => column.id === columnId);
    return this.columnPreferences.columnWidth(
      this.lineColumnsView,
      columnId,
      def?.defaultWidthPx ?? 96,
    );
  }

  private lineColumnsTotalPx(): number {
    return sumVisibleLineColumnsPx(
      STORE_SALE_LINE_COLUMNS,
      (id) => this.isLineColumnVisible(id),
      (id) => this.lineColumnPx(id),
    );
  }

  /** Larghezza come quota del totale visibile: il motore comune di `shared/`. */
  protected lineColumnWidth(columnId: string): string {
    return lineColumnQuotaWidth(columnId, this.lineColumnsTotalPx(), (id) => this.lineColumnPx(id));
  }

  protected lineColumnMinWidth(columnId: string): number {
    return STORE_SALE_LINE_COLUMNS.find((column) => column.id === columnId)?.minWidthPx ?? 56;
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(this.lineColumnsView, columnId, widthPx);
  }

  // ── Netto / ivato ────────────────────────────────────────────────────────
  //
  // Contratto comune degli altri documenti (`11` A4): nessuna implementazione
  // locale del banco, nessun forcing «sempre ivato». Il selettore vive nella
  // TESTATA DELLA COLONNA PREZZO, ed è per questo che nasce insieme alla tabella
  // e non in un passo a parte.
  //
  // ⛔ La modalità è **rappresentazione**: il dato di riga resta il netto in
  // entrambe, e cambiarla non cambia quanto vale il documento.

  protected readonly pricesIncludeVat = signal(false);
  protected readonly priceRowLabel = computed(() => priceModeRowLabel(this.pricesIncludeVat()));
  protected readonly priceModeMenuOpen = signal(false);

  protected togglePriceModeMenu(): void {
    this.priceModeMenuOpen.update((open) => !open);
  }

  private priceModeInitialized = false;

  /**
   * La modalità iniziale di un documento NUOVO: memoria dell'operatore per il
   * tipo, poi convenzione aziendale. La risolve il server, come per ogni altro
   * documento — qui si chiede, non si decide.
   */
  private readonly initPriceMode = effect(() => {
    if (this.isEditMode() || this.priceModeInitialized) {
      return;
    }
    this.priceModeInitialized = true;
    this.documents
      .getPriceModePreference(this.descriptor.documentType)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pricesIncludeVat) => this.pricesIncludeVat.set(pricesIncludeVat),
        error: () => undefined,
      });
  });

  /**
   * Cambia come i prezzi si leggono, **senza toccare il dato**.
   *
   * Il netto resta il netto: cambia il campo mostrato, e la conversione parte
   * dal valore memorizzato — non da quello a schermo, già arrotondato a due
   * decimali. È la ragione per cui netto → ivato → netto torna identico, coda
   * decimale compresa.
   */
  protected setPriceMode(pricesIncludeVat: boolean): void {
    this.priceModeMenuOpen.set(false);
    this.pricesIncludeVat.set(pricesIncludeVat);
  }

  /** Il valore da MOSTRARE nel campo prezzo, secondo la modalità corrente. */
  protected priceFieldValue(line: StoreSaleDocumentLine): string {
    const rate = this.lineVatRate(line);
    const shown = this.pricesIncludeVat()
      ? grossFromNetMinor(line.unitPriceMinor, rate)
      : line.unitPriceMinor;
    return moneyToDecimalString({ amountMinor: shown, currencyCode: DEFAULT_CURRENCY });
  }

  /** Il digitato torna netto canonico: la forma `*Exact`, che conserva la coda. */
  protected onPriceInput(line: StoreSaleDocumentLine, raw: string): void {
    const parsed = parseMoneyInput(raw, DEFAULT_CURRENCY);
    if (!parsed) {
      return;
    }
    const rate = this.lineVatRate(line);
    const net = this.pricesIncludeVat()
      ? netFromGrossExact(parsed.amountMinor, rate)
      : parsed.amountMinor;
    this.patchLine(line.uiId, { unitPriceMinor: toStorableMinor(net) });
  }

  // ── IVA di riga ──────────────────────────────────────────────────────────

  private readonly vatCodeService = inject(VatCodeService);

  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  /**
   * Le opzioni IVA della riga: quelle attive di vendita, **più** il codice della
   * riga se nel frattempo è stato disattivato — o il documento mostrerebbe un
   * campo vuoto al posto dell'imposta che ha davvero applicato.
   */
  private readonly activeVatOptions = computed((): readonly SelectMenuOption[] =>
    this.vatCodes()
      .filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode))
      .map((vatCode) => ({ value: vatCode.id, label: vatCodeOptionLabel(vatCode) })),
  );

  protected vatOptions(line: StoreSaleDocumentLine): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(this.activeVatOptions(), line.vatCodeId, this.vatCodeById());
  }

  /** Aliquota della riga: dal Codice IVA risolto, o dallo snapshot persistito. */
  private lineVatRate(line: StoreSaleDocumentLine): number {
    const vatCode = line.vatCodeId ? this.vatCodeById().get(line.vatCodeId) : undefined;
    return vatCode ? vatCode.ratePercent : (line.vatRatePercent ?? 0);
  }

  private lineVatInput(line: StoreSaleDocumentLine): VatComputationInput {
    const vatCode = line.vatCodeId ? this.vatCodeById().get(line.vatCodeId) : undefined;
    return vatCode ? vatInputFromVatCode(vatCode) : vatInputFromLegacyRate(line.vatRatePercent);
  }

  // ── Totali di riga ───────────────────────────────────────────────────────
  //
  // Stessa aritmetica del server: una formula sola, in `domain/`. Il piede —
  // imponibile, imposta, totale, sconto extra — è del passo seguente.

  private lineAmounts(line: StoreSaleDocumentLine): VatLineAmounts {
    return computeVatLineAmounts({
      // Il valore memorizzato è il netto, in ogni modalità: `vat_excluded`
      // dichiara che cosa gli si passa, non come l'operatore lo digita.
      enteredUnitCostMinor: line.unitPriceMinor,
      costEntryMode: 'vat_excluded',
      quantity: line.quantity,
      discountPercent: line.discountPercent,
      vat: this.lineVatInput(line),
    });
  }

  protected lineTotal(line: StoreSaleDocumentLine): string {
    const amounts = this.lineAmounts(line);
    const shown = this.pricesIncludeVat() ? amounts.lineGrossMinor : amounts.lineNetMinor;
    return formatMoney({ amountMinor: shown, currencyCode: DEFAULT_CURRENCY });
  }

  // ── Quantità, sconto, descrizione, IVA ───────────────────────────────────

  protected onQuantityInput(line: StoreSaleDocumentLine, raw: string): void {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 1) {
      return;
    }
    this.patchLine(line.uiId, { quantity: value });
  }

  /** Stepper: al banco la quantità si tocca più spesso di quanto si digiti. */
  protected stepQuantity(line: StoreSaleDocumentLine, delta: number): void {
    this.patchLine(line.uiId, { quantity: Math.max(1, line.quantity + delta) });
  }

  protected onDiscountInput(line: StoreSaleDocumentLine, raw: string): void {
    this.patchLine(line.uiId, { discountPercent: parseEffectiveDiscountPercent(raw) });
  }

  protected onDescriptionChange(line: StoreSaleDocumentLine, value: string): void {
    this.patchLine(line.uiId, { description: value });
  }

  protected onVatChange(line: StoreSaleDocumentLine, vatCodeId: string): void {
    this.patchLine(line.uiId, { vatCodeId: vatCodeId || null });
  }

  // ── Effetto fisico della riga ────────────────────────────────────────────
  //
  // ⭐ **Un concetto solo**, `loadsStock`, governato dal modo: la Vendita lo
  // legge come «Scarica giacenze», il Reso come «Carica giacenze». Due booleani
  // o due modelli paralleli direbbero la stessa cosa due volte, e col tempo
  // divergerebbero.
  //
  // ⛔ Non è una colonna configurabile: governa l'effetto fisico, quindi non
  // deve poter sparire dal selettore Colonne.

  protected readonly stockToggleLabel = computed(() =>
    this.descriptor.mode === 'sale' ? 'Scarica giacenze' : 'Carica giacenze',
  );

  protected onStockToggle(line: StoreSaleDocumentLine, checked: boolean): void {
    this.patchLine(line.uiId, { loadsStock: checked });
  }

  // ── Disponibilità: avviso, mai blocco ────────────────────────────────────
  //
  // `11` A18: la vendita oltre la disponibilità è consentita, l'avviso è visibile
  // e non bloccante, e Giacenza/Disponibile possono andare negative.

  protected lineExceedsAvailability(line: StoreSaleDocumentLine): boolean {
    return this.descriptor.mode === 'sale' && line.quantity > line.available;
  }

  protected readonly availabilityWarningCount = computed(
    () => this.lines().filter((line) => this.lineExceedsAvailability(line)).length,
  );

  protected availabilityHint(line: StoreSaleDocumentLine): string {
    return (
      `Quantità superiore alla disponibilità. Giacenza ${line.onHand}, ` +
      `impegnata ${line.committed}, disponibile ${line.available}. Si può concludere comunque.`
    );
  }

  // ── Salvataggio ─────────────────────────────────────────────────────────

  protected readonly savePending = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected dismissSaveError(): void {
    this.saveError.set(null);
  }

  /** L'esito dell'ultimo salvataggio riuscito: numero assegnato e righe. */
  readonly lastResult = signal<StoreSaleResult | null>(null);

  /**
   * Salva il documento: **crea** se non c'è un id in rotta, **risalva lo stesso**
   * se c'è (T1/T2). Un solo percorso client, due contratti sotto — è la
   * modalità a scegliere l'endpoint, non due maschere.
   *
   * ⚠️ **Pubblico e senza chiamante in questa fase**: l'azione che lo invoca —
   * «Concludi vendita» / «Concludi reso» — vive nel piede, e arriva con quello.
   * Che cosa succede DOPO una conclusione riuscita (documento pronto per il
   * prossimo cliente, o si resta su quello appena chiuso) è una decisione dello
   * stesso blocco: qui l'esito si registra e basta.
   */
  save(): void {
    const locationId = this.form.controls.locationId.value;
    if (!locationId || this.savePending()) {
      return;
    }
    this.savePending.set(true);
    this.saveError.set(null);
    const richiesta$ =
      this.descriptor.mode === 'sale'
        ? this.service.createSale(this.salePayload(locationId))
        : this.service.createReturn(this.returnPayload(locationId));

    richiesta$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.savePending.set(false);
        this.lastResult.set(result);
        this.alreadyCreatedDocumentId.set(null);
        // Successo CERTO: l'intento si chiude qui. Il documento dopo è
        // un'altra compilazione, e deve poter essere identico a questo.
        this._creationIntentId.set(null);
      },
      error: (err: unknown) => {
        this.savePending.set(false);
        this.saveError.set(errorMessage(err));
        this.alreadyCreatedDocumentId.set(creationIntentErrorOf(err)?.resultRef ?? null);
        this.rotateCreationIntentIfCertain(err);
      },
    });
  }

  private salePayload(locationId: EntityId): CreateStoreSalePayload {
    const testata = this.preserved();
    return {
      // T1/T2: id assente = crea; presente = risalva LO STESSO documento.
      id: this.editDocumentId() ?? undefined,
      creationIntentId: this.creationIntentForSave(),
      locationId,
      // ⛔ Nessun pagamento (`11` A8): la gestione è differita al blocco
      // Pagamenti/Tesoreria, e l'assenza dice al server «non modificato» —
      // quindi un documento storico non perde il proprio.
      customerId: this.form.controls.customerId.value || undefined,
      documentDate: this.documentDatePayload(),
      pricesIncludeVat: this.pricesIncludeVat(),
      notes: testata.notes.trim() || undefined,
      lines: this.lines().map(storeSaleLinePayload),
    };
  }

  private returnPayload(locationId: EntityId): CreateStoreReturnPayload {
    const testata = this.preserved();
    return {
      id: this.editDocumentId() ?? undefined,
      creationIntentId: this.creationIntentForSave(),
      locationId,
      // Il campo è `causale` — `reason` è il nome storico, e non si manda:
      // il server preferisce comunque il primo.
      causale: testata.causale.trim() || undefined,
      // Facoltativo su entrambi i modi (`11` A13).
      customerId: this.form.controls.customerId.value || undefined,
      documentDate: this.documentDatePayload(),
      pricesIncludeVat: this.pricesIncludeVat(),
      notes: testata.notes.trim() || undefined,
      lines: this.lines().map(storeReturnLinePayload),
    };
  }

  /**
   * La data viaggia **sempre**, anche in modifica: è modificabile su un
   * documento già concluso, e il server la persiste senza rinumerare
   * (decisione del proprietario, 21/08/2026).
   *
   * ⛔ Qui c'era `if (isEditMode()) return undefined`, scritto quando il server
   * la ignorava in update: era una regola di interfaccia costruita sopra un
   * difetto del server, e ha nascosto il difetto invece di dichiararlo.
   */
  private documentDatePayload(): string | undefined {
    const raw = this.form.controls.documentDate.value;
    return raw ? new Date(raw).toISOString() : undefined;
  }

  /**
   * Riempie la maschera da un documento salvato.
   *
   * ⛔ I valori si prendono dal **documento**, non dall'anagrafica: è la regola
   * «la riga di un documento è una fotografia». Le righe conservano l'id del
   * server, che è ciò che fa aggiornare il movimento collegato invece di
   * riscriverlo.
   */
  private patchFromDocument(doc: DocumentRecord): void {
    this.form.controls.locationId.setValue(doc.locationId ?? '');
    this.form.controls.customerId.setValue(doc.customerId ?? '');
    // La data si carica e **resta modificabile**: una data sbagliata si
    // corregge dove è stata scritta, e il server la persiste senza rinumerare.
    this.form.controls.documentDate.setValue(doc.documentDate.slice(0, 10));
    this.pricesIncludeVat.set(doc.pricesIncludeVat);
    this.preserved.set({
      notes: doc.notes ?? '',
      causale: doc.causalText ?? '',
    });
    this.lines.set((doc.lines ?? []).map(storeSaleLineFromDocumentLine));
  }
}

/** Data ISO in forma italiana per il riepilogo del pannello mobile. */
function formatIsoDate(iso: string): string {
  const [anno, mese, giorno] = iso.split('-');
  return giorno && mese && anno ? `${giorno}/${mese}/${anno}` : iso;
}

function errorMessage(err: unknown): string {
  if (isAppError(err)) {
    return err.message;
  }
  return 'Operazione non riuscita. Riprova.';
}
