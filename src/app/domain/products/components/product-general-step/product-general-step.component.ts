import { UnitOfMeasureSelectComponent } from '../unit-of-measure-select/unit-of-measure-select.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import type { Subscription } from 'rxjs';

import { PRODUCT_KIND_LABELS, ProductKind, ProductStatus } from '@core/models/product.model';
import type { ShopifyCategoryMetafieldValue } from '@core/models/shopify-category-metafield.model';
import { type VatCode } from '@core/models/vat-code.model';
import {
  DEFAULT_CURRENCY,
  moneyFromMajorExact,
  moneyToMajor,
  roundToMinor,
} from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import type { SegmentedOption } from '@shared/components/segmented/segmented.component';
import { vatCodeSelectOption } from '@domain/documents/utils/document-vat-options.util';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
// Aritmetica IVA: una sola implementazione in tutta l'app (stesse formule e
// stessi arrotondamenti dei documenti, a loro volta specchio del backend).
import {
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossExact,
  vatInputFromVatCode,
} from '@domain/documents/utils/document-vat.util';

import {
  COMMON_UNIT_OF_MEASURE,
  INVENTORY_TRACKING_LABELS,
  InventoryTrackingMode,
} from '@core/models/product-catalog.model';

import type { ProductGeneralDraft } from '../../models/product-form.model';
import type { CatalogCategory } from '../../services/catalog-category.service';
import { CatalogCategoryService } from '../../services/catalog-category.service';
import { CatalogCategoryManagerComponent } from '../catalog-category-manager/catalog-category-manager.component';
import {
  ARTICLE_CODE_FORMAT_MESSAGE,
  ARTICLE_CODE_PATTERN,
  ARTICLE_CODE_REQUIRED_MESSAGE,
  normalizeArticleCode,
} from '../../models/product-form.validators';
import {
  buildProductSeasonSelectOptions,
  isStandardProductSeason,
  PRODUCT_SEASON_CUSTOM_OPTION,
} from '../../models/product-season.options';
import type { ProductListinoSlot } from '../../models/product-listino.model';
import { productStatusLabel } from '../../models/product-status.util';
import { ShopifyCategoryAttributesComponent } from '../shopify-category-attributes/shopify-category-attributes.component';
import type { ShopifyTaxonomySelection } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';
import { ShopifyTaxonomyPickerComponent } from '../shopify-taxonomy-picker/shopify-taxonomy-picker.component';

type RequiredField = 'name';

interface StatusOption {
  readonly value: ProductStatus;
  readonly label: string;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: ProductStatus.Active, label: productStatusLabel(ProductStatus.Active) },
  { value: ProductStatus.Draft, label: productStatusLabel(ProductStatus.Draft) },
  { value: ProductStatus.Archived, label: productStatusLabel(ProductStatus.Archived) },
];

/** Valore speciale select: apre l'inserimento manuale di categoria/stagione. */
const CUSTOM_OPTION_VALUE = '__custom__';

/**
 * Tutti i valori commerciali di VENDITA dell'articolo. Il draft li porta sempre
 * NETTI; nei campi si vedono netti o ivati a seconda di come l'operatore
 * preferisce lavorare, e il selettore è UNO per tutti e sei.
 *
 * ⚠️ `compareAtPrice` è entrato qui il 17/08/2026, ed era l'unica eccezione:
 * si inseriva «come va mostrato al cliente» e ignorava il selettore **in
 * silenzio**. La conseguenza usciva dal gestionale — verso Shopify la stessa
 * riga variante portava `price` netto e `compare_at_price` ivato, cioè uno
 * sconto mostrato al cliente gonfiato dell'aliquota.
 *
 * Il **costo di riferimento** resta fuori di proposito: appartiene al dominio
 * costi, che è sempre netto e ha una convenzione sua.
 */
type PriceField =
  | 'sellingPrice'
  | 'compareAtPrice'
  | 'shopifyPrice'
  | 'listino1Price'
  | 'listino2Price'
  | 'listino3Price';

const PRICE_FIELDS: readonly PriceField[] = [
  'sellingPrice',
  'compareAtPrice',
  'shopifyPrice',
  'listino1Price',
  'listino2Price',
  'listino3Price',
];

/** Prezzi netti dell'articolo: il dato, indipendente da come lo si guarda. */
type NetPrices = Readonly<Record<PriceField, number | null>>;

const PRICE_MODE_OPTIONS: readonly SegmentedOption[] = [
  { value: 'net', label: 'Netti' },
  { value: 'gross', label: 'Ivati' },
];

// Ponte unità maggiori <-> minori: la conversione IVA lavora in centesimi, come
// il backend, così l'arrotondamento è lo stesso ovunque. Il ponte è quello
// ESATTO: il netto scorporato da un ivato non è intero, e arrotondarlo qui
// perderebbe la coda che lo fa tornare identico in ivato (§sei decimali).
function majorToMinor(major: number): number {
  return moneyFromMajorExact(major, DEFAULT_CURRENCY).amountMinor;
}

function minorToMajor(minor: number): number {
  return moneyToMajor({ amountMinor: minor, currencyCode: DEFAULT_CURRENCY });
}

@Component({
  selector: 'app-product-general-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    HoverTooltipComponent,
    SegmentedComponent,
    DocumentLineSelectCellComponent,
    SelectMenuComponent,
    ShopifyTaxonomyPickerComponent,
    ShopifyCategoryAttributesComponent,
    CatalogCategoryManagerComponent,
    UnitOfMeasureSelectComponent,
  ],
  templateUrl: './product-general-step.component.html',
  styleUrl: './product-general-step.component.scss',
})
export class ProductGeneralStepComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalogCategoryService = inject(CatalogCategoryService);

  readonly value = input.required<ProductGeneralDraft>();
  readonly valueChange = output<ProductGeneralDraft>();
  /** Il vocabolario categorie è cambiato (gestione inline): il parent ricarica. */
  readonly categoriesChanged = output<void>();

  readonly categories = input<readonly string[]>([]);
  /** Vocabolario gestito categorie/sottocategorie (dal parent smart). */
  readonly catalogCategories = input<readonly CatalogCategory[]>([]);
  /** Fornitori in anagrafica per il campo "Fornitore" (dal parent smart). */
  readonly supplierOptions = input<readonly SelectMenuOption[]>([]);
  /** Codici IVA attivi per la tendina "Codice IVA" (dal parent smart). */
  readonly vatCodes = input<readonly VatCode[]>([]);
  readonly shopifyConnected = input(false);
  /**
   * Shopify attivo per il tenant (profilo canale = Shopify). Governa la
   * VISIBILITÀ del campo Prezzo Shopify e dell'avviso zero — allineato al gate
   * del backend, che decide l'indipendenza del prezzo Shopify sul profilo, non
   * sullo stato di connessione. Distinto da `shopifyConnected` (che richiede
   * anche la connessione attiva, usato per la tassonomia).
   */
  readonly shopifyActive = input(false);
  /**
   * Mostra il campo Costo di riferimento (prezzo d'acquisto dell'articolo).
   * Permesso catalog.view_purchase_costs: senza, il campo resta nascosto e il
   * valore esistente non viene mai toccato.
   */
  readonly canSeeCosts = input(false);
  /**
   * Sezione da mostrare: 'article' = tab Articolo (identificativi, categorie,
   * stato, U.M., IVA, tipo, fornitore); 'catalog' = tab Catalogo (Shopify,
   * stagione, tracciamento, tag, descrizione, note interne). Il form resta
   * unico: ogni istanza emette sempre il draft completo.
   */
  readonly section = input<'article' | 'catalog'>('article');
  /**
   * true = modifica di un articolo esistente: il codice articolo diventa
   * obbligatorio (in creazione può restare vuoto: il backend genera il
   * progressivo) e compare "Ripristina" dopo una cancellazione.
   */
  readonly editMode = input(false);
  /** Nome dell'articolo che già usa il codice digitato (verifica live dal parent). */
  readonly articleCodeTakenBy = input<string | null>(null);
  /**
   * Listini aggiuntivi ATTIVI per il tenant, già etichettati (dal parent smart).
   * Vuoto = nessun listino aggiuntivo in questa azienda: la sezione mostra solo
   * prezzo articolo e, con Shopify attivo, prezzo Shopify.
   */
  readonly listinoSlots = input<readonly ProductListinoSlot[]>([]);
  /**
   * Codice IVA predefinito dell'azienda: fa da aliquota quando l'articolo non ne
   * dichiara una propria. Nessuna delle due = nessuna conversione possibile.
   */
  readonly tenantDefaultVatCodeId = input<string | null>(null);
  /**
   * Modalità della sezione Listini: `true` = i campi mostrano prezzi IVATI.
   * È una preferenza dell'OPERATORE (non dell'articolo): il parent la carica una
   * volta e la ripropone su ogni scheda, nuova o esistente. Two-way perché il
   * toggle vive qui ma la deve conoscere anche chi salva.
   */
  readonly pricesIncludeVat = model(false);

  protected readonly statusSelectOptions: readonly SelectMenuOption[] = STATUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

  protected readonly uomSelectOptions: readonly SelectMenuOption[] = COMMON_UNIT_OF_MEASURE.map(
    (value) => ({ value, label: value }),
  );

  /**
   * ⚠️ **Le stesse opzioni delle righe documento** (18/08/2026), costruite da
   * `vatCodeSelectOption`: `label` è **il codice**, `detail` la spiegazione.
   *
   * Prima l'etichetta era la specifica intera (`22 · 22% · Imponibile 22%`) e
   * il valore scelto si mostrava con `triggerLabel` (`22%`). Quella forma non
   * si può cercare per codice: il filtro dà la precedenza a chi *comincia* con
   * ciò che si digita, e digitando `1` nessuna voce comincia per 1 — cominciano
   * tutte col proprio codice, sì, ma preceduto da nient'altro solo in questa
   * forma. Con `label` = codice, `1` porta a `10` come in Danea e come nelle
   * righe.
   *
   * L'aliquota non si perde: sta in `detail`, accanto alla voce nell'elenco.
   */
  protected readonly vatSelectOptions = computed((): readonly SelectMenuOption[] => {
    const currentId = this.value().defaultVatCodeId;
    return this.vatCodes()
      .filter((entry) => entry.isActive || entry.id === currentId)
      .map((entry) => vatCodeSelectOption(entry));
  });

  /**
   * Il campo mostra **l'aliquota, e basta** — la stessa cosa che mostra quando
   * un codice è scelto esplicitamente (`triggerLabel`).
   *
   * ⚠️ Diceva «Predefinito aziendale», che è vero e inutile: guardando la
   * scheda non si sapeva se quell'articolo sarebbe uscito al 22% o al 10%, e
   * per saperlo si doveva aprire Impostazioni — un altro pezzo di applicazione,
   * per un dato che sta a due centimetri dal campo.
   *
   * ⚠️ E non basta aggiungerla accanto: «Predefinito aziendale · 22%» dice due
   * cose dove ne serve una, e la parola lunga si prende il campo per spiegare
   * un meccanismo che all'operatore non serve conoscere mentre compila. Chi
   * vuole sapere DA DOVE viene quell'aliquota apre la tendina, dove la voce lo
   * dice per esteso.
   *
   * Il valore salvato resta **vuoto**, e non è un dettaglio: vuoto significa
   * «segui la convenzione aziendale», quindi il giorno in cui l'azienda cambia
   * predefinita questo articolo la segue. Scrivere il codice dentro al campo lo
   * congelerebbe — è la stessa distinzione fra convenzione e memoria di
   * `regole-gestionale`. A cambiare è ciò che si LEGGE, non ciò che si salva.
   */
  /**
   * ⚠️ **A campo vuoto non c'è scritto NIENTE** (18/08/2026, decisione del
   * proprietario del progetto).
   *
   * Il predefinito aziendale serve a **precompilare** un articolo nuovo con un
   * valore vero — se l'azienda lavora al 22%, l'articolo nasce al 22% e lo si
   * vede scritto. Non serve a riempire il vuoto di un articolo che l'IVA non
   * ce l'ha: **un articolo senza Codice IVA è legittimo**, e il predefinito non
   * lo tocca.
   *
   * Da cui: niente segnaposto. Ci sono passate due diciture sbagliate, e
   * dicevano entrambe la stessa cosa falsa — che il vuoto «vale» il
   * predefinito: prima l'aliquota nuda («22%»), che faceva sembrare l'articolo
   * al 22%; poi «Nessuno (propone 22%)», che spiegava un meccanismo di cui in
   * questa schermata non si deve sapere niente. Vuoto è vuoto.
   */
  protected readonly vatPlaceholder = '';

  protected readonly trackingSelectOptions: readonly SelectMenuOption[] = (
    Object.values(InventoryTrackingMode) as InventoryTrackingMode[]
  ).map((value) => ({
    value,
    label: INVENTORY_TRACKING_LABELS[value],
  }));

  /** Tipo prodotto (Articolo/Servizio): solo VestiFlow, mai sincronizzato con Shopify. */
  protected readonly kindSelectOptions: readonly SelectMenuOption[] = (
    Object.values(ProductKind) as ProductKind[]
  ).map((value) => ({
    value,
    label: PRODUCT_KIND_LABELS[value],
  }));

  protected readonly customCategory = signal(false);
  protected readonly customSubcategory = signal(false);
  protected readonly customSeason = signal(false);
  protected readonly taxonomyTouched = signal(false);

  // ── Categoria/Sottocategoria VestiFlow (vocabolario gestito + facets) ──────
  protected readonly categoryManagerOpen = signal(false);
  protected readonly subcategoryManagerOpen = signal(false);
  protected readonly ensuringCategory = signal(false);

  protected readonly rootCategoryEntries = computed(() =>
    this.catalogCategories().filter((entry) => entry.parentId === null),
  );

  /** Nomi categoria disponibili: vocabolario gestito + valori già sui prodotti. */
  private readonly categoryNamePool = computed((): readonly string[] => {
    const pool = this.rootCategoryEntries().map((entry) => entry.name);
    for (const value of this.categories()) {
      if (!pool.some((name) => name.toLowerCase() === value.toLowerCase())) {
        pool.push(value);
      }
    }
    return pool;
  });

  protected readonly hasCategory = computed(() => this.categoryValue().trim() !== '');

  /** Voce gestita corrispondente alla categoria selezionata (per le sottocategorie). */
  protected readonly managedCategory = computed((): CatalogCategory | null => {
    const current = this.categoryValue().trim().toLowerCase();
    if (!current) {
      return null;
    }
    return this.rootCategoryEntries().find((entry) => entry.name.toLowerCase() === current) ?? null;
  });

  protected readonly subcategoryEntries = computed((): readonly CatalogCategory[] => {
    const parent = this.managedCategory();
    if (!parent) {
      return [];
    }
    return this.catalogCategories().filter((entry) => entry.parentId === parent.id);
  });

  protected readonly categorySelectOptions = computed((): readonly SelectMenuOption[] => {
    const values = this.withCurrent(this.categoryNamePool(), this.categoryValue());
    const options = values.map((value) => ({ value, label: value }));
    if (this.categoryNamePool().length > 0) {
      return [...options, { value: CUSTOM_OPTION_VALUE, label: 'Altra categoria…' }];
    }
    return options;
  });

  protected readonly subcategorySelectOptions = computed((): readonly SelectMenuOption[] => {
    const names = this.subcategoryEntries().map((entry) => entry.name);
    const values = this.withCurrent(names, this.subcategoryValue());
    const options = values.map((value) => ({ value, label: value }));
    return [...options, { value: CUSTOM_OPTION_VALUE, label: 'Altra sottocategoria…' }];
  });

  protected readonly subcategorySelectValue = computed(() =>
    this.customSubcategory() ? CUSTOM_OPTION_VALUE : this.subcategoryValue(),
  );

  protected readonly seasonSelectOptions = computed((): readonly SelectMenuOption[] =>
    buildProductSeasonSelectOptions(this.seasonValue()),
  );

  protected readonly categorySelectValue = computed(() =>
    this.customCategory() ? CUSTOM_OPTION_VALUE : this.categoryValue(),
  );

  protected readonly seasonSelectValue = computed(() =>
    this.customSeason() ? PRODUCT_SEASON_CUSTOM_OPTION : this.seasonValue(),
  );

  protected readonly taxonomyInvalid = computed(
    () =>
      this.shopifyConnected() &&
      this.taxonomyTouched() &&
      !this.value().shopifyTaxonomyCategoryId.trim(),
  );

  private readonly categoryValue = signal('');
  private readonly subcategoryValue = signal('');
  private readonly seasonValue = signal('');

  /**
   * ⭐ Riallinea il «Nome online» al nome interno, su richiesta esplicita.
   *
   * ⚠️ È un COMANDO, non un automatismo: i due campi sono indipendenti apposta,
   *    e riallinearli da soli a ogni modifica del nome interno rimetterebbe il
   *    nome di magazzino sulla vetrina — cioè il difetto da cui nascono due
   *    campi invece di uno (docs/24 §1.9).
   */
  protected copyNameToOnlineTitle(): void {
    const nome = this.form.controls.name.value.trim();
    if (!nome) {
      return;
    }
    this.form.controls.shopifyTitle.setValue(nome);
    this.form.controls.shopifyTitle.markAsDirty();
  }

  /** Spento quando non c'è niente da copiare, o quando i due già coincidono. */
  protected canCopyNameToOnline(): boolean {
    const nome = this.form.controls.name.value.trim();
    return nome !== '' && nome !== this.form.controls.shopifyTitle.value.trim();
  }

  protected readonly form = this.fb.group({
    // Primo campo dell'anagrafica (§POSIZIONE): identificatore principale.
    // `required` viene aggiunto in ngOnInit solo in modifica (in creazione
    // vuoto = progressivo generato dal backend).
    articleCode: this.fb.control('', [Validators.pattern(ARTICLE_CODE_PATTERN)]),
    name: this.fb.control('', [Validators.required]),
    // ⚠️ Nessun `required`: vuoto è uno stato legittimo — significa «lo decide
    //    la prima sincronizzazione», non «l'operatore ha dimenticato qualcosa».
    shopifyTitle: this.fb.control(''),
    brand: this.fb.control(''),
    category: this.fb.control(''),
    subcategory: this.fb.control(''),
    internalNotes: this.fb.control(''),
    supplierId: this.fb.control(''),
    shopifyTaxonomyCategoryId: this.fb.control(''),
    shopifyTaxonomyCategoryFullName: this.fb.control(''),
    shopifyCategoryMetafields: this.fb.control<readonly ShopifyCategoryMetafieldValue[]>([]),
    season: this.fb.control(''),
    tags: this.fb.control(''),
    status: this.fb.control<ProductStatus>(ProductStatus.Draft),
    shopifySyncEnabled: this.fb.control(true),
    // ⚠️ Nasce VUOTO, non `pz`: se partisse compilato la predefinita del tenant
    //   non avrebbe niente da seminare, e non si distinguerebbe «pz scelto» da
    //   «pz per inerzia». Il ripiego tecnico resta al salvataggio.
    unitOfMeasure: this.fb.control(''),
    defaultVatCodeId: this.fb.control(''),
    inventoryTracking: this.fb.control<InventoryTrackingMode>(InventoryTrackingMode.Standard),
    managesStock: this.fb.control(true),
    kind: this.fb.control<ProductKind>(ProductKind.Article),
    // Prezzo/costo a livello articolo (unità maggiori). Il prezzo di vendita è il
    // dato reale dell'articolo; barrato e costo di riferimento sono opzionali.
    // I prezzi ammettono `null` perché un input number svuotato vale null: il
    // parent lo vede e blocca il salvataggio, invece di salvare uno zero che
    // nessuno ha digitato.
    sellingPrice: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    // Prezzo Shopify (§B): valore proprio. Zero è legittimo (avviso non
    // bloccante); nessun min diverso da 0.
    shopifyPrice: this.fb.control<number | null>(0, [Validators.min(0)]),
    compareAtPrice: this.fb.control<number | null>(null, [Validators.min(0)]),
    purchasePrice: this.fb.control<number | null>(null, [Validators.min(0)]),
    // Listini aggiuntivi (§B): null = non valorizzato, che per un listino non è
    // zero (una riga documento su un listino vuoto va a zero con avviso).
    listino1Price: this.fb.control<number | null>(null, [Validators.min(0)]),
    listino2Price: this.fb.control<number | null>(null, [Validators.min(0)]),
    listino3Price: this.fb.control<number | null>(null, [Validators.min(0)]),
    description: this.fb.control(''),
  });

  private valueChangesSub: Subscription | null = null;

  /**
   * Il prezzo Shopify SEGUE il prezzo articolo finché l'operatore non lo tocca
   * (§B). Inizializzato a `shopifyPrice === sellingPrice` all'apertura: una
   * scheda esistente con prezzo Shopify già divergente NON viene sovrascritta
   * dal follow (lettura non distruttiva). Si spegne al primo edit del campo.
   */
  private readonly shopifyFollowsArticle = signal(true);
  /** Valore corrente del prezzo Shopify (per l'avviso zero, reattivo). */
  private readonly shopifyPriceValue = signal<number | null>(0);

  /**
   * Avviso non bloccante: prezzo Shopify a zero con Shopify attivo. L'articolo si
   * pubblicherebbe a 0; l'operatore può salvare comunque (nessun blocco).
   */
  protected readonly showShopifyZeroWarning = computed(
    () => this.shopifyActive() && this.shopifyPriceValue() === 0,
  );

  // ── Sezione Listini: il dato è il netto, la vista è netta o ivata ─────────
  //
  // I campi mostrano `vista = f(netto, modalità, aliquota)`. Il netto cambia
  // solo quando l'operatore digita; cambiare modalità o codice IVA ricalcola la
  // vista e NON tocca il dato — così un giro netto→ivato→netto non sposta di un
  // centesimo il prezzo salvato, e il form non risulta "modificato" per una
  // scelta di visualizzazione.
  private readonly netPrices = signal<NetPrices>({
    sellingPrice: 0,
    compareAtPrice: null,
    shopifyPrice: 0,
    listino1Price: null,
    listino2Price: null,
    listino3Price: null,
  });

  /** Codice IVA scelto sull'articolo (reattivo: il campo vive in questo form). */
  private readonly articleVatCodeId = signal('');

  /** Opzioni del toggle di sezione (netti / ivati). */
  protected readonly priceModeOptions = PRICE_MODE_OPTIONS;
  protected readonly priceModeValue = computed(() => (this.pricesIncludeVat() ? 'gross' : 'net'));

  /**
   * Aliquota da usare per la conversione: quella dell'articolo, altrimenti il
   * predefinito aziendale. Zero quando manca o quando il codice non espone IVA
   * (esente, reverse charge): in quel caso netto e ivato coincidono e il toggle
   * non muove niente — comportamento voluto, nessun avviso.
   */
  private readonly conversionRate = computed(() => {
    const id = this.articleVatCodeId().trim() || (this.tenantDefaultVatCodeId() ?? '').trim();
    const code = id ? this.vatCodes().find((entry) => entry.id === id) : undefined;
    if (!code) {
      return 0;
    }
    const vat = vatInputFromVatCode(code);
    return entryIncludesVat('vat_included', vat) ? vat.ratePercent : 0;
  });

  /** True quando il toggle "Ivati" cambia davvero i valori mostrati. */
  protected readonly vatConversionAvailable = computed(() => this.conversionRate() > 0);

  /** La vista si allinea al dato solo dopo che il form è stato inizializzato. */
  private formReady = false;

  /** Codice caricato all'apertura: base del "Ripristina" (§obbligatorio). */
  private initialArticleCode = '';

  constructor() {
    // La vista dei prezzi segue modalità e aliquota. Anche il primo passaggio è
    // qui: preferenza operatore e codici IVA arrivano dal server, quindi dopo
    // `ngOnInit`. Nessun `emit`: il draft non cambia, cambia solo come lo si legge.
    effect(() => {
      const includeVat = this.pricesIncludeVat();
      const rate = this.conversionRate();
      if (!this.formReady) {
        return;
      }
      this.showNetPrices(includeVat, rate);
    });
  }

  ngOnInit(): void {
    const initial = this.value();
    this.initialArticleCode = normalizeArticleCode(initial.articleCode);
    if (this.editMode()) {
      this.form.controls.articleCode.addValidators(Validators.required);
      this.form.controls.articleCode.updateValueAndValidity({ emitEvent: false });
    }
    this.categoryValue.set(initial.category);
    this.subcategoryValue.set(initial.subcategory);
    this.seasonValue.set(initial.season);
    this.customCategory.set(this.shouldUseCustomField(initial.category, this.categoryNamePool()));
    this.customSeason.set(initial.season.trim() !== '' && !isStandardProductSeason(initial.season));
    this.form.setValue(initial, { emitEvent: false });

    // Il draft arriva sempre netto: è il dato di partenza della sezione Listini.
    // La vista viene poi allineata dall'effect (modalità e aliquota arrivano dal
    // server e possono presentarsi dopo questo momento).
    this.netPrices.set({
      sellingPrice: initial.sellingPrice,
      compareAtPrice: initial.compareAtPrice,
      shopifyPrice: initial.shopifyPrice,
      listino1Price: initial.listino1Price,
      listino2Price: initial.listino2Price,
      listino3Price: initial.listino3Price,
    });
    this.articleVatCodeId.set(initial.defaultVatCodeId);

    // Ogni prezzo digitato aggiorna il netto corrispondente: è l'unico momento in
    // cui il dato cambia. In modalità netta la conversione è l'identità.
    for (const field of PRICE_FIELDS) {
      this.form.controls[field].valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((displayed) => this.storeNet(field, displayed));
    }

    // Cambio Codice IVA: cambia l'aliquota, quindi la vista si ricalcola dal
    // netto (che resta il prezzo dell'articolo, non cambia perché cambia l'IVA).
    this.form.controls.defaultVatCodeId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.articleVatCodeId.set(value));

    // Prezzo Shopify (§B): il follow parte attivo solo se all'apertura i due
    // prezzi coincidono; se già divergono, l'operatore li ha diversificati e il
    // valore Shopify va protetto.
    this.shopifyFollowsArticle.set(initial.shopifyPrice === initial.sellingPrice);
    this.shopifyPriceValue.set(initial.shopifyPrice);

    // Il prezzo articolo trascina il prezzo Shopify finché il follow è attivo. Il
    // set usa emitEvent:false: NON deve apparire come un edit dell'operatore, così
    // `shopifyPrice.valueChanges` resta un segnale puro di modifica manuale.
    // Proprio perché non emette, il netto va aggiornato qui a mano.
    this.form.controls.sellingPrice.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (this.shopifyFollowsArticle() && this.form.controls.shopifyPrice.value !== value) {
          this.form.controls.shopifyPrice.setValue(value, { emitEvent: false });
          this.shopifyPriceValue.set(value);
          this.storeNet('shopifyPrice', value);
        }
      });

    // Edit manuale del prezzo Shopify: il follow si spegne e il campo diventa
    // indipendente (i set programmatici sopra non passano di qui).
    this.form.controls.shopifyPrice.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.shopifyFollowsArticle.set(false);
        this.shopifyPriceValue.set(value);
      });

    // La sottocategoria segue la categoria: al cambio si azzera (le voci
    // proposte sono filtrate sulla categoria selezionata).
    let previousCategory = initial.category.trim().toLowerCase();
    this.form.controls.category.valueChanges
      .pipe(startWith(initial.category), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.categoryValue.set(value);
        const normalized = value.trim().toLowerCase();
        if (normalized !== previousCategory) {
          previousCategory = normalized;
          if (this.form.controls.subcategory.value !== '') {
            this.form.controls.subcategory.setValue('');
          }
          this.customSubcategory.set(false);
          this.subcategoryManagerOpen.set(false);
        }
      });

    this.form.controls.subcategory.valueChanges
      .pipe(startWith(initial.subcategory), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.subcategoryValue.set(value));

    this.form.controls.season.valueChanges
      .pipe(startWith(initial.season), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.seasonValue.set(value));

    this.valueChangesSub = this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.valueChange.emit(this.currentDraft()));

    this.formReady = true;
  }

  /**
   * Draft emesso verso il parent: i campi del form, ma con i prezzi presi dal
   * netto. Fuori da questo componente esiste una sola forma del prezzo, la
   * canonica; la modalità ivata resta un modo di guardarlo.
   */
  private currentDraft(): ProductGeneralDraft {
    const prices = this.netPrices();
    return {
      ...this.form.getRawValue(),
      listino1Price: prices.listino1Price,
      listino2Price: prices.listino2Price,
      listino3Price: prices.listino3Price,
      // Un campo prezzo svuotato vale `null` a runtime, dove il draft dichiara
      // `number`: il valore passa così com'è e il parent blocca il salvataggio.
      // Sostituirlo con 0 salverebbe un prezzo che nessuno ha digitato.
      sellingPrice: prices.sellingPrice as number,
      shopifyPrice: prices.shopifyPrice as number,
      // Il barrato e' facoltativo: `null` significa «nessun prezzo barrato», e
      // non va confuso con zero — zero direbbe «esiste e vale zero».
      compareAtPrice: prices.compareAtPrice,
    };
  }

  /** Prezzo digitato -> netto memorizzato (identità in modalità netta). */
  private storeNet(field: PriceField, displayed: number | null): void {
    this.netPrices.update((prices) => ({ ...prices, [field]: this.toNet(displayed) }));
  }

  private toNet(displayed: number | null): number | null {
    if (displayed == null) {
      return null;
    }
    const rate = this.conversionRate();
    if (!this.pricesIncludeVat() || rate <= 0) {
      return displayed;
    }
    // Scorporo ESATTO: è il valore che viene memorizzato, e la coda decimale è
    // ciò che lo fa tornare identico quando il campo torna a mostrare l'ivato.
    return minorToMajor(netFromGrossExact(majorToMinor(displayed), rate));
  }

  /**
   * Netto memorizzato → numero da mettere nel campo. È un punto di USCITA: due
   * decimali, sempre. Anche in modalità netta, dove non c'è conversione da fare
   * ma il netto può portare la coda di uno scorporo precedente.
   */
  private toDisplayed(net: number | null, includeVat: boolean, rate: number): number | null {
    if (net == null) {
      return null;
    }
    if (!includeVat || rate <= 0) {
      return minorToMajor(roundToMinor(majorToMinor(net)));
    }
    return minorToMajor(grossFromNetMinor(majorToMinor(net), rate));
  }

  /**
   * Riscrive i campi prezzo dal netto memorizzato. `emitEvent: false` di
   * proposito: cambiare unità di misura della vista non è una modifica
   * dell'articolo e non deve sporcare il form né rimbalzare sul netto.
   */
  private showNetPrices(includeVat: boolean, rate: number): void {
    const prices = this.netPrices();
    for (const field of PRICE_FIELDS) {
      const control = this.form.controls[field];
      const displayed = this.toDisplayed(prices[field], includeVat, rate);
      if (control.value !== displayed) {
        control.setValue(displayed, { emitEvent: false });
      }
    }
    this.shopifyPriceValue.set(this.form.controls.shopifyPrice.value);
  }

  /** Toggle netti/ivati: cambia solo la vista (vedi `showNetPrices`). */
  protected onPriceModeChange(value: string): void {
    this.pricesIncludeVat.set(value === 'gross');
  }

  protected showError(field: RequiredField): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  /** Errore prezzo di vendita articolo (obbligatorio, non negativo). */
  protected showSellingPriceError(): boolean {
    const control = this.form.controls.sellingPrice;
    return control.invalid && control.touched;
  }

  /**
   * Messaggio d'errore del codice articolo (vicino al campo, mai solo toast):
   * obbligatorio (in modifica), formato, unicità (verifica live dal parent).
   */
  protected articleCodeError(): string | null {
    const control = this.form.controls.articleCode;
    const value = control.value.trim();
    if (control.touched && control.hasError('required')) {
      return ARTICLE_CODE_REQUIRED_MESSAGE;
    }
    if (value && control.hasError('pattern')) {
      return ARTICLE_CODE_FORMAT_MESSAGE;
    }
    const takenBy = this.articleCodeTakenBy();
    if (value && takenBy) {
      return `Codice articolo già utilizzato da ${takenBy}.`;
    }
    return null;
  }

  /** Normalizzazione visiva §case-insensitive: al blur il codice va in MAIUSCOLO. */
  protected onArticleCodeBlur(): void {
    const control = this.form.controls.articleCode;
    const normalized = normalizeArticleCode(control.value);
    if (normalized !== control.value) {
      control.setValue(normalized);
    }
    control.markAsTouched();
  }

  /** Codice caricato all'apertura, mostrato sul pulsante "Ripristina". */
  protected initialArticleCodeValue(): string {
    return this.initialArticleCode;
  }

  /** "Ripristina" visibile quando il codice caricato e' stato cancellato/modificato. */
  protected canRestoreArticleCode(): boolean {
    if (!this.editMode() || !this.initialArticleCode) {
      return false;
    }
    return normalizeArticleCode(this.form.controls.articleCode.value) !== this.initialArticleCode;
  }

  /**
   * Riporta il codice a quello previsto prima della cancellazione (mai
   * rigenerato in silenzio: la scelta resta esplicita dell'operatore).
   */
  protected restoreArticleCode(): void {
    this.form.controls.articleCode.setValue(this.initialArticleCode);
    this.form.controls.articleCode.markAsTouched();
  }

  protected onStatusSelect(value: string | null): void {
    if (value) {
      this.form.controls.status.setValue(value as ProductStatus);
    }
  }

  protected onUomSelect(value: string | null): void {
    if (value) {
      this.form.controls.unitOfMeasure.setValue(value);
    }
  }

  protected onVatSelect(value: string | null): void {
    this.form.controls.defaultVatCodeId.setValue(value ?? '');
  }

  protected onTrackingSelect(value: string | null): void {
    if (value) {
      this.form.controls.inventoryTracking.setValue(value as InventoryTrackingMode);
    }
  }

  /**
   * Tipo Articolo/Servizio. Un Servizio non genera movimenti né conta in
   * giacenza: al passaggio si propongono gestione magazzino OFF e nessun
   * tracciamento (l'operatore può comunque modificarli).
   */
  protected onKindSelect(value: string | null): void {
    if (!value) {
      return;
    }
    const kind = value as ProductKind;
    this.form.controls.kind.setValue(kind);
    if (kind === ProductKind.Service) {
      this.form.controls.managesStock.setValue(false);
      this.form.controls.inventoryTracking.setValue(InventoryTrackingMode.None);
    } else {
      this.form.controls.managesStock.setValue(true);
      this.form.controls.inventoryTracking.setValue(InventoryTrackingMode.Standard);
    }
  }

  protected vatSelectValue(): string {
    return this.form.controls.defaultVatCodeId.value;
  }

  protected onCategorySelect(value: string | null): void {
    if (value === CUSTOM_OPTION_VALUE) {
      this.customCategory.set(true);
      this.form.controls.category.setValue('');
      this.form.controls.category.markAsTouched();
      return;
    }
    if (value) {
      this.customCategory.set(false);
      this.form.controls.category.setValue(value);
    }
  }

  protected onSubcategorySelect(value: string | null): void {
    if (value === CUSTOM_OPTION_VALUE) {
      this.customSubcategory.set(true);
      this.form.controls.subcategory.setValue('');
      this.form.controls.subcategory.markAsTouched();
      return;
    }
    this.customSubcategory.set(false);
    this.form.controls.subcategory.setValue(value ?? '');
  }

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
  }

  // ── Gestione inline categorie/sottocategorie ──────────────────────────────

  protected toggleCategoryManager(): void {
    this.subcategoryManagerOpen.set(false);
    this.categoryManagerOpen.update((open) => !open);
  }

  /**
   * Apre la gestione sottocategorie della categoria selezionata. Se la
   * categoria è solo testo (non ancora a vocabolario) viene prima creata,
   * così le sottocategorie hanno una voce padre a cui agganciarsi.
   */
  protected toggleSubcategoryManager(): void {
    if (this.subcategoryManagerOpen()) {
      this.subcategoryManagerOpen.set(false);
      return;
    }
    const categoryName = this.categoryValue().trim();
    if (!categoryName || this.ensuringCategory()) {
      return;
    }
    this.categoryManagerOpen.set(false);
    if (this.managedCategory()) {
      this.subcategoryManagerOpen.set(true);
      return;
    }
    this.ensuringCategory.set(true);
    this.catalogCategoryService
      .create(categoryName, null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ensuringCategory.set(false);
          this.categoriesChanged.emit();
          this.subcategoryManagerOpen.set(true);
        },
        error: () => this.ensuringCategory.set(false),
      });
  }

  /** Voce creata dal manager: selezionala subito nel campo corrispondente. */
  protected onCategoryCreated(entry: CatalogCategory): void {
    this.customCategory.set(false);
    this.form.controls.category.setValue(entry.name);
  }

  protected onSubcategoryCreated(entry: CatalogCategory): void {
    this.customSubcategory.set(false);
    this.form.controls.subcategory.setValue(entry.name);
  }

  protected useSubcategorySelect(): boolean {
    return !this.customSubcategory() && this.subcategoryEntries().length > 0;
  }

  protected onSeasonSelect(value: string | null): void {
    if (value === PRODUCT_SEASON_CUSTOM_OPTION) {
      this.customSeason.set(true);
      this.form.controls.season.setValue('');
      return;
    }
    if (value === null || value === '') {
      this.customSeason.set(false);
      this.form.controls.season.setValue('');
      return;
    }
    this.customSeason.set(false);
    this.form.controls.season.setValue(value);
  }

  protected onTaxonomyChange(selection: ShopifyTaxonomySelection | null): void {
    this.taxonomyTouched.set(true);
    const previousCategoryId = this.form.controls.shopifyTaxonomyCategoryId.value.trim();
    const nextCategoryId = selection?.id ?? '';
    this.form.patchValue({
      shopifyTaxonomyCategoryId: nextCategoryId,
      shopifyTaxonomyCategoryFullName: selection?.fullName ?? '',
      ...(previousCategoryId !== nextCategoryId
        ? { shopifyCategoryMetafields: [] as readonly ShopifyCategoryMetafieldValue[] }
        : {}),
    });
  }

  protected onCategoryMetafieldsChange(values: readonly ShopifyCategoryMetafieldValue[]): void {
    this.form.controls.shopifyCategoryMetafields.setValue(values);
  }

  protected categoryMetafieldsValue(): readonly ShopifyCategoryMetafieldValue[] {
    return this.form.controls.shopifyCategoryMetafields.value;
  }

  // La Categoria VestiFlow è sempre presente, anche con Shopify attivo: la
  // Categoria Shopify (tassonomia) è un campo separato aggiuntivo.
  protected useCategorySelect(): boolean {
    return this.categoryNamePool().length > 0 && !this.customCategory();
  }

  protected useSeasonSelect(): boolean {
    return !this.customSeason();
  }

  private withCurrent(list: readonly string[], current: string): readonly string[] {
    const value = current.trim();
    return value && !list.includes(value) ? [value, ...list] : list;
  }

  private shouldUseCustomField(value: string, facets: readonly string[]): boolean {
    if (facets.length === 0) {
      return true;
    }
    const trimmed = value.trim();
    return trimmed !== '' && !facets.includes(trimmed);
  }
}
