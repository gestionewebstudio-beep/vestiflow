import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  take,
  type Observable,
} from 'rxjs';

import { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import {
  creationIntentErrorOf,
  creationIntentStillHeld,
} from '@core/models/creation-intent-error.util';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { parseEffectiveDiscountPercent } from '@core/utils/discount-percent.util';
import { nuovoId } from '@core/utils/uuid.util';
import { BarcodeDetectionService } from '@core/services/barcode-detection.service';
import { ViewportService } from '@core/services/viewport.service';
import { VatCodeService } from '@core/services/vat-code.service';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
} from '@core/utils/money.util';
import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { canManageCatalog } from '@core/permissions/tenant-permissions.util';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentActionsComponent } from '@domain/documents/components/document-actions/document-actions.component';
import { DocumentPageStateComponent } from '@domain/documents/components/document-page-state/document-page-state.component';
import { DocumentHeaderComponent } from '@domain/documents/components/document-header/document-header.component';
import { DocumentHeaderFieldComponent } from '@domain/documents/components/document-header/document-header-field.component';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { priceModeRowLabel } from '@domain/documents/models/document-price-mode.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentLineCardBodyComponent } from '@domain/documents/components/document-line-card/document-line-card-body.component';
import { documentLineIsEmpty } from '@domain/documents/state/document-line-removal.store';
import { DocumentTotalsComponent } from '@domain/documents/components/document-totals/document-totals.component';
import type { DocumentTotalRow } from '@domain/documents/components/document-totals/document-totals.model';
import { DocumentLineCardStripComponent } from '@domain/documents/components/document-line-card/document-line-card-strip.component';
import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { documentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineHeadComponent } from '@domain/documents/components/document-line-head/document-line-head.component';
import { DocumentLineQuickRowComponent } from '@domain/documents/components/document-line-quick-row/document-line-quick-row.component';
import { DocumentLineRowComponent } from '@domain/documents/components/document-line-row/document-line-row.component';
import {
  DOCUMENT_LINE_ROW_VIEW_VUOTA,
  NESSUN_SUGGERIMENTO,
} from '@domain/documents/components/document-line-row/document-line-row.model';
import type { DocumentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import type {
  DocumentLineColumnId,
  DocumentLineRowView,
} from '@domain/documents/components/document-line-row/document-line-row.model';
import { DocumentScanOverlayComponent } from '@domain/documents/components/document-scan-overlay/document-scan-overlay.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentLineCardOpenStore } from '@domain/documents/state/document-line-card-open.store';
import { DocumentLineSearchPanelStore } from '@domain/documents/state/document-line-search-panel.store';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { vatOptionsIncludingSelected } from '@domain/documents/utils/document-vat-options.util';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
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
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductFormComponent } from '@domain/products/product-form.component';
import type { ProductEmbeddedCreatePrefill } from '@domain/products/models/product-form.mapper';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { ProductService } from '@domain/products/services/product.service';
import { DocumentLineArticleService } from '@domain/documents/services/document-line-article.service';
import {
  campiEffettivi,
  PROFILI_RIGA_DOCUMENTO,
} from '@domain/documents/models/document-line-article.model';
import type {
  ContestoRichiamoArticolo,
  PolicyRichiamoArticolo,
} from '@domain/documents/models/document-line-article.model';
import { availabilityHintText } from '@domain/products/utils/variant-availability.util';
import { createQuickAddProduct } from '@domain/products/utils/quick-add-product.util';
import {
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
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { createLineColumnWidths } from '@shared/table-columns/line-column-widths.store';
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
  /**
   * Sconto extra del documento, **conservato senza essere esposto**.
   *
   * ⛔ Il controllo non c'è (`11` A16): lo Sconto extra è percentuale **e**
   * importo, l'importo non esiste ancora nel contratto comune e le sue regole
   * di calcolo sono un lavoro trasversale aperto (D1). Esporre intanto la sola
   * percentuale consoliderebbe una forma che sappiamo incompleta.
   *
   * ⚠️ **Ma un valore già persistito non si perde e non si ignora**: si carica,
   * entra nei totali mostrati e resta sul documento. Oggi nessun documento di
   * banco ne ha uno — misurato il 21/08: 46 documenti, zero — e il campo non
   * esiste in nessuno strato del banco; questa conservazione è la rete perché
   * resti vero anche il giorno in cui D1 chiuderà.
   */
  readonly documentDiscountPercent: number;
  readonly notes: string;
  readonly causale: string;
}

const PRESERVED_HEADER_VUOTA: PreservedHeader = {
  documentDiscountPercent: 0,
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
 * ⭐ **Dal 21/08/2026 è la maschera montata sulle quattro rotte del banco**, e
 * la vecchia `StoreSaleRegisterComponent` — il carrello — non esiste più: il
 * cutover è avvenuto quando la maschera aveva tutto ciò che serviva a
 * sostituirla, non quando l'ordine dei passi lo consentiva.
 *
 * **Che cosa c'è:**
 *
 * ```text
 * modo dalla ROTTA · descrittore · UN modello di riga · UNA collezione
 * testata: sede · cliente (facoltativo, entrambi i modi) · data · numero e serie
 * righe: celle comuni, colonne del banco, spunta di magazzino, netto/ivato
 * porta: ricerca, scansione, EAN ripetuto che incrementa, fotocamera continua
 * piede: totali, note, causale del Reso, «Concludi», guardia di uscita
 * caricamento per id, salvataggio create/update, intento di creazione (T15)
 * ```
 *
 * **Che cosa NON c'è ancora**, e va saputo:
 *
 * | manca                               | arriva con                       |
 * | ----------------------------------- | -------------------------------- |
 * | sconto extra del documento          | D1, il contratto comune          |
 * | pagamento, e il rimborso del Reso   | il blocco Pagamenti/Tesoreria    |
 * | eliminazione del documento concluso | il passo 14 (i tre cancelli)     |
 * | battuta HID riconosciuta            | il blocco scanner (misura M1/M2) |
 */
@Component({
  selector: 'app-store-sale-document-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentHeaderComponent,
    DocumentHeaderFieldComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentProductSearchPanelComponent,
    DocumentLineCardComponent,
    DocumentTotalsComponent,
    DocumentLineCardStripComponent,
    DocumentLineCardBodyComponent,
    DocumentLineHeadComponent,
    DocumentLineQuickRowComponent,
    DocumentLineRowComponent,
    DocumentScanOverlayComponent,
    EmptyStateComponent,
    InlineBannerComponent,
    ProductFormComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableColumnPickerComponent,
    DocumentActionsComponent,
    DocumentPageStateComponent,
  ],
  templateUrl: './store-sale-document-form.component.html',
  styleUrl: './store-sale-document-form.component.scss',
})
export class StoreSaleDocumentFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(StoreSalesService);
  private readonly documents = inject(DocumentService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);

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

  protected readonly loadState = toSignal(
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
    /** Numero e serie: contratto comune, vedi `numbering`. */
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    /**
     * Le righe, in un `FormArray` **come nelle altre sei maschere**.
     *
     * ⛔ Qui c'era una collezione di signal, ed è il difetto che ha prodotto
     * la riga parallela: la riga condivisa lega i suoi controlli con
     * `formControlName`, e senza un gruppo per riga il banco non poteva
     * usarla. Il modello `StoreSaleDocumentLine` resta, ma come VISTA
     * derivata (`lineModel`), non come seconda fonte.
     */
    // ⭐ **Una riga vuota all'apertura, come sulle altre sei maschere**
    //    (24/08/2026). Qui c'era `([])`, motivato nel template con «(A14)» — ma
    //    A14 parla della RICERCA («la query digitata non è una riga»), non della
    //    riga seminata. A15, più recente, dice l'opposto: Ordine cliente,
    //    Vendita e Reso al banco usano la STESSA riga condivisa «con gli stessi
    //    comportamenti per tutti i campi comuni».
    //
    // ⛔ **La riga seminata NON è contenuto**: `righeCompilate()` la esclude da
    //    payload, «si può concludere?» e «c'è lavoro non salvato?». Senza quel
    //    filtro finirebbe una riga fantasma in ogni vendita.
    lines: this.fb.array([this.createLine()]),
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
  protected readonly preserved = signal<PreservedHeader>(PRESERVED_HEADER_VUOTA);

  /**
   * Il gruppo di UNA riga: gli stessi controlli che la riga condivisa lega
   * (`productName`, `quantity`, `unitPrice`, `discount`, `commitsStock`) più
   * quelli che il banco porta con sé.
   *
   * ⚠️ `unitPrice` e `discount` sono **testo**, come su ogni altra maschera:
   * il prezzo digitato può essere netto o ivato, e il valore canonico si
   * ricava quando serve — non si tiene una seconda copia in centesimi.
   */
  private createLine() {
    return this.fb.group({
      serverLineId: this.fb.control<string | null>(null),
      variantId: this.fb.control(''),
      sku: this.fb.control(''),
      productName: this.fb.control(''),
      /**
       * L'etichetta della VARIANTE: «M / Rosso».
       *
       * ⭐ Colonna sua, e qui serviva più che altrove: il banco scriveva
       * `productName ← summary.title` — il display COMPLETO — quindi la
       * variante viveva dentro il nome. Il server ha smesso di concatenarla il
       * 24/08, e senza questo campo la vendita al banco sarebbe diventata
       * l'unico documento che non dice quale taglia è uscita.
       */
      variantLabel: this.fb.control(''),
      /** La descrizione COM'ERA sul documento: la riga è una fotografia. */
      persistedDescription: this.fb.control<string | null>(null),
      // ⭐ EAN: dato dell'ANAGRAFICA, non del documento — `DocumentLine` non lo
      // persiste. Si legge dalla variante corrente come la disponibilità, e per
      // questo si aggiorna anche sulle righe già salvate: la regola della
      // fotografia (`regole-gestionale`) governa ciò che il documento CONSERVA,
      // e questo il documento non lo conserva.
      barcode: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitPrice: this.fb.control(''),
      discount: this.fb.control(''),
      vatCodeId: this.fb.control<string | null>(null),
      /** Il Codice IVA com'era: contratto binario verso il server. */
      persistedVatCodeId: this.fb.control<string | null>(null),
      vatRatePercent: this.fb.control<number | null>(null),
      /** La spunta di magazzino: `loadsStock` verso il server. */
      commitsStock: this.fb.control(true),
      onHand: this.fb.control(0),
      committed: this.fb.control(0),
      available: this.fb.control(0),
    });
  }

  // ── La riga è la COMPONENTE COMUNE (`11` A15) ───────────────────────────
  //
  // ⛔ Il banco NON ha una riga propria. Mostra meno colonne — niente codice
  // articolo, EAN, unità di misura, disponibilità, costo, prezzo scontato,
  // seriali — e aggiunge la sola cosa che è sua: la spunta Scarica/Carica
  // giacenze, che governa l'effetto fisico e per questo non è configurabile.

  /**
   * ⚠️ Legata una volta sola: una funzione anonima nel template cambierebbe
   * identità a ogni giro, e la riga si riterrebbe sempre nuova.
   */
  // ⛔ **Qui c'era un forcing**: `commitsStock` e `actions` tornavano `true`
  // senza passare dal catalogo, «perché non passano dal selettore Colonne».
  // Il risultato era una testata da dodici colonne su un catalogo da nove, con
  // le quote a 116,84% — vedi il commento nel catalogo del banco. Ora le due
  // colonne sono dichiarate, e questa funzione fa quello che fa nelle altre sei
  // maschere: delega.
  protected readonly isLineColumnVisibleFn = (column: DocumentLineColumnId): boolean =>
    this.isLineColumnVisible(column);

  protected readonly lineColumnWidthFn = (column: DocumentLineColumnId): string =>
    this.lineColumnWidth(column);

  protected readonly lineColumnMinWidthFn = (column: DocumentLineColumnId): number =>
    this.lineColumnMinWidth(column);

  /** L'aiuto della colonna spunta: dice che cosa succede alla conclusione. */
  protected readonly stockToggleTooltip = computed(() =>
    this.descriptor.mode === 'sale'
      ? 'Alla conclusione la riga scarica la giacenza della sede.'
      : 'Alla conclusione la riga carica la giacenza della sede.',
  );

  /** Ciò che la riga MOSTRA e non calcola. */
  protected lineRowView(index: number): DocumentLineRowView {
    const line = this.lineModel(index);
    const supera = this.lineExceedsAvailability(line);
    return {
      ...DOCUMENT_LINE_ROW_VIEW_VUOTA,
      complete: true,
      linked: true,
      // ⭐ La disponibilità non è una COLONNA del banco — il catalogo non la
      // dichiara e la tabella non la mostra — ma è una delle tre voci che la
      // card comune tiene leggibili a riga CHIUSA. Al banco «Disp. 3» accanto
      // allo SKU è quello che si guarda prima di battere il capo, ed è ciò che
      // la card locale mostrava: senza, la migrazione lo perderebbe.
      stockAvailable: String(line.available),
      quantityInvalid: this.form.controls.lines.at(index).controls.quantity.invalid,
      exceedsAvailability: supera,
      availabilityHint: supera ? this.availabilityHint(line) : null,
      lineTotal: this.lineTotal(line),
      vatOptions: this.vatOptions(line),
      vatValue: line.vatCodeId ?? '',
      articleCodeSuggest: NESSUN_SUGGERIMENTO,
      skuSuggest: NESSUN_SUGGERIMENTO,
      barcodeSuggest: NESSUN_SUGGERIMENTO,
      productSuggest: NESSUN_SUGGERIMENTO,
    };
  }

  /** Il gruppo della riga: i controlli restano quelli di questo form. */
  protected lineGroup(index: number): FormGroup {
    return this.form.controls.lines.at(index);
  }

  /**
   * Quello che la testata della card mostra: il calcolo è COMUNE.
   *
   * ⛔ Qui il banco lo faceva a modo suo, dentro l'involucro locale: titolo,
   * variante e voci meta erano tre decisioni prese in una feature. Sono le
   * stesse tre di ogni documento, e ora le prende `documentLineCardHead`.
   */
  protected lineCardHead(index: number): DocumentLineCardHead {
    return documentLineCardHead(this.lineRowView(index), this.lineGroup(index));
  }

  /** Le righe: il `FormArray` è la FONTE, e non ce n'è una seconda. */
  protected get lineControls() {
    return this.form.controls.lines;
  }

  /** Il documento non ha ancora righe: lo stato vuoto lo dice. */
  protected readonly hasLines = computed(() => {
    this.formValue();
    return this.form.controls.lines.length > 0;
  });

  /**
   * La riga come MODELLO: totali, avvisi, card e payload continuano a
   * lavorare su `StoreSaleDocumentLine`, che ora è una **vista derivata** del
   * gruppo invece di una collezione parallela.
   */
  protected lineModel(index: number): StoreSaleDocumentLine {
    const controls = this.form.controls.lines.at(index).controls;
    const rate = this.rateOf(controls.vatCodeId.value, controls.vatRatePercent.value);
    return {
      uiId: String(index),
      serverLineId: controls.serverLineId.value,
      variantId: controls.variantId.value,
      sku: controls.sku.value,
      description: controls.productName.value,
      variantLabel: controls.variantLabel.value,
      persistedDescription: controls.persistedDescription.value,
      quantity: controls.quantity.value,
      unitPriceMinor: this.netMinorOf(index, rate),
      discountPercent: parseEffectiveDiscountPercent(controls.discount.value),
      vatCodeId: controls.vatCodeId.value,
      persistedVatCodeId: controls.persistedVatCodeId.value,
      vatRatePercent: controls.vatRatePercent.value,
      loadsStock: controls.commitsStock.value,
      onHand: controls.onHand.value,
      committed: controls.committed.value,
      available: controls.available.value,
    };
  }

  /** Tutte le righe come modello: lo usano totali e avvisi. */
  protected lines(): readonly StoreSaleDocumentLine[] {
    this.formValue();
    return this.form.controls.lines.controls.map((_, index) => this.lineModel(index));
  }

  /**
   * **Le righe che hanno davvero qualcosa dentro.** La riga seminata
   * all'apertura, e ogni riga rimasta vuota, non ne fanno parte.
   *
   * ⛔ **Il predicato è quello COMUNE** (`documentLineIsEmpty`), non una copia
   * locale: «riga vuota» significa la stessa cosa su ogni maschera, e due
   * definizioni divergerebbero al primo campo aggiunto. Vale anche la sua
   * scelta più delicata — **la quantità non conta come contenuto**: una riga
   * nasce con 1, e contarla renderebbe ogni riga non-vuota.
   *
   * ⚠️ Lo usano il payload, «si può concludere?» e «c'è lavoro non salvato?»:
   * i tre punti in cui una riga tecnica diventerebbe un fatto.
   */
  protected righeCompilate(): readonly StoreSaleDocumentLine[] {
    this.formValue();
    return this.form.controls.lines.controls
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => !documentLineIsEmpty(group))
      .map(({ index }) => this.lineModel(index));
  }

  /**
   * Aggiunge una riga vuota, come su ogni altra maschera documentale.
   *
   * ⭐ È il **secondo modo di acquisizione**, distinto dalla ricerca: lo
   * scanner e la ricerca rapida, trovando la stessa variante, **incrementano**
   * la riga che c'è; «Aggiungi riga» ne apre una **nuova** anche se poi ci si
   * mette lo stesso articolo. Senza, al banco mancava proprio quel modo.
   */
  protected addLine(): void {
    this.form.controls.lines.push(this.createLine());
    this.form.controls.lines.markAsDirty();
    this.cardsRevealed.set(true);
  }

  /**
   * Dove entra una riga ACQUISITA: prima delle righe vuote in coda, così quella
   * in cui si digita resta l'ultima. È il criterio dell'Ordine cliente.
   */
  private indiceDiInserimento(): number {
    const righe = this.form.controls.lines;
    let posizione = righe.length;
    while (posizione > 0 && documentLineIsEmpty(righe.at(posizione - 1))) {
      posizione -= 1;
    }
    return posizione;
  }

  /**
   * Mobile: la riga tecnica vuota non si mostra come card.
   *
   * ⚠️ **Una card «Riga senza prodotto» con Qtà 1 e totale 0 fa credere che ci
   * sia già qualcosa**, e non è compilabile finché non le si dà un articolo. È
   * la stessa scelta dell'Ordine cliente, che qui è il riferimento: su
   * scrivania la riga vuota è la cella in cui si digita, su telefono non c'è
   * niente da digitare finché l'articolo non arriva.
   */
  private readonly cardsRevealed = signal(false);

  protected readonly cardsVisible = computed(() => {
    this.formValue();
    if (this.cardsRevealed()) {
      return true;
    }
    const righe = this.form.controls.lines.controls;
    return righe.length > 1 || (righe.length === 1 && !documentLineIsEmpty(righe[0]!));
  });

  protected removeLine(index: number): void {
    this.form.controls.lines.removeAt(index);
    this.form.controls.lines.markAsDirty();
  }

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.actionLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /**
   * La sede **precompila col contratto comune** (`11` A13): la stessa regola di
   * ogni altra maschera documentale, che vive in `domain/`.
   *
   * ⛔ Qui c'era una precompilazione propria del banco — sede preferita del
   * contesto, poi l'unica disponibile. Era una regola locale dove ne esisteva
   * già una comune, ed è il tipo di divergenza che il rifacimento sta togliendo.
   *
   * ⛔ **In modifica non tocca niente**: vince la sede persistita sul documento.
   */
  private readonly prefillLocation = prefillDefaultLocation({
    control: this.form.controls.locationId,
    isEdit: () => this.isEditMode(),
    write: (apply) => apply(),
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
   * Il cambio di sede è **esplicito**, e resta del DOCUMENTO.
   *
   * ⛔ Non riscrive più il contesto attivo dell'applicazione: quello appartiene
   * al selettore della topbar, e nessun'altra maschera documentale lo tocca
   * cambiando la sede di un documento. Scrivendolo, un override fatto per una
   * vendita si sarebbe trascinato in tutto ciò che legge il contesto — e nella
   * vendita successiva.
   *
   * L'autorizzazione la verifica il server su entrambe le sedi, quella del
   * documento e quella richiesta (T6).
   */
  protected onLocationChange(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsDirty();
  }

  protected onCustomerChange(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsDirty();
  }

  // ── Numero e serie: il contratto comune (T8B) ───────────────────────────
  //
  // ⛔ **Nessuna numerazione del banco.** `DocumentNumberingStore` è lo stesso
  // delle altre sette maschere, e con lui arrivano proposta, scelta della
  // serie, «Senza serie», numero imposto e conflitto — compreso il giro dei
  // contatori, che da oggi vive nello store invece che copiato qui (E-6/E-7).
  //
  // ⭐ **Vale anche in MODIFICA** (correzione del proprietario, 21/08/2026):
  // numero e serie restano modificabili come su ogni altro documento. Il
  // server li scriveva solo alla nascita — era un gap tecnico, riallineato al
  // contratto comune e non trasformato in requisito.

  private readonly countersService = inject(DocumentCountersService);
  private readonly authService = inject(AuthService);

  /**
   * «L'operatore ha toccato il numero?», in forma REATTIVA: gli eventi del
   * controllo includono `PristineChangeEvent`, quindi il signal si aggiorna
   * anche su `markAsDirty()` — cosa che `valueChanges` non fa.
   */
  private readonly documentNumberPristine = toSignal(
    this.form.controls.documentNumber.events.pipe(
      map(() => this.form.controls.documentNumber.pristine),
    ),
    { initialValue: true },
  );

  /**
   * ⚠️ Niente `asProgrammatic`: qui la guardia di uscita guarda le RIGHE
   * (`hasPendingWork`), non lo stato del form, quindi scrivere la proposta
   * non accende niente da sopprimere.
   */
  protected readonly numbering = new DocumentNumberingStore({
    isEdit: () => this.isEditMode(),
    number: () => this.form.controls.documentNumber.value,
    setNumber: (value) => this.form.controls.documentNumber.setValue(value),
    series: () => this.form.controls.series.value,
    setSeries: (value) => this.form.controls.series.setValue(value),
    numberIsDirty: () => !this.documentNumberPristine(),
    markNumberDirty: () => this.form.controls.documentNumber.markAsDirty(),
    markNumberPristine: () => this.form.controls.documentNumber.markAsPristine(),
    countersSource: {
      service: this.countersService,
      destroyRef: this.destroyRef,
      documentType: () => this.descriptor.documentType,
      locationId: () => this.form.controls.locationId.value || null,
      // ⛔ La data serve: il numero proposto è il primo libero DOPO i
      // documenti di data anteriore, e senza il server calcola su oggi.
      documentDate: () => this.form.controls.documentDate.value,
    },
  });

  /** Reattivo per costruzione: `isProposal()` legge il signal degli eventi. */
  protected readonly numberIsProposal = computed(() => this.numbering.isProposal());

  /** Senza il permesso resta il campo: niente ingranaggio, niente pannello. */
  protected readonly canManageSeries = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );

  protected readonly seriesDialogOpen = signal(false);

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA
   * riproporre serie e numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    this.numbering.reloadCounters();
  }

  /** L'avviso «numero già assegnato»: lo stato è quello comune. */
  protected readonly numberConflictDialog = new DocumentNumberConflictStore();

  /** Aperto/chiuso e messaggio: il template li lega allo store comune. */
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
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
    /*
      ⛔ **Qui c'era `crypto.randomUUID()`, e da un'origine di rete LANCIA.**

      Misurato in Chrome il 01/09/2026 sulla build di questa applicazione:
      `http://192.168.1.50:4212` non è contesto sicuro, e lì `randomUUID` è
      `undefined`. È il gestionale aperto dal telefono in magazzino.

      ⚠️ **E lancia nel punto peggiore**: dentro `save()`, PRIMA che la
      richiesta parta, quindi nessun `error:` la raccoglie e nessun avviso
      compare. A chi premeva «Concludi vendita» sembrava soltanto che non
      succedesse niente — che è la segnalazione del 30/08 (`DA-FARE` §1).
    */
    const nuovo = nuovoId();
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
  private readonly lineArticles = inject(DocumentLineArticleService);
  private readonly quickRow = viewChild<DocumentLineQuickRowComponent>('quickRow');

  protected readonly searchDraft = signal('');
  protected readonly searchPending = signal(false);
  /** Esito dell'ultima scansione non risolta: nessuna riga, solo il messaggio. */
  protected readonly searchMessage = signal<string | null>(null);

  /** Pannello di ricerca articolo: lo stato è quello comune (E-5). */
  protected readonly lineSearchPanel = new DocumentLineSearchPanelStore();

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
    if (lineIndex >= this.form.controls.lines.length) {
      return;
    }
    this.readVariant(variantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          if (!summary) {
            return;
          }
          this.applyVariantToLine(lineIndex, summary);
          this.form.controls.lines.markAsDirty();
        },
        // ⛔ Nessun dato parziale sulla riga: l’errore si dice, non si applica.
        error: (err: unknown) => this.searchMessage.set(errorMessage(err)),
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
    this.unresolvedCode.set(null);
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
    // Il codice resta a disposizione delle AZIONI esplicite («Cerca
    // articolo», «Crea prodotto»): non apre niente da sé — A14 vieta il
    // popup automatico, non la scelta dell'operatore.
    this.unresolvedCode.set(code);
    this.beep('errore');
    this.focusSearchInput(true);
  }

  /** L'ultimo codice che il catalogo non conosce, o `null`. */
  protected readonly unresolvedCode = signal<string | null>(null);

  /**
   * L'articolo entra nel documento.
   *
   * ⭐ **Stesso EAN due volte → la riga esistente cresce** (A14): al banco
   * passare due volte lo stesso capo sul lettore vuol dire due pezzi, non due
   * righe. È la regola del banco, e vale per la maschera — non la decide la
   * scansione.
   */
  private acquireVariant(variantId: string, quantity: number): void {
    const righe = this.form.controls.lines;
    const esistente = righe.controls.findIndex(
      (group) => group.controls.variantId.value === variantId,
    );
    if (esistente >= 0) {
      this.stepQuantity(esistente, Math.max(1, quantity));
      this.searchPending.set(false);
      this.afterAcquire();
      return;
    }
    this.readVariant(variantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.searchPending.set(false);
          if (!summary) {
            this.notFound(variantId);
            return;
          }
          const group = this.createLine();
          group.patchValue({ quantity: Math.max(1, quantity) });
          // ⭐ **Prima delle righe vuote in coda**, come sull'Ordine cliente: la
          //    riga in cui si digita resta l'ultima. Accodando e basta, dopo ogni
          //    scansione resterebbe una riga vuota INCASTRATA sopra l'articolo.
          const posizione = this.indiceDiInserimento();
          righe.insert(posizione, group);
          this.applyVariantToLine(posizione, summary);
          righe.markAsDirty();
          this.afterAcquire();
        },
        // ⛔ Un 403 non è «articolo non trovato»: si dice, e non si crea la riga.
        error: (err: unknown) => {
          this.searchPending.set(false);
          this.searchMessage.set(errorMessage(err));
        },
      });
  }

  /**
   * I valori che una riga prende dall'anagrafica.
   *
   * ⚠️ Su una riga GIÀ SALVATA descrizione, prezzo, IVA e spunta restano quelli
   * del documento, perché la riga è una fotografia: si aggiorna ciò che segue
   * l'articolo (identità, disponibilità), non ciò che l'operatore ha scritto.
   */
  private applyVariantToLine(index: number, summary: VariantSummary): void {
    const controls = this.form.controls.lines.at(index).controls;
    const salvata = controls.serverLineId.value !== null;
    const onHand = summary.stockOnHand ?? 0;
    const available = summary.stockAvailable ?? 0;

    controls.variantId.setValue(summary.variantId);
    controls.onHand.setValue(onHand);
    controls.committed.setValue(Math.max(0, onHand - available));
    controls.available.setValue(available);
    // ⛔ Sopra il `return`: è un dato letto adesso, non una fotografia. Sotto,
    // una riga riaperta mostrerebbe la colonna EAN vuota.
    controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
    if (salvata) {
      return;
    }
    // ⭐ Il richiamo articolo passa dal RISOLUTORE COMUNE (`03c`). Il banco è
    // l'ultima delle sette maschere, e per una ragione che qui si vede: il
    // difetto del client si nascondeva dietro un difetto del server IDENTICO,
    // quindi correggerne uno solo non faceva cambiare colore a nessun test.
    // Il server ha smesso di concatenare nome e variante il 24/08 — questo è
    // il lato client dello stesso gesto.
    const esito = this.lineArticles.resolveWithSummary({
      articolo: summary,
      policy: this.policyRichiamo(),
      contesto: this.contestoRichiamo(),
      riga: {
        // Qui non c'è sostituzione d'articolo: una riga già agganciata esce
        // sopra, al `return` di `salvata`. Chi arriva qui è una riga nuova.
        variantIdPrecedente: null,
        rigaPersistita: false,
        scontoCorrente: controls.discount.value,
      },
    });
    if (esito.esito !== 'risolto') {
      return;
    }
    const valori = esito.valori;
    const scrivi = (controllo: { setValue(v: string): void }, valore: string | undefined): void => {
      // ⛔ Chiave ASSENTE significa «non toccare», mai «svuota».
      if (valore !== undefined) {
        controllo.setValue(valore);
      }
    };

    scrivi(controls.sku, valori.sku);
    // ⛔ Qui c'era `summary.title` — il display COMPLETO, che contiene la
    // variante — scritto direttamente, senza nemmeno il ripiego che le altre
    // maschere avevano. Il nome è il nome; la variante ha la sua colonna.
    scrivi(controls.productName, valori.nomeProdotto);
    scrivi(controls.variantLabel, valori.variantLabel);
    scrivi(controls.discount, valori.sconto);
    if (valori.codiceIva !== undefined) {
      controls.vatCodeId.setValue(valori.codiceIva);
    }
    // ⭐ Default della spunta, **deciso** il 21/08/2026 (`11` A15): un articolo
    // che gestisce il magazzino nasce con la spunta attiva, un servizio no. La
    // spunta esiste per l'eccezione, non per la regola.
    //
    // ⛔ Qui c'era `managesStock !== false`, che guarda un campo solo: su un
    // SERVIZIO `managesStock` non è `false` — è ASSENTE, e la spunta scattava
    // lo stesso. La regola completa vive nel risolutore.
    if (valori.gestisceMagazzino !== undefined) {
      controls.commitsStock.setValue(valori.gestisceMagazzino);
    }
    // Il prezzo si scrive col TESTO della modalità corrente: il netto è
    // canonico, ma il campo mostra ciò che l'operatore ha scelto di leggere.
    //
    // ⚠️ L'IVA si scrive PRIMA, e l'ordine è portante: `rateOf` legge il
    // Codice IVA appena assegnato per sapere con quale aliquota mostrarlo.
    const prezzo = valori.prezzoUnitarioNettoMinor ?? summary.sellingPrice.amountMinor;
    const rate = this.rateOf(controls.vatCodeId.value, null);
    controls.unitPrice.setValue(this.priceText(prezzo, rate));
    this.ricordaNetto(index, prezzo, rate);
  }
  /**
   * Le capacità del richiamo articolo al banco.
   *
   * ⛔ Il profilo è `vendita`, lo stesso dell'Ordine cliente e dei Documenti
   * vendita: **il banco non ha un profilo suo**, e non deve averlo. Mostra
   * meno colonne — niente codice articolo, unità di misura, costo — ma le
   * colonne che mostra si comportano come dappertutto. Ciò che è davvero suo è
   * la spunta Scarica/Carica e la regola di acquisizione, e nessuna delle due
   * passa dal risolutore.
   */
  private policyRichiamo(): PolicyRichiamoArticolo {
    return {
      famigliaIva: PROFILI_RIGA_DOCUMENTO.vendita.famigliaIva,
      campi: campiEffettivi('vendita', { shopifyAttivo: false, costiVisibili: false }),
    };
  }

  /**
   * Il contesto del richiamo.
   *
   * ⛔ **Nessun listino e nessuno sconto di controparte**: al banco non c'è un
   * cliente in testata da cui ereditarli — è il caso che il proprietario ha
   * descritto come «vendita al banco, nessun cliente». Il selettore listino
   * arriverà (`11`), e allora questa riga cambierà: fino ad allora vale il
   * prezzo d'articolo, che è ciò che la maschera fa oggi.
   */
  private contestoRichiamo(): ContestoRichiamoArticolo {
    return {
      listino: 'article',
      codiciIvaPerId: this.vatCodeById(),
      codiceIvaControparte: null,
      codiceIvaPredefinito: null,
      scontoControparte: null,
      codiceFornitoreDigitato: null,
      codiceFornitoreDiTestata: null,
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
        // ⛔ **`null` significa «nessun risultato», non «è andata male».**
        //
        // Qui c'era `catchError(() => of(null))`, e rendeva indistinguibili due
        // cose diverse: una risposta valida senza righe, e un errore dell’API.
        // Da quando `listVariantSummaries` verifica la sede (28/08/2026) quel
        // ramo può ricevere un **403**, e lo faceva sparire: la riga restava
        // senza dati di giacenza e l’operatore non sapeva perché.
        //
        // ⭐ L’errore ora risale, e i due chiamanti lo mostrano in
        // `searchMessage` — il contratto che questa maschera usa già.
        map((rows) => rows[0] ?? null),
      );
  }

  /** Dopo ogni inserimento riuscito: campo pulito e fuoco lì (A14, A19). */
  private afterAcquire(): void {
    this.searchDraft.set('');
    this.searchMessage.set(null);
    this.unresolvedCode.set(null);
    // ⭐ La conferma che si sente senza guardare (`11` C, «su mobile la battuta
    // continua viene prima della forma»): da telefono si spara un capo dopo
    // l'altro con una mano sola e lo sguardo sul cliente, e il beep è l'unico
    // segnale che arriva comunque.
    //
    // ⚠️ Solo in vista compatta: su desktop la riga che compare è già la
    // conferma, e un suono a ogni articolo diventerebbe rumore.
    if (this.compactView()) {
      this.beep('ok');
    }
    this.focusSearchInput();
  }

  private focusSearchInput(selectText = false): void {
    this.quickRow()?.focus(selectText);
  }

  // ── Fotocamera, e le azioni sul codice non trovato ──────────────────────
  //
  // ⭐ L'overlay è **comune** (`domain/documents`): riconosce un codice, mostra
  // la variante, conta i pezzi ed emette. Che cosa diventi la riga lo decide
  // questa maschera — al banco lo stesso EAN INCREMENTA (`11` A14), ed è già
  // la regola di `acquireVariant`.
  //
  // ⛔ Nessuna creazione automatica e nessun popup automatico: davanti a un
  // codice sconosciuto compaiono AZIONI, e non succede niente finché
  // l'operatore non ne sceglie una.

  private readonly config = inject(APP_CONFIG);
  private readonly auth = inject(AuthService);

  /**
   * ⛔ **Qui c'era `config.features.barcodeScanner`**, cioè la sola bandiera
   * d'ambiente: il pulsante «Scansiona» compariva anche su scrivania, dove la
   * fotocamera del portatile inquadra l'operatore e non il capo.
   *
   * ⚠️ Non spegne la scansione: il lettore HID scrive nel campo di ricerca come
   * una tastiera, e quel campo resta su entrambe le viste.
   */
  protected readonly barcodeScannerEnabled = inject(BarcodeDetectionService).cameraScanOffered;

  /**
   * Chi batte al banco non sempre può creare articoli: senza il permesso il
   * comando non compare, e al suo posto resta scritto a chi chiedere
   * l'articolo mancante — un pulsante che risponde «non autorizzato» lascia
   * la cassa ferma davanti al cliente senza dire cosa fare.
   */
  protected readonly puoGestireCatalogo = computed(() => canManageCatalog(this.auth.currentUser()));

  protected readonly scanOverlayOpen = signal(false);

  protected openScanOverlay(): void {
    if (this.headerGateActive()) {
      return;
    }
    this.scanOverlayOpen.set(true);
  }

  protected closeScanOverlay(): void {
    this.scanOverlayOpen.set(false);
    this.focusSearchInput();
  }

  /** Riga dalla scansione continua: stessa porta della pistola e della tastiera. */
  protected onScanLineAdded(event: {
    readonly variantId: string;
    readonly quantity: number;
  }): void {
    this.acquireVariant(event.variantId, event.quantity);
  }

  /**
   * Articolo dichiarato al volo davanti a un codice sconosciuto: il gesto vive
   * in `domain/` (`createQuickAddProduct`) — bozza, non sincronizzato — e qui
   * resta solo l'aggiunta della riga.
   */
  protected onScanQuickAdd(event: {
    readonly name: string;
    readonly priceText: string;
    readonly ean: string;
    readonly quantity: number;
  }): void {
    createQuickAddProduct(
      { productService: this.productService, barcodeLookup: this.barcodeLookup },
      {
        name: event.name,
        priceText: event.priceText,
        ean: event.ean,
        currency: DEFAULT_CURRENCY,
        locationId: this.form.controls.locationId.value || undefined,
      },
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId) => {
          if (variantId) {
            this.acquireVariant(variantId, event.quantity);
          }
        },
        error: (err: unknown) => this.searchMessage.set(errorMessage(err)),
      });
  }

  // ── Anagrafica prodotto al volo (pannello condiviso) ────────────────────

  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelPrefill = signal<ProductEmbeddedCreatePrefill | null>(null);

  /** Codice IVA vendite predefinito del tenant: prefill dell'articolo nuovo. */
  private readonly defaultSalesVatCodeId = computed(
    () =>
      this.vatCodes().find(
        (vatCode) => vatCode.isDefault && vatCode.isActive && isSalesVatCode(vatCode),
      )?.id ?? null,
  );

  /**
   * «Crea prodotto»: azione ESPLICITA dell'operatore, dall'overlay o dal
   * messaggio di codice non trovato. Il codice non risolto precompila il
   * barcode se è un barcode, il nome se era testo.
   */
  protected openProductCreate(code: string, kind: 'barcode' | 'text' = 'barcode'): void {
    if (!this.puoGestireCatalogo()) {
      return;
    }
    this.scanOverlayOpen.set(false);
    this.productPanelPrefill.set({
      name: kind === 'text' ? code : undefined,
      barcode: kind === 'barcode' ? code : undefined,
      defaultVatCodeId: this.defaultSalesVatCodeId(),
    });
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelPrefill.set(null);
    this.focusSearchInput();
  }

  /** Creato e da aggiungere: la riga nasce come da qualunque altra porta. */
  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    this.closeProductPanel();
    this.acquireVariant(event.variantId, 1);
  }

  /** «Salva senza aggiungere»: l'articolo esiste, il documento non lo prende. */
  protected onProductSavedWithoutAttach(): void {
    this.closeProductPanel();
  }
  /** Beep di esito: al banco si sente senza guardare, ed è la conferma. */
  private audioContext: AudioContext | null = null;

  private beep(esito: 'ok' | 'errore'): void {
    try {
      this.audioContext ??= new AudioContext();
      const context = this.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      // Due suoni distinti: acuto e breve = preso, grave = non trovato. Se
      // fossero uguali, il beep direbbe «è successo qualcosa» invece di dire
      // che cosa — e senza guardare non si potrebbe distinguerlo.
      oscillator.frequency.value = esito === 'ok' ? 880 : 220;
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

  /**
   * Quale vista è viva: tabella o card. È il **criterio responsive comune**, lo
   * stesso che usa l'Ordine cliente — nessuna soglia propria del banco.
   *
   * ⛔ Le due viste sono **alternative**, non entrambe nel DOM: rendere anche
   * quella che non si vede significherebbe controlli doppi, stato che si apre
   * dove nessuno guarda e ogni riga annunciata due volte.
   */
  private readonly viewport = inject(ViewportService);
  protected readonly compactView = this.viewport.compact;

  /**
   * Card aperta: una alla volta, e la memoria è quella COMUNE.
   *
   * ⛔ Qui c'era un `signal` proprio del banco. Non era sbagliato: era il
   * sesto uguale, uno per maschera. Lo stato è del DOCUMENTO — è lui a sapere
   * quante righe ha — quindi vive in `domain/`, non nella feature e tantomeno
   * dentro la card.
   */
  private readonly cardAperte = new DocumentLineCardOpenStore();

  protected isLineCardOpen(index: number): boolean {
    return this.cardAperte.isOpen(index);
  }

  protected toggleLineCard(index: number): void {
    this.cardAperte.toggle(index);
  }

  private readonly columnPreferences = inject(TableColumnPreferenceService);

  /** Serve a misurare la tabella resa: la ridistribuzione lavora in pixel. */

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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

    // Cambio di SEDE: un contatore legato a una sede vale solo lì, quindi
    // l'elenco delle serie cambia con lei. Senza ricarica, la tendina
    // mostrerebbe serie che in questa sede non si possono usare.
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Cambio di DATA: il numero proposto dipende da lei — è il primo libero
    // dopo i documenti di data anteriore — quindi la testata rifà l'anteprima.
    this.form.controls.documentDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Documento nuovo: la testata parte col primo numero libero della serie.
    afterNextRender(() => {
      if (!this.editDocumentId()) {
        this.numbering.refreshProposal();
      }
    });
  }

  protected isLineColumnVisible(columnId: string): boolean {
    // ⛔ **Una colonna è visibile solo se QUESTO documento la dichiara.**
    //
    // Le preferenze utente, da sole, su un id che il config non contiene
    // rispondono «visibile»: la riga comune conosce diciotto colonne, questo
    // documento ne dichiara meno, e le altre comparivano accese.
    //
    // ⚠️ Misurato a schermo il 24/08/2026, e non è teorico: aggiungendo
    // `loadsStock` al catalogo comune, l'Ordine cliente si è ritrovato DUE
    // colonne «Imp.» — la sua `commitsStock` e una `loadsStock` che non
    // dichiara. Il config è la fonte di verità nel momento in cui la riga è
    // condivisa.
    if (!STORE_SALE_LINE_COLUMNS.some((column) => column.id === columnId)) {
      return false;
    }
    return this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  /**
   * ⭐ **Le larghezze vengono dal PUNTO COMUNE.** Qui c'erano le quote senza
   * la ridistribuzione: mezzo sistema. La maniglia dell'intestazione comune
   * e' montata `[live]`, quindi la direttiva non disegna niente da sola e
   * aspetta che qualcuno ascolti `resizing` — nessuno ascoltava. Si
   * trascinava senza vedere nulla, e al rilascio la colonna saltava
   * riscalando tutte le altre.
   *
   * Questo documento dichiara solo il proprio catalogo e la propria vista.
   */
  private readonly lineWidths = createLineColumnWidths({
    defs: STORE_SALE_LINE_COLUMNS,
    viewId: this.lineColumnsView,
    preferences: this.columnPreferences,
    // ⚠️ **Lo STESSO predicato che passa alla testata e alla riga.** Il banco
    // ne aveva due — uno per il template, uno per le larghezze — e le quote si
    // calcolavano su un insieme di colonne diverso da quello reso: sommavano
    // 116,84%. Se qui e nel template le domande divergono, la geometria
    // sbaglia in silenzio.
    isVisible: (id) => this.isLineColumnVisibleFn(id as DocumentLineColumnId),
    host: this.host,
    minWidthPx: 56,
  });

  protected lineColumnWidth(columnId: string): string {
    return this.lineWidths.width(columnId);
  }

  protected lineIndexColumnWidth(): string {
    return this.lineWidths.indexWidth();
  }

  protected lineColumnMinWidth(columnId: string): number {
    return this.lineWidths.minWidth(columnId);
  }

  protected onLineColumnResizing(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResizing(columnId, renderedWidthPx);
  }

  protected onLineColumnResize(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResize(columnId, renderedWidthPx);
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
  /**
   * Cambio modalità: il valore MOSTRATO si riscrive riga per riga, partendo
   * dal netto canonico. Stessa meccanica dell'Ordine cliente — netto → ivato
   * → netto torna identico, coda decimale compresa.
   */
  protected setPriceMode(pricesIncludeVat: boolean): void {
    this.priceModeMenuOpen.set(false);
    if (pricesIncludeVat === this.pricesIncludeVat()) {
      return;
    }
    const netti = this.form.controls.lines.controls.map((_, index) =>
      this.netMinorOf(index, this.rateAt(index)),
    );
    this.pricesIncludeVat.set(pricesIncludeVat);
    this.form.controls.lines.controls.forEach((group, index) => {
      const netto = netti[index] ?? 0;
      group.controls.unitPrice.setValue(this.priceText(netto, this.rateAt(index)), {
        emitEvent: false,
      });
      this.ricordaNetto(index, netto, this.rateAt(index));
    });
  }

  /** Il testo da mostrare nel campo prezzo, secondo la modalità corrente. */
  private priceText(netMinor: number, rate: number): string {
    const shown = this.pricesIncludeVat() ? grossFromNetMinor(netMinor, rate) : netMinor;
    return moneyToDecimalString({ amountMinor: shown, currencyCode: DEFAULT_CURRENCY });
  }

  /**
   * Il netto ESATTO di una riga, ricordato insieme a come lo si sta
   * mostrando.
   *
   * ⛔ Serve perché il campo mostra **due decimali** e il netto canonico ne
   * ha fino a sei: un prezzo caricato a 2049,180328 tornerebbe 2049,18 al
   * primo risalvataggio, e sarebbe il centesimo che la regola del denaro
   * esiste per non perdere. Finché il testo è quello mostrato, il valore che
   * si salva è quello ricordato.
   */
  private readonly nettoEsatto = new WeakMap<AbstractControl, { net: number; shown: string }>();

  private ricordaNetto(index: number, netMinor: number, rate: number): void {
    const group = this.form.controls.lines.at(index);
    this.nettoEsatto.set(group, { net: netMinor, shown: this.priceText(netMinor, rate) });
  }

  /**
   * Il netto canonico di una riga, dal TESTO del controllo — o quello
   * ricordato, se il testo non è stato toccato.
   */
  private netMinorOf(index: number, rate: number): number {
    const group = this.form.controls.lines.at(index);
    const raw = group.controls.unitPrice.value;
    const ricordato = this.nettoEsatto.get(group);
    if (ricordato && ricordato.shown === raw) {
      return ricordato.net;
    }
    const parsed = parseMoneyInput(raw, DEFAULT_CURRENCY);
    if (!parsed) {
      return 0;
    }
    const net = this.pricesIncludeVat()
      ? netFromGrossExact(parsed.amountMinor, rate)
      : parsed.amountMinor;
    return toStorableMinor(net);
  }

  /** Aliquota di una riga per indice, dal Codice IVA o dallo snapshot. */
  private rateAt(index: number): number {
    const controls = this.form.controls.lines.at(index).controls;
    return this.rateOf(controls.vatCodeId.value, controls.vatRatePercent.value);
  }

  private rateOf(vatCodeId: string | null, snapshot: number | null): number {
    const vatCode = vatCodeId ? this.vatCodeById().get(vatCodeId) : undefined;
    return vatCode ? vatCode.ratePercent : (snapshot ?? 0);
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

  /**
   * La quantità cresce di un passo.
   *
   * ⛔ **Non è più il gestore dello stepper della card**: la striscia condivisa
   * il passo lo applica da sé, rispettando il minimo che le si dichiara, e poi
   * avvisa soltanto. Legare `quantityStepped` a questo metodo raddoppierebbe
   * ogni pressione dei più e dei meno — per questo l'evento non è legato.
   *
   * ⭐ Resta perché lo chiama la SCANSIONE: stesso EAN due volte vuol dire due
   * pezzi sulla riga che c'è già (`11` A14), e lì il passo lo decide la
   * maschera.
   */
  protected stepQuantity(index: number, delta: number): void {
    const control = this.form.controls.lines.at(index).controls.quantity;
    control.setValue(Math.max(1, control.value + delta));
    control.markAsDirty();
  }

  protected onVatChange(index: number, vatCodeId: string | null): void {
    const controls = this.form.controls.lines.at(index).controls;
    controls.vatCodeId.setValue(vatCodeId || null);
    controls.vatCodeId.markAsDirty();
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

  /** Solo per le prove e per la card: il controllo è `commitsStock`. */
  protected onStockToggle(index: number, checked: boolean): void {
    const control = this.form.controls.lines.at(index).controls.commitsStock;
    control.setValue(checked);
    control.markAsDirty();
  }

  // ── Il nome dell'articolo scritto a mano ─────────────────────────────────
  //
  // ⛔ Qui c'erano anche `priceFieldValue`, `onQuantityInput`, `onPriceInput` e
  // `onDiscountInput`: la card LOCALE leggeva i valori e li riscriveva a mano
  // perché emetteva eventi invece di legarsi al form. La card comune usa
  // `formControlName` sugli stessi controlli, quindi non c'è più niente da
  // riscrivere — e prezzo e sconto, che emettevano su `change`, ora muovono il
  // totale mentre si digita.

  /**
   * ⚠️ Questo sopravvive ai suoi fratelli perché la cella prodotto comune NON
   * si lega al controllo: espone valore ed evento, come già fa sulla riga di
   * scrivania. Il nome dice «descrizione» perché così si chiamava il campo
   * sulla card locale; il controllo è `productName` in entrambe le viste.
   */
  protected onDescriptionChange(index: number, value: string): void {
    const control = this.form.controls.lines.at(index).controls.productName;
    control.setValue(value);
    control.markAsDirty();
  }
  // ── Disponibilità: avviso, mai blocco ────────────────────────────────────
  //
  // `11` A18: la vendita oltre la disponibilità è consentita, l'avviso è visibile
  // e non bloccante, e Giacenza/Disponibile possono andare negative.

  protected lineExceedsAvailability(line: StoreSaleDocumentLine): boolean {
    // ⛔ **Senza articolo non c'è disponibilità da superare.** La riga con cui
    //    il documento nasce ha quantità 1 e disponibile 0 — zero perché non ha
    //    un articolo, non perché la merce sia finita. Senza questa guardia ogni
    //    vendita nuova si apriva con un avviso di giacenza su una riga vuota,
    //    e il testo lungo dell'avviso mandava la riga da ~30px a ~160px.
    if (!line.variantId) {
      return false;
    }
    return this.descriptor.mode === 'sale' && line.quantity > line.available;
  }

  /**
   * ⚠️ **Sulle righe COMPILATE, non su tutte.** La riga vuota in coda nasce con
   * quantità 1 e disponibilità zero — non avendo un articolo — quindi
   * `lineExceedsAvailability` la conterebbe come «quantità oltre la
   * disponibilità». Ogni documento nuovo si sarebbe aperto con un avviso di
   * giacenza su una riga che non contiene niente.
   */
  protected readonly availabilityWarningCount = computed(
    () => this.righeCompilate().filter((line) => this.lineExceedsAvailability(line)).length,
  );

  /**
   * ⛔ **Qui c'era una TERZA copia del messaggio**, lunga sei volte l'originale:
   * «Quantità superiore alla disponibilità. Giacenza X, impegnata Y, disponibile
   * Z. Si può concludere comunque.» — centosette caratteri, dentro lo stesso
   * `<span>` di una colonna da ottanta pixel.
   *
   * ⚠️ **E contraddiceva la funzione che il progetto ha scritto apposta**, il cui
   * commento dice testualmente «il messaggio, in un posto solo: due copie
   * divergono, e si vede tardi». Erano già divergenti: qui centosette caratteri,
   * altrove diciotto.
   *
   * ⭐ Ora passa da `availabilityHintText`, come le altre maschere. Il dettaglio
   * che questa frase aggiungeva — giacenza e impegnata — non si perde: sono due
   * colonne della riga, e al banco stanno nella card.
   */
  protected availabilityHint(line: StoreSaleDocumentLine): string {
    return availabilityHintText(line.available);
  }

  // ── Il piede: totali, note, causale, azioni ─────────────────────────────
  //
  // `11` A17: totali dal **motore economico comune**, mai una somma locale.
  //
  // ⛔ Lo **Sconto extra non è esposto** (`11` A16): è percentuale **e** importo,
  // l'importo non esiste nel contratto comune e le sue regole di calcolo sono
  // D1, aperta. Una sezione con la sola percentuale consoliderebbe una forma
  // che sappiamo incompleta. ⚠️ Il valore già persistito entra però nei totali
  // qui sotto: non esporre un controllo non significa ignorare un dato.

  /**
   * **Le voci del riepilogo, dichiarate dal documento.**
   *
   * ⛔ **Lo Sconto extra non c'e', ed e' dominio dichiarato**: al banco non si
   * sconta il documento intero, si sconta la riga. Le altre quattro maschere
   * hanno la voce modificabile, questa no — ed e' l'unica assenza del
   * riepilogo che sia una scelta e non una dimenticanza.
   *
   * ⚠️ Lo sconto **persistito** compare lo stesso se il documento ne porta uno:
   * un documento salvato altrove puo' averlo, e nasconderlo lo farebbe sparire
   * dai conti senza spiegazione.
   *
   * ⭐ Il formattatore era `money()`, un locale che forzava la valuta
   * predefinita. Ora e' quello comune: un documento in un'altra valuta si
   * leggeva sbagliato qui e giusto altrove.
   */
  protected readonly totalsRows = computed<readonly DocumentTotalRow[]>(() => {
    const t = this.totals();
    return [
      { key: 'linesTotal', label: 'Imponibile righe', value: t.linesTotal },
      ...(this.hasPersistedDiscount()
        ? [
            {
              key: 'documentDiscount',
              label: 'Sconto documento',
              value: t.documentDiscount,
              negative: true,
            },
          ]
        : []),
      { key: 'subtotal', label: 'Imponibile', value: t.subtotal },
      { key: 'tax', label: 'IVA', value: t.tax },
      { key: 'total', label: 'Totale documento', value: t.total, kind: 'total' as const },
    ];
  });

  protected readonly totals = computed(() =>
    computeDocumentTotals(
      this.lines().map((line) => {
        const amounts = this.lineAmounts(line);
        return {
          netMinor: amounts.lineNetMinor,
          vatMinor: amounts.lineVatMinor,
          vatRate: this.rateOf(line.vatCodeId, line.vatRatePercent),
          // Al banco ogni riga porta la propria imposta nel totale: non ci sono
          // reverse charge, che appartengono ad altri tipi documento.
          countsVatInTotal: true,
        };
      }),
      this.preserved().documentDiscountPercent,
      DEFAULT_CURRENCY,
    ),
  );

  /** Lo sconto documento c'è solo se un documento vecchio ne portava uno. */
  protected readonly hasPersistedDiscount = computed(
    () => this.preserved().documentDiscountPercent > 0,
  );

  protected readonly money = (amount: { readonly amountMinor: number }): string =>
    formatMoney({ amountMinor: amount.amountMinor, currencyCode: DEFAULT_CURRENCY });

  /** L'esito resta finché l'operatore non lo congeda: è la conferma. */
  protected dismissLastResult(): void {
    this.lastResult.set(null);
  }

  protected onNotesInput(value: string): void {
    this.preserved.update((testata) => ({ ...testata, notes: value }));
  }

  /**
   * La causale del Reso: **facoltativa** (`11` A11) e nel piede, coi dati
   * documentali secondari — la testata resta quella che serve per iniziare a
   * lavorare.
   */
  protected onCausaleInput(value: string): void {
    this.preserved.update((testata) => ({ ...testata, causale: value }));
  }

  /** L'azione finale dice che cosa conclude: «Concludi vendita» / «Concludi reso». */
  protected readonly confirmLabel = computed(() =>
    this.descriptor.mode === 'sale' ? 'Concludi vendita' : 'Concludi reso',
  );

  /**
   * ⛔ Qui il pulsante pretendeva `righeCompilate().length > 0`: senza righe era
   * SPENTO, e il banco non faceva eccezione al muro che avevano tutte le altre
   * maschere.
   *
   * ⭐ Dal 25/08/2026 un documento vuoto si salva, e la sola condizione resta il
   * campo obbligatorio del banco — la **sede**. Il Cliente non lo e' mai stato.
   *
   * ⚠️ **Tolto SOLO il requisito delle righe**, e niente altro. La rete
   * `documentHasLinesWithoutEffect` che le altre maschere hanno qui non e' stata
   * aggiunta: al banco le righe nascono da uno scan o da una ricerca e portano
   * gia' la variante, quindi sarebbe una restrizione NUOVA introdotta di
   * straforo insieme a una decisione che ne toglieva una.
   */
  protected readonly canConclude = computed(
    () => !!this.form.controls.locationId.value && !this.savePending(),
  );

  // ── Uscita con lavoro non salvato ───────────────────────────────────────

  /**
   * **C’e’ lavoro che si perderebbe uscendo?**
   *
   * ⛔ Qui c’era `righeCompilate().length > 0`: contavano le sole RIGHE.
   * Cliente, data, numero, serie, note e causale non contavano — si poteva
   * compilare mezza testata e uscire in silenzio, perdendo tutto.
   *
   * ⭐ Il criterio ora e’ quello comune (proprietario, 24/08/2026):
   * **l’operatore ha toccato qualcosa**.
   *
   * ⚠️ **Da `form.events`, non da `valueChanges`.** Mezza maschera segna le
   * proprie modifiche con `markAsDirty()`, che NON emette un cambio di
   * valore: con `valueChanges` la spunta di magazzino e il cestino di riga
   * non conterebbero. Gli eventi del controllo includono invece il cambio di
   * `pristine`.
   *
   * ⭐ E il `pristine` di Angular distingue gia’ da se’ le scritture
   * PROGRAMMATICHE da quelle dell’operatore: `setValue` non sporca, solo
   * l’interazione lo fa. Per questo il numero e la sede proposti non
   * accendono l’avviso, e non serve sopprimerli a mano.
   */
  private readonly formPristine = toSignal(this.form.events.pipe(map(() => this.form.pristine)), {
    initialValue: true,
  });

  protected readonly hasPendingWork = computed(() => !this.formPristine());

  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;

  /**
   * Guardia di rotta: con righe in corso si chiede, invece di perdere il
   * lavoro. Vale anche passando da «Nuova vendita» a «Nuovo reso» (`11` A2):
   * sono due indirizzi, e senza il dialogo quella sarebbe l'unica strada per
   * uscire da un documento aperto senza che nessuno lo chieda.
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

  /** «Annulla»: si resta dove si è. */
  protected cancelExit(): void {
    this.exitDialogOpen.set(false);
    this.pendingDeactivate?.(false);
    this.pendingDeactivate = null;
  }

  /** «Esci senza salvare»: il lavoro in corso si lascia andare. */
  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.form.controls.lines.clear();
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  /** Chiusura dal piede: passa dalla stessa guardia, non la scavalca. */
  protected close(): void {
    void this.router.navigateByUrl(STORE_SALE_ROOT_PATH);
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
   * ⚠️ **Qui c'era «pubblico e senza chiamante in questa fase»**, e non è più
   * vero da quando il piede esiste: lo invoca «Concludi vendita» / «Concludi
   * reso» (`saveRequested` nel template). Corretto il 01/09/2026 leggendolo
   * mentre si cercava perché la vendita non si salvasse — una nota che dice
   * «nessuno lo chiama» è la prima cosa che manda fuori strada chi indaga.
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
        this.afterConclude();
      },
      error: (err: unknown) => {
        this.savePending.set(false);
        // Numero già preso: si propone il primo libero invece dell'errore
        // nudo. L'intento di creazione resta valido — il 409 di numerazione
        // ha fatto rollback — e lo dice `rotateCreationIntentIfCertain`.
        const conflitto = documentNumberConflictOf(err);
        if (conflitto) {
          this.numberConflictDialog.open(conflitto);
          this.rotateCreationIntentIfCertain(err);
          return;
        }
        this.saveError.set(errorMessage(err));
        this.alreadyCreatedDocumentId.set(creationIntentErrorOf(err)?.resultRef ?? null);
        this.rotateCreationIntentIfCertain(err);
        this.portaInVistaLErrore();
      },
    });
  }

  /*
    ⛔ **UN ERRORE CHE NON SI VEDE È UN SALVATAGGIO CHE NON SUCCEDE.**

    L'avviso di errore sta in cima alla maschera; «Concludi vendita» sta in fondo,
    cinquecento righe di markup più giù. Su un documento con qualche riga i due
    punti non sono nella stessa schermata: il salvataggio falliva, lo diceva, e
    l'operatore vedeva soltanto che non succedeva niente.

    ⚠️ **Segnalato dal proprietario il 30/08/2026** — «bisogna vedere perché non
    si salva una nuova vendita al banco» — e questa è la parte che si può
    correggere senza conoscere la causa del rifiuto: qualunque essa sia, deve
    arrivare agli occhi di chi ha premuto.

    ⚠️ **`setTimeout` e non subito**: il banner non esiste ancora nel DOM quando
    il segnale cambia — Angular lo rende al giro di rilevamento successivo, e
    cercarlo prima non trova nulla. Zero millisecondi bastano: serve il turno, non
    l'attesa.

    ⭐ **`block: 'start'`, come la sezione Allegati dell'Ordine cliente**: è il
    pattern già in uso, e portare in vista qualcosa non merita un secondo modo.
  */
  private portaInVistaLErrore(): void {
    setTimeout(() => {
      this.host.nativeElement
        .querySelector('app-inline-banner')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /**
   * Concluso il documento, si è pronti per il **cliente successivo**.
   *
   * ```text
   * conferma a schermo col riferimento del documento appena concluso
   * compilazione nuova e VUOTA dello stesso modo (sale resta Vendita)
   * intento di creazione nuovo (T15): la vendita dopo è un'altra operazione
   * righe, cliente, note e causale NON si trascinano
   * i default della compilazione nuova si riapplicano
   * ```
   *
   * ⛔ **Solo in creazione.** Modificare un documento esistente non è
   * un'operazione di banco: lì si resta sul documento, col suo contesto e col
   * normale contratto di modifica. Svuotare dopo un salvataggio farebbe
   * sparire ciò che si stava correggendo.
   */
  private afterConclude(): void {
    if (this.isEditMode()) {
      return;
    }
    this.form.controls.lines.clear();
    this.cardAperte.closeAll();
    this.preserved.set(PRESERVED_HEADER_VUOTA);
    this.form.controls.customerId.setValue('');
    this.form.controls.documentDate.setValue(oggiIso());
    this.searchDraft.set('');
    this.searchMessage.set(null);
    // ⭐ La sede torna al **default comune**, come ogni altro campo: la
    // compilazione nuova riparte dalle stesse regole di una aperta adesso.
    //
    // ⛔ Nessuna memoria del banco: un override fatto per la vendita
    // precedente non si trascina in quella dopo. Se non c'è una predefinita il
    // campo resta vuoto e la sede si sceglie — che è ciò che il contratto
    // comune prescrive per chi lavora su più sedi.
    this.form.controls.locationId.setValue(this.operationalLocations.defaultLocation()?.id ?? '');
    // Numero e serie: la vendita dopo è un documento NUOVO, quindi riparte
    // da una proposta — non dal numero appena assegnato, e non da una serie
    // scelta per la vendita precedente.
    this.form.controls.documentNumber.markAsPristine();
    this.numbering.resetChoice();
    this.numbering.refreshProposal();
    this.focusSearchInput();
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
      // Numero e serie col contratto comune: `undefined` = «decidi tu»,
      // stringa vuota = «Senza serie», e in modifica la serie viaggia sempre.
      series: this.numbering.chosenSeries(),
      number: this.numbering.imposedNumber(),
      pricesIncludeVat: this.pricesIncludeVat(),
      notes: testata.notes.trim() || undefined,
      lines: this.righeCompilate().map(storeSaleLinePayload),
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
      // Numero e serie col contratto comune: `undefined` = «decidi tu»,
      // stringa vuota = «Senza serie», e in modifica la serie viaggia sempre.
      series: this.numbering.chosenSeries(),
      number: this.numbering.imposedNumber(),
      pricesIncludeVat: this.pricesIncludeVat(),
      notes: testata.notes.trim() || undefined,
      lines: this.righeCompilate().map(storeReturnLinePayload),
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
    // ⭐ Numero e serie del documento, e restano MODIFICABILI: il banco non
    // fa eccezione al contratto comune (correzione del 21/08/2026).
    this.form.controls.documentNumber.setValue(doc.number ?? null);
    this.form.controls.series.setValue(doc.series ?? '');
    this.pricesIncludeVat.set(doc.pricesIncludeVat);
    this.preserved.set({
      documentDiscountPercent: doc.documentDiscountPercent ?? 0,
      notes: doc.notes ?? '',
      causale: doc.causalText ?? '',
    });
    const righe = this.form.controls.lines;
    righe.clear();
    for (const line of (doc.lines ?? []).map(storeSaleLineFromDocumentLine)) {
      const group = this.createLine();
      const rate = this.rateOf(line.vatCodeId, line.vatRatePercent);
      group.patchValue({
        serverLineId: line.serverLineId,
        variantId: line.variantId,
        sku: line.sku,
        productName: line.description,
        // L'etichetta fotografata sulla vendita. Vuota sulle righe salvate
        // prima della colonna: lì la variante è dentro la descrizione.
        variantLabel: line.variantLabel,
        persistedDescription: line.persistedDescription,
        quantity: line.quantity,
        // Il testo segue la modalità del DOCUMENTO, appena impostata sopra.
        unitPrice: this.priceText(line.unitPriceMinor, rate),
        discount: line.discountPercent ? `${line.discountPercent}%` : '',
        vatCodeId: line.vatCodeId,
        persistedVatCodeId: line.persistedVatCodeId,
        vatRatePercent: line.vatRatePercent,
        commitsStock: line.loadsStock,
        onHand: line.onHand,
        committed: line.committed,
        available: line.available,
      });
      righe.push(group);
      this.ricordaNetto(righe.length - 1, line.unitPriceMinor, rate);
    }
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
