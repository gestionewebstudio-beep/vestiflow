import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { STORE_SALE_MODE_ROUTE_DATA_KEY } from '@domain/store-sales/models/store-sale-routing.util';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import type { VatCode } from '@core/models/vat-code.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { LocationContextService } from '@core/services/location-context.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ProductService } from '@domain/products/services/product.service';

import type { StoreSaleLookupItem } from '@domain/store-sales/models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';
import { StoreSaleRegisterComponent } from './store-sale-register.component';

const LOCATION = { id: 'loc-1', name: 'Negozio Milano' };
const EAN = '8001234567890';

const ITEM: StoreSaleLookupItem = {
  variantId: 'var-1',
  sku: 'MAG-001',
  barcode: EAN,
  productName: 'Maglietta Basic',
  optionSummary: 'M / Bianco',
  sellingPriceMinor: 1990,
  currency: 'EUR',
  vatRatePercent: 22,
  vatCodeId: 'vat-22',
  vatCodeLabel: '22',
  onHand: 5,
  committed: 0,
  available: 5,
};

const VAT_22: VatCode = {
  id: 'vat-22',
  code: '22',
  natureId: 'nat-1',
  nature: {
    id: 'nat-1',
    key: 'imponibile',
    officialCode: null,
    label: 'Imponibile',
    description: null,
    defaultUsageScope: 'both',
    defaultCalculationMode: 'standard',
    sortOrder: 1,
  },
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'Imponibile 22%',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: true,
  isActive: true,
  isSystem: true,
  sortOrder: 1,
};

const ZERO_MONEY = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

/**
 * Vendita/Reso esistenti da RISALVARE (T1/T2): due righe, ognuna col proprio
 * `DocumentLine.id` — è quello che il payload deve rimandare al server per
 * far AGGIORNARE la riga invece di duplicarla. `patchFromDocument` scrive
 * questo id in ENTRAMBI `uiId` e `serverLineId` (§docblock `DocumentLineDraft`);
 * i test verificano che solo `serverLineId` finisca nel payload.
 */
const SALE_DOC: DocumentRecord = {
  id: 'doc-sale-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
  type: DocumentType.StoreSale,
  status: DocumentStatus.Confirmed,
  series: '',
  number: 12,
  year: 2026,
  documentDate: '2026-08-10',
  currency: DEFAULT_CURRENCY,
  subtotal: ZERO_MONEY,
  tax: ZERO_MONEY,
  total: ZERO_MONEY,
  pricesIncludeVat: true,
  createdByName: 'Operatore',
  locationId: LOCATION.id,
  lines: [
    {
      id: 'line-sale-A',
      lineNumber: 1,
      variantId: 'var-1',
      sku: ITEM.sku,
      description: 'Maglietta Basic — M / Bianco',
      quantity: 1,
      unitPrice: { amountMinor: 1990, currencyCode: DEFAULT_CURRENCY },
      discountPercent: 0,
      lineTotal: { amountMinor: 1990, currencyCode: DEFAULT_CURRENCY },
      loadsStock: true,
      vatCodeId: 'vat-22',
      vatSnapshot: { ratePercent: 22 },
    },
    {
      id: 'line-sale-B',
      lineNumber: 2,
      variantId: 'var-2',
      sku: 'SKU-2',
      description: 'Felpa — L / Grigio',
      quantity: 2,
      unitPrice: { amountMinor: 2500, currencyCode: DEFAULT_CURRENCY },
      discountPercent: 0,
      lineTotal: { amountMinor: 5000, currencyCode: DEFAULT_CURRENCY },
      loadsStock: true,
      vatCodeId: 'vat-22',
      vatSnapshot: { ratePercent: 22 },
    },
  ],
} as unknown as DocumentRecord;

/** Reso esistente da risalvare — stessa forma, tipo diverso. */
const RETURN_DOC: DocumentRecord = {
  ...SALE_DOC,
  id: 'doc-return-1',
  type: DocumentType.StoreReturn,
  lines: [
    { ...SALE_DOC.lines![0]!, id: 'line-return-A' },
    { ...SALE_DOC.lines![1]!, id: 'line-return-B' },
  ],
};

/** Chi sta al banco: permessi di cassa più quelli sotto esame. */
const CASSA_COMPLETA = [
  TenantPermission.RetailRegister,
  TenantPermission.SectionSales,
  TenantPermission.SectionInventory,
  TenantPermission.CatalogManage,
] as readonly string[];

/** Commesso puro: batte gli scontrini e basta. */
const SOLO_CASSA = [
  TenantPermission.RetailRegister,
  TenantPermission.SectionSales,
] as readonly string[];

function operatore(permissions: readonly string[]) {
  return {
    id: 'usr-1',
    role: UserRole.Clerk,
    permissions,
    tenantChannelProfile: TenantChannelProfile.Gestionale,
  };
}

/** Stub Web Audio API: verifica il beep di errore senza audio reale. */
function stubAudioContext() {
  const oscillatorStart = vi.fn();
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    close = vi.fn(() => Promise.resolve());
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: vi.fn(),
      };
    }
    createGain() {
      return { gain: { value: 0 }, connect: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { oscillatorStart };
}

describe('StoreSaleRegisterComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup(options?: {
    readonly variantIdByCode?: string | null;
    readonly lookupItems?: readonly StoreSaleLookupItem[];
    readonly createSale?: ReturnType<typeof vi.fn>;
    readonly createReturn?: ReturnType<typeof vi.fn>;
    readonly permissions?: readonly string[];
    /** Il modo che la ROTTA dichiara. Default: vendita. */
    readonly mode?: 'sale' | 'return';
    /** Id in rotta (T1/T2): presente = modifica di un documento esistente. */
    readonly editId?: string;
    /** Documento che `DocumentService.getDocumentById` risolve in modifica. */
    readonly loadDocument?: DocumentRecord;
  }) {
    const variantId = options?.variantIdByCode;
    const findVariantByCode = vi.fn(() =>
      variantId
        ? of({ variantId, productId: 'prod-1', sku: ITEM.sku, barcode: EAN, productName: '' })
        : throwError(() => ({ status: 404 })),
    );
    const lookupItems = vi.fn(() => of(options?.lookupItems ?? []));
    const createProduct = vi.fn(() => of({ id: 'prod-new' }));
    const getProductVariants = vi.fn(() => of([{ id: 'var-new' }]));
    const searchVariantSummaries = vi.fn((query?: { variantId?: string }) => {
      if (query?.variantId === 'var-new') {
        return of([
          {
            variantId: 'var-new',
            productId: 'prod-new',
            sku: '',
            productName: 'Articolo rapido',
            title: 'Articolo rapido',
            barcode: EAN,
            sellingPrice: { amountMinor: 990, currencyCode: 'EUR' },
          },
        ]);
      }
      return of([]);
    });

    const rendered = await render(StoreSaleRegisterComponent, {
      providers: [
        provideRouter([]),
        // ⛔ La maschera pretende il modo dai `data` della rotta e LANCIA se
        // manca: i due modi hanno effetti di magazzino opposti, e un fallback
        // silenzioso farebbe compilare una vendita a chi ha aperto un reso.
        // Questi test rendono il componente fuori da una rotta vera, quindi il
        // dato va fornito qui — ed è giusto che senza non partano.
        {
          provide: ActivatedRoute,
          useValue: {
            // ⚠️ Doppio COMPLETO, non solo lo `snapshot`: il pannello di
            // creazione rapida monta `ProductFormComponent`, che legge
            // `route.data` come flusso e `paramMap` dallo snapshot. Un finto
            // parziale non fallisce dove manca — esplode dentro un altro
            // componente, con uno stack che non nomina questo file.
            snapshot: {
              data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: options?.mode ?? 'sale' },
              paramMap: convertToParamMap(options?.editId ? { id: options.editId } : {}),
              queryParamMap: convertToParamMap({}),
              params: {},
              queryParams: {},
            },
            data: of({ [STORE_SALE_MODE_ROUTE_DATA_KEY]: options?.mode ?? 'sale' }),
            paramMap: of(convertToParamMap(options?.editId ? { id: options.editId } : {})),
            queryParamMap: of(convertToParamMap({})),
            params: of({}),
            queryParams: of({}),
          },
        },
        // T1/T2: la pipeline di caricamento (`editDocumentId` → `getDocumentById`)
        // esiste comunque — inject() la risolve alla costruzione, anche quando
        // nessun test la esercita. Fuori dalla modalità modifica il mock non
        // viene mai chiamato: `editDocumentId()` resta null e il `switchMap`
        // si ferma prima.
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(() => of(options?.loadDocument ?? SALE_DOC)),
          },
        },
        {
          provide: APP_CONFIG,
          useValue: {
            production: false,
            appName: 'VestiFlow',
            apiBaseUrl: 'http://localhost:3000/api/v1',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        {
          provide: StoreSalesService,
          useValue: {
            lookupItems,
            createSale: options?.createSale ?? vi.fn(),
            createReturn: options?.createReturn ?? vi.fn(),
          },
        },
        {
          provide: ProductService,
          useValue: {
            findVariantByCode,
            searchVariantSummaries,
            createProduct,
            getProductVariants,
            getFilterOptions: vi.fn(() => of({ categories: [], brands: [], productTypes: [] })),
            checkSkuAvailability: vi.fn(() => of({ available: true, taken: [] })),
            checkBarcodeAvailability: vi.fn(() => of({ available: true, taken: [] })),
            // Modalità prezzi della sezione Listini nell'anagrafica embedded.
            getPriceModePreference: vi.fn(() => of(false)),
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: {
            actionLocations: () => [LOCATION],
            isFixedSingleStore: () => true,
            fixedSingleStoreLocationId: () => LOCATION.id,
            fixedSingleStoreLabel: () => LOCATION.name,
          },
        },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => LOCATION.id, setActiveLocation: vi.fn() },
        },
        { provide: VatCodeService, useValue: { list: () => of([VAT_22]) } },
        {
          provide: AuthService,
          useValue: { currentUser: () => operatore(options?.permissions ?? CASSA_COMPLETA) },
        },
        { provide: ShopifyConnectionService, useValue: { getConnection: () => of(null) } },
      ],
    });

    return {
      findVariantByCode,
      lookupItems,
      createProduct,
      getProductVariants,
      fixture: rendered.fixture,
    };
  }

  async function scan(code: string) {
    const user = userEvent.setup();
    const input = screen.getByLabelText<HTMLInputElement>('Barcode, SKU o nome prodotto');
    await user.clear(input);
    await user.type(input, `${code}{Enter}`);
    return input;
  }

  it('scansione con match esatto: riga con quantità 1, poi incremento sulla stessa variante', async () => {
    await setup({ variantIdByCode: 'var-1', lookupItems: [ITEM] });

    const input = await scan(EAN);

    expect(await screen.findByText('Maglietta Basic — M / Bianco')).toBeVisible();
    const qty = screen.getByLabelText<HTMLInputElement>(`Quantità ${ITEM.sku}`);
    expect(qty.value).toBe('1');
    // Il campo scansione si svuota e mantiene il focus per la scansione successiva.
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);

    await scan(EAN);
    expect(qty.value).toBe('2');
  });

  it('parsa il prefisso quantità «3*codice» in una sola riga da 3 pezzi', async () => {
    await setup({ variantIdByCode: 'var-1', lookupItems: [ITEM] });

    await scan(`3*${EAN}`);

    const qty = await screen.findByLabelText<HTMLInputElement>(`Quantità ${ITEM.sku}`);
    expect(qty.value).toBe('3');
  });

  it('EAN non trovato: nessuna riga, beep, messaggio e azioni di recupero', async () => {
    const { oscillatorStart } = stubAudioContext();
    await setup({ variantIdByCode: null, lookupItems: [] });

    const input = await scan(EAN);

    expect(await screen.findByText('Articolo non trovato.')).toBeVisible();
    // Nessuna riga incompleta: il carrello resta vuoto.
    expect(
      screen.getByText(
        'Il carrello è vuoto. Scansiona un barcode o cerca un prodotto per iniziare.',
      ),
    ).toBeVisible();
    expect(oscillatorStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cerca articolo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crea articolo rapido' })).toBeVisible();
    // Focus ancora sul campo scansione, con il codice selezionato per riscansione.
    expect(document.activeElement).toBe(input);
  });

  it('senza gestione catalogo: niente «Crea articolo rapido», resta scritto a chi chiederlo', async () => {
    stubAudioContext();
    await setup({ variantIdByCode: null, lookupItems: [], permissions: SOLO_CASSA });

    await scan(EAN);

    expect(await screen.findByText('Articolo non trovato.')).toBeVisible();
    // La ricerca resta: è l'unica delle due azioni che il server consente.
    expect(screen.getByRole('button', { name: 'Cerca articolo' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Crea articolo rapido' })).toBeNull();
    expect(
      screen.getByText(
        'Questo articolo non è ancora a catalogo: chiedi a un responsabile di inserirlo.',
      ),
    ).toBeVisible();
  });

  it('senza la sezione Magazzino il collegamento allo storico movimenti non compare', async () => {
    await setup({ permissions: SOLO_CASSA });

    expect(screen.queryByRole('link', { name: 'Storico movimenti' })).toBeNull();
  });

  it('crea articolo rapido: prefill EAN, variante creata in carrello con quantità 1, pannello chiuso', async () => {
    const user = userEvent.setup();
    const { createProduct, lookupItems } = await setup({ variantIdByCode: null, lookupItems: [] });

    await scan(EAN);
    await screen.findByText('Articolo non trovato.');

    await user.click(screen.getByRole('button', { name: 'Crea articolo rapido' }));

    // Pannello con ProductFormComponent embedded: EAN precompilato dal codice scansionato.
    const panel = await screen.findByRole('dialog');
    const eanField = await within(panel).findByDisplayValue<HTMLInputElement>(EAN);
    expect(eanField.id).toBe('quick-variant-ean');

    await user.type(within(panel).getByLabelText('Nome prodotto'), 'Articolo rapido');

    // La riga creata viene risolta dal lookup di cassa (prezzo/IVA/disponibilità).
    lookupItems.mockReturnValue(
      of([
        {
          ...ITEM,
          variantId: 'var-new',
          sku: '',
          productName: 'Articolo rapido',
          optionSummary: '',
          sellingPriceMinor: 990,
          onHand: 0,
          committed: 0,
          available: 0,
        },
      ]),
    );

    await user.click(within(panel).getByRole('button', { name: 'Salva e aggiungi al documento' }));

    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Articolo rapido')).toBeVisible();
    const qty = screen.getByLabelText<HTMLInputElement>(/^Quantità/);
    expect(qty.value).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('conclude vendita con metodo «Altro»: invia il codice other e la nota libera', async () => {
    const createSale = vi.fn(() =>
      of({
        id: 'doc-1',
        reference: 'VN-2026-0001',
        documentDate: '2026-07-22',
        totalMinor: 1990,
        currency: 'EUR',
        lines: [],
      }),
    );
    const { fixture } = await setup({
      variantIdByCode: 'var-1',
      lookupItems: [ITEM],
      createSale,
    });
    await scan(EAN);

    // Metodo «Altro» con descrizione libera: il codice resta 'other' (il filtro
    // dell'elenco continua a funzionare) e il testo viaggia in paymentMethodNote.
    const component = fixture.componentInstance as unknown as {
      paymentMethod: { set(value: string): void };
      paymentOtherText: { set(value: string): void };
      concludeSale(): void;
    };
    component.paymentMethod.set('other');
    component.paymentOtherText.set('Assegno');
    component.concludeSale();

    expect(createSale).toHaveBeenCalledTimes(1);
    expect(createSale).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'other', paymentMethodNote: 'Assegno' }),
    );
  });

  // Il prezzo dell'articolo è netto; al banco si vede e si digita ivato.
  it('mostra il prezzo ivato e manda al server il netto', async () => {
    const createSale = vi.fn(() =>
      of({
        id: 'doc-1',
        reference: 'VN-2026-0001',
        documentDate: '2026-07-22',
        totalMinor: 2428,
        currency: 'EUR',
        lines: [],
      }),
    );
    const user = userEvent.setup();
    const { fixture } = await setup({
      variantIdByCode: 'var-1',
      lookupItems: [ITEM],
      createSale,
    });
    await scan(EAN);

    // 19,90 netti al 22% → 24,28 nel campo prezzo e nel totale di cassa.
    const price = await screen.findByLabelText<HTMLInputElement>(`Prezzo unitario ${ITEM.sku}`);
    expect(price.value).toBe('24,28');
    // Totale riga e totale di cassa: entrambi il lordo che il cliente paga.
    expect(screen.getAllByText(/24,28/).length).toBeGreaterThan(0);

    // L'operatore arrotonda a 25,00 al banco: al server va il netto scorporato,
    // con la coda decimale (§sei decimali) — è quella a far tornare 25,00 nel
    // campo, che infatti resta 25,00 e non 24,99.
    await user.clear(price);
    await user.type(price, '25,00');
    await user.tab();
    expect(price.value).toBe('25,00');

    const component = fixture.componentInstance as unknown as { concludeSale(): void };
    component.concludeSale();

    expect(createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ unitPriceMinor: 2049.1803 })],
      }),
    );
  });

  it('guard di uscita: consente a carrello vuoto, chiede conferma con lavoro in corso', async () => {
    const { fixture } = await setup({ variantIdByCode: 'var-1', lookupItems: [ITEM] });
    const component = fixture.componentInstance as unknown as {
      canDeactivate(): boolean | Promise<boolean>;
      confirmExitWithoutSaving(): void;
      cart: () => readonly unknown[];
    };

    expect(component.canDeactivate()).toBe(true);

    await scan(EAN);
    const pending = component.canDeactivate();
    expect(pending).toBeInstanceOf(Promise);

    // «Esci senza salvare» svuota il carrello e lascia proseguire l'uscita.
    component.confirmExitWithoutSaving();
    await expect(pending).resolves.toBe(true);
    expect(component.cart().length).toBe(0);
  });
  /**
   * ⛔ FASE UI 2 — il tipo lo decide la ROTTA, e la maschera non lo cambia.
   *
   * L'interruttore Vendita / Reso è caduto il 19/08/2026: era l'unica strada per
   * trovarsi a compilare un reso su una pagina che dice «Nuova vendita». Le
   * diramazioni funzionali restano — Vendita e Reso fanno cose opposte in
   * magazzino — ma leggono tutte lo stesso `mode`, che viene dai `data` della
   * rotta e non si scrive più.
   */
  describe('il tipo viene dalla rotta', () => {
    it('rotta Vendita → maschera Vendita', async () => {
      await setup({ mode: 'sale' });

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nuova vendita al banco');
      // La sezione della vendita c'è, quella del reso no.
      expect(screen.queryByRole('heading', { name: /aggiungi articoli/i })).not.toBeNull();
    });

    it('rotta Reso → maschera Reso', async () => {
      await setup({ mode: 'return' });

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nuovo reso al banco');
    });

    /**
     * ⚠️ La sottotestata dichiarava lo SCARICO della giacenza: su un reso è il
     * contrario di quello che succede. Finché il tipo si cambiava da dentro non
     * si notava; con due indirizzi distinti sarebbe stata una pagina che mente.
     */
    it('⚠️ sulla Vendita la sottotestata dichiara lo SCARICO', async () => {
      const { fixture } = await setup({ mode: 'sale' });
      const testo = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(testo).toContain('vengono scaricate');
    });

    it('⚠️ sul Reso dichiara il RIENTRO, che è il contrario', async () => {
      const { fixture } = await setup({ mode: 'return' });
      const testo = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(testo).toContain('rientra in giacenza');
      // Finché il tipo si cambiava da dentro non si notava; con due indirizzi
      // distinti sarebbe stata una pagina che dice il falso.
      expect(testo).not.toContain('vengono scaricate');
    });

    it('⛔ NESSUN controllo consente di cambiare tipo', async () => {
      await setup({ mode: 'sale' });

      // L'interruttore era un `role="tablist"` con due `role="tab"`.
      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      // E nessun comando che si chiami come i due tipi.
      expect(screen.queryByRole('button', { name: /^vendita$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^reso$/i })).toBeNull();
    });

    it('⛔ nemmeno sulla rotta Reso ricompare un modo per tornare a Vendita', async () => {
      await setup({ mode: 'return' });

      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });
  });

  /**
   * ⛔ T1/T2 — il client impara a mandare gli id (21/08/2026).
   *
   * Il server sa già risalvare (`dto.id` branch, già testato lato API in
   * `store-sales.service.spec.ts`): qui si verifica SOLO che il client li
   * mandi, con la distinzione che conta — `uiId` (identità di sessione, mai
   * nel payload) contro `serverLineId` (id vero, l'unico che parte).
   *
   * ⚠️ Sul Reso le righe si seminano DIRETTAMENTE su `returnLines`, non via
   * ricerca/scansione: quella UI è oggi dentro `@if (mode() === 'sale')`
   * (O1, mappa di riuso) e `patchFromDocument` non scrive mai `returnLines`
   * (O2) — due difetti già censiti, NON di questo commit. Questi test
   * verificano il contratto di `concludeReturn()` in isolamento da quei due
   * gap, non l'intero percorso utente che oggi non esiste ancora.
   */
  describe('T1/T2 — id documento e id riga nel payload', () => {
    /** Sottoinsieme di `DocumentLineDraft` (privata al componente) che i test toccano. */
    interface TestDraftLine {
      readonly uiId: string;
      readonly serverLineId: string | null;
      readonly variantId: string;
      readonly sku: string;
      readonly description: string;
      readonly unitPriceMinor: number;
      readonly quantity: number;
      readonly discountPercent: number;
      readonly vatRatePercent: number | null;
      readonly vatCodeId: string | null;
      /** T3 — il riferimento congelato al caricamento; `null` su riga nuova. */
      readonly persistedVatCodeId: string | null;
      readonly onHand: number;
      readonly committed: number;
      readonly available: number;
    }

    function componentOf(fixture: { componentInstance: unknown }) {
      return fixture.componentInstance as {
        cart: {
          set(v: readonly TestDraftLine[]): void;
          update(fn: (v: readonly TestDraftLine[]) => readonly TestDraftLine[]): void;
        };
        returnLines: { set(v: readonly unknown[]): void };
        removeLine(uiId: string): void;
        /** T3: la via REALE con cui l'operatore cambia l'IVA di una riga. */
        onLineVatSelect(uiId: string, value: string | null): void;
        concludeSale(): void;
        concludeReturn(): void;
      };
    }

    describe('Vendita', () => {
      it('nuova vendita, una riga via scansione → nessun id documento né riga', async () => {
        const createSale = vi.fn((_body: unknown) =>
          of({
            id: 'doc-new',
            reference: 'VN-1',
            documentDate: '2026-08-21',
            totalMinor: 1990,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({
          variantIdByCode: 'var-1',
          lookupItems: [ITEM],
          createSale,
        });
        await scan(EAN);

        componentOf(fixture).concludeSale();

        expect(createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            id: undefined,
            lines: [expect.objectContaining({ id: undefined, variantId: 'var-1' })],
          }),
        );
      });

      it('nuova vendita, più righe → nessun id inventato su nessuna riga', async () => {
        const createSale = vi.fn((_body: unknown) =>
          of({
            id: 'doc-new',
            reference: 'VN-1',
            documentDate: '2026-08-21',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({ createSale });
        const component = componentOf(fixture);

        // Due righe seminate direttamente: il contratto sotto test è cosa
        // ESCE nel payload, non il percorso di ricerca (già coperto sopra).
        component.cart.set([
          {
            uiId: 'ui-1',
            serverLineId: null,
            variantId: 'var-1',
            sku: 'A',
            description: 'A',
            unitPriceMinor: 1000,
            quantity: 1,
            discountPercent: 0,
            vatRatePercent: 22,
            vatCodeId: 'vat-22',
            persistedVatCodeId: null,
            onHand: 0,
            committed: 0,
            available: 0,
          },
          {
            uiId: 'ui-2',
            serverLineId: null,
            variantId: 'var-2',
            sku: 'B',
            description: 'B',
            unitPriceMinor: 2000,
            quantity: 1,
            discountPercent: 0,
            vatRatePercent: 22,
            vatCodeId: 'vat-22',
            persistedVatCodeId: null,
            onHand: 0,
            committed: 0,
            available: 0,
          },
        ]);

        component.concludeSale();

        expect(createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            id: undefined,
            lines: [
              expect.objectContaining({ id: undefined, variantId: 'var-1' }),
              expect.objectContaining({ id: undefined, variantId: 'var-2' }),
            ],
          }),
        );
      });

      it('modifica vendita → id documento presente, righe esistenti con lo stesso id del server', async () => {
        const createSale = vi.fn((_body: unknown) =>
          of({
            id: SALE_DOC.id,
            reference: 'VN-12',
            documentDate: '2026-08-10',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({
          mode: 'sale',
          editId: SALE_DOC.id,
          loadDocument: SALE_DOC,
          createSale,
        });
        // Attende che patchFromDocument abbia scritto il carrello.
        await screen.findByText('Maglietta Basic — M / Bianco');

        componentOf(fixture).concludeSale();

        expect(createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'doc-sale-1',
            lines: [
              expect.objectContaining({ id: 'line-sale-A', variantId: 'var-1' }),
              expect.objectContaining({ id: 'line-sale-B', variantId: 'var-2' }),
            ],
          }),
        );
      });

      it('modifica: riga nuova senza id, riga rimossa assente dal payload, riga rimasta col suo id', async () => {
        const createSale = vi.fn((_body: unknown) =>
          of({
            id: SALE_DOC.id,
            reference: 'VN-12',
            documentDate: '2026-08-10',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({
          mode: 'sale',
          editId: SALE_DOC.id,
          loadDocument: SALE_DOC,
          createSale,
        });
        await screen.findByText('Maglietta Basic — M / Bianco');
        const component = componentOf(fixture);

        // Riga nuova aggiunta IN SESSIONE: uiId di sessione, nessun serverLineId.
        component.cart.update((lines) => [
          ...lines,
          {
            uiId: 'ui-new',
            serverLineId: null,
            variantId: 'var-3',
            sku: 'C',
            description: 'Nuova',
            unitPriceMinor: 500,
            quantity: 1,
            discountPercent: 0,
            vatRatePercent: 22,
            vatCodeId: 'vat-22',
            persistedVatCodeId: null,
            onHand: 0,
            committed: 0,
            available: 0,
          },
        ]);
        // Riga caricata rimossa: su una riga da patchFromDocument uiId === serverLineId.
        component.removeLine('line-sale-B');

        component.concludeSale();

        const payload = createSale.mock.calls[0]![0] as {
          lines: readonly { id?: string; variantId: string }[];
        };
        expect(payload.lines).toHaveLength(2);
        expect(payload.lines.find((l) => l.variantId === 'var-1')?.id).toBe('line-sale-A');
        expect(payload.lines.find((l) => l.variantId === 'var-3')?.id).toBeUndefined();
        expect(payload.lines.some((l) => l.id === 'line-sale-B')).toBe(false);
      });
    });

    describe('Reso', () => {
      const RETURN_LINE_A = {
        uiId: 'line-return-A',
        serverLineId: 'line-return-A',
        variantId: 'var-1',
        sku: ITEM.sku,
        description: 'Maglietta Basic — M / Bianco',
        unitPriceMinor: 1990,
        vatRatePercent: 22,
        returnQuantity: 1,
        restockable: true,
      };
      const RETURN_LINE_B = {
        uiId: 'line-return-B',
        serverLineId: 'line-return-B',
        variantId: 'var-2',
        sku: 'SKU-2',
        description: 'Felpa — L / Grigio',
        unitPriceMinor: 2500,
        vatRatePercent: 22,
        returnQuantity: 2,
        restockable: true,
      };

      it('nuovo reso, una riga → nessun id documento né riga', async () => {
        const createReturn = vi.fn((_body: unknown) =>
          of({
            id: 'doc-r-new',
            reference: 'RS-1',
            documentDate: '2026-08-21',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({ mode: 'return', createReturn });
        const component = componentOf(fixture);
        component.returnLines.set([{ ...RETURN_LINE_A, uiId: 'ui-1', serverLineId: null }]);

        component.concludeReturn();

        expect(createReturn).toHaveBeenCalledWith(
          expect.objectContaining({
            id: undefined,
            lines: [expect.objectContaining({ id: undefined, variantId: 'var-1' })],
          }),
        );
      });

      it('nuovo reso, più righe → nessun id inventato su nessuna riga', async () => {
        const createReturn = vi.fn((_body: unknown) =>
          of({
            id: 'doc-r-new',
            reference: 'RS-1',
            documentDate: '2026-08-21',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({ mode: 'return', createReturn });
        const component = componentOf(fixture);
        component.returnLines.set([
          { ...RETURN_LINE_A, uiId: 'ui-1', serverLineId: null },
          { ...RETURN_LINE_B, uiId: 'ui-2', serverLineId: null },
        ]);

        component.concludeReturn();

        expect(createReturn).toHaveBeenCalledWith(
          expect.objectContaining({
            id: undefined,
            lines: [
              expect.objectContaining({ id: undefined, variantId: 'var-1' }),
              expect.objectContaining({ id: undefined, variantId: 'var-2' }),
            ],
          }),
        );
      });

      it('modifica reso → id documento presente, righe esistenti con lo stesso id del server', async () => {
        const createReturn = vi.fn((_body: unknown) =>
          of({
            id: RETURN_DOC.id,
            reference: 'RS-1',
            documentDate: '2026-08-10',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({
          mode: 'return',
          editId: RETURN_DOC.id,
          loadDocument: RETURN_DOC,
          createReturn,
        });
        const component = componentOf(fixture);
        // Seminate direttamente (O2: patchFromDocument non scrive returnLines
        // oggi — non è di questo commit): il contratto sotto test è il
        // payload di concludeReturn, non il caricamento.
        component.returnLines.set([RETURN_LINE_A, RETURN_LINE_B]);

        component.concludeReturn();

        expect(createReturn).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'doc-return-1',
            lines: [
              expect.objectContaining({ id: 'line-return-A', variantId: 'var-1' }),
              expect.objectContaining({ id: 'line-return-B', variantId: 'var-2' }),
            ],
          }),
        );
      });

      it('modifica: riga nuova senza id, riga rimossa assente dal payload, riga rimasta col suo id', async () => {
        const createReturn = vi.fn((_body: unknown) =>
          of({
            id: RETURN_DOC.id,
            reference: 'RS-1',
            documentDate: '2026-08-10',
            totalMinor: 0,
            currency: 'EUR',
            lines: [],
          }),
        );
        const { fixture } = await setup({
          mode: 'return',
          editId: RETURN_DOC.id,
          loadDocument: RETURN_DOC,
          createReturn,
        });
        const component = componentOf(fixture);
        // Solo A (caricata) + una nuova: B è la riga "rimossa", semplicemente
        // mai inclusa — così si toglie una riga in questa maschera oggi
        // (nessun elenco con eliminazione dedicata sul Reso).
        component.returnLines.set([
          RETURN_LINE_A,
          {
            uiId: 'ui-new',
            serverLineId: null,
            variantId: 'var-3',
            sku: 'C',
            description: 'Nuova',
            unitPriceMinor: 500,
            vatRatePercent: 22,
            returnQuantity: 1,
            restockable: true,
          },
        ]);

        component.concludeReturn();

        const payload = createReturn.mock.calls[0]![0] as {
          lines: readonly { id?: string; variantId: string }[];
        };
        expect(payload.lines).toHaveLength(2);
        expect(payload.lines.find((l) => l.variantId === 'var-1')?.id).toBe('line-return-A');
        expect(payload.lines.find((l) => l.variantId === 'var-3')?.id).toBeUndefined();
        expect(payload.lines.some((l) => l.id === 'line-return-B')).toBe(false);
      });
    });

    it('la modifica usa lo STESSO metodo/endpoint della creazione, distinto solo da id nel body', async () => {
      // Non un metodo/endpoint diverso: la stessa createSale, chiamata con id
      // presente. È il contratto già verificato lato API (T1/T2, censimento):
      // qui si verifica solo che il client non ne inventi uno suo.
      const createSale = vi.fn((_body: unknown) =>
        of({
          id: SALE_DOC.id,
          reference: 'VN-12',
          documentDate: '2026-08-10',
          totalMinor: 0,
          currency: 'EUR',
          lines: [],
        }),
      );
      const { fixture } = await setup({
        mode: 'sale',
        editId: SALE_DOC.id,
        loadDocument: SALE_DOC,
        createSale,
      });
      await screen.findByText('Maglietta Basic — M / Bianco');

      componentOf(fixture).concludeSale();

      expect(createSale).toHaveBeenCalledTimes(1);
      expect(createSale.mock.calls[0]![0]).toMatchObject({ id: 'doc-sale-1' });
    });
  });

  // ── T3 — snapshot IVA: il client non deve rimandare ciò che non è cambiato ──
  //
  // Il server tratta «vatCodeId presente» come «l'operatore l'ha cambiato» e
  // RIGENERA lo snapshot all'aliquota corrente. Rimandare sempre il codice
  // letto all'apertura vanifica il contratto: risalvare una vendita di marzo
  // per correggere una quantità la ri-prezzerebbe.
  //
  // ⚠️ Il difetto è INVISIBILE lato client — il payload «sembra giusto», perché
  // il codice è davvero quello della riga. Si vede solo guardando se la CHIAVE
  // c'è, ed è quello che questi test guardano.
  describe('T3 — Codice IVA nel payload della Vendita', () => {
    interface PayloadLine {
      readonly id?: string;
      readonly variantId: string;
      readonly vatCodeId?: string;
    }

    function componentOf(fixture: { componentInstance: unknown }) {
      return fixture.componentInstance as {
        onLineVatSelect(uiId: string, value: string | null): void;
        concludeSale(): void;
      };
    }

    const risultato = () =>
      of({
        id: SALE_DOC.id,
        reference: 'VN-12',
        documentDate: '2026-08-10',
        totalMinor: 0,
        currency: 'EUR',
        lines: [],
      });

    /** Apre la vendita esistente e restituisce le righe uscite nel payload. */
    async function payloadRighe(
      azione?: (c: ReturnType<typeof componentOf>) => void,
    ): Promise<readonly PayloadLine[]> {
      const createSale = vi.fn((_body: unknown) => risultato());
      const { fixture } = await setup({
        mode: 'sale',
        editId: SALE_DOC.id,
        loadDocument: SALE_DOC,
        createSale,
      });
      await screen.findByText('Maglietta Basic — M / Bianco');

      const component = componentOf(fixture);
      azione?.(component);
      component.concludeSale();

      return (createSale.mock.calls[0]![0] as { lines: readonly PayloadLine[] }).lines;
    }

    it('⭐ riga esistente, IVA NON toccata → la chiave vatCodeId è ASSENTE', async () => {
      const lines = await payloadRighe();

      // Le righe caricate hanno vatCodeId 'vat-22' sul documento: il payload
      // NON lo ripete, ed è l'assenza a dire «non modificata».
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line.vatCodeId).toBeUndefined();
      }
      // Controprova che il test guardi la riga giusta: gli id ci sono (T1/T2).
      expect(lines.map((l) => l.id)).toEqual(['line-sale-A', 'line-sale-B']);
    });

    it('riga esistente, IVA cambiata → il nuovo id viene inviato', async () => {
      // `uiId` di una riga caricata coincide con l'id server (T1/T2).
      const lines = await payloadRighe((c) => c.onLineVatSelect('line-sale-A', 'vat-10'));

      expect(lines[0]!.vatCodeId).toBe('vat-10');
      // L'altra riga non è stata toccata: resta assente.
      expect(lines[1]!.vatCodeId).toBeUndefined();
    });

    it('⭐ IVA cambiata e poi RIPORTATA all’originale → torna assente', async () => {
      // È il caso che distingue «confronto col persistito» da «confronto col
      // precedente»: con quest'ultimo il payload porterebbe 'vat-22', e il
      // server rigenererebbe lo snapshot per una modifica che non c'è più.
      const lines = await payloadRighe((c) => {
        c.onLineVatSelect('line-sale-A', 'vat-10');
        c.onLineVatSelect('line-sale-A', 'vat-22');
      });

      expect(lines[0]!.vatCodeId).toBeUndefined();
    });

    it('⭐ riga NUOVA aggiunta in modifica → manda il Codice IVA corrente, le caricate no', async () => {
      const createSale = vi.fn((_body: unknown) => risultato());
      // ⚠️ Variante ASSENTE dal documento: con `var-1` o `var-2` la scansione
      // FONDEREBBE la quantità nella riga esistente (`addToCart` accorpa per
      // variante) e non nascerebbe nessuna riga nuova da osservare.
      const NUOVO: StoreSaleLookupItem = { ...ITEM, variantId: 'var-9', sku: 'MAG-009' };
      const { fixture } = await setup({
        mode: 'sale',
        editId: SALE_DOC.id,
        loadDocument: SALE_DOC,
        createSale,
        variantIdByCode: 'var-9',
        lookupItems: [NUOVO],
      });
      await screen.findByText('Maglietta Basic — M / Bianco');

      // Percorso reale: la scansione aggiunge una riga nuova al carrello.
      await scan(EAN);
      componentOf(fixture).concludeSale();

      const lines = (createSale.mock.calls[0]![0] as { lines: readonly PayloadLine[] }).lines;
      const nuova = lines.find((line) => line.variantId === 'var-9');
      expect(nuova).toBeDefined();
      expect(nuova!.id).toBeUndefined();
      // Su una riga nuova non c'è nulla da conservare: il codice si manda…
      expect(nuova!.vatCodeId).toBe('vat-22');
      // …mentre le due caricate portano lo STESSO codice e restano assenti.
      // È il contrasto che rende il test discriminante: un'implementazione
      // «manda sempre» o «non mandare mai» sbaglierebbe una delle due metà.
      expect(lines.find((l) => l.id === 'line-sale-A')!.vatCodeId).toBeUndefined();
      expect(lines.find((l) => l.id === 'line-sale-B')!.vatCodeId).toBeUndefined();
    });
  });

  // ── T15B — l'identità dell'intento di creazione, lato client ────────────
  //
  // ⛔ Il backend (T15A) sa riconoscere un reinvio, ma solo se il client gli
  // manda la stessa identità. Qui si prova il ciclo di vita di quell'identità,
  // che è tutto il disegno:
  //
  //   prima conclusione   → si genera, una volta
  //   ritentata           → LO STESSO, o il reinvio non sarebbe riconoscibile
  //   successo certo      → si chiude: la vendita dopo è un'altra compilazione
  //   errore INCERTO      → si conserva (il server potrebbe aver committato)
  //   errore CERTO        → si chiude (il server non ha creato niente)
  //   modifica            → nessun intento: non si sta creando
  //
  // ⚠️ **Il doppio clic è un'altra cosa, e i test lo dichiarano.** La guardia di
  // rientro e il pulsante disabilitato impediscono che parta un secondo comando
  // PRIMA che il primo risponda: è protezione di interfaccia, vale dentro
  // un'istanza del componente, e la scavalcano due schede o un refresh a metà
  // volo. L'idempotenza NON si regge su quella — si regge sull'intento.
  describe('T15B — intento di creazione', () => {
    interface CorpoVendita {
      readonly creationIntentId?: string;
      readonly id?: string;
    }

    function componentOf(fixture: { componentInstance: unknown }) {
      return fixture.componentInstance as { concludeSale(): void };
    }

    const risultato = () =>
      of({
        id: 'doc-nuovo',
        reference: 'VN-1',
        documentDate: '2026-08-21',
        totalMinor: 1990,
        currency: 'EUR',
        lines: [],
      });

    const intentiInviati = (spia: ReturnType<typeof vi.fn>): (string | undefined)[] =>
      spia.mock.calls.map((call) => (call[0] as CorpoVendita).creationIntentId);

    it('⭐ prima conclusione: genera un id e lo manda', async () => {
      const createSale = vi.fn((_body: unknown) => risultato());
      const { fixture } = await setup({
        variantIdByCode: 'var-1',
        lookupItems: [ITEM],
        createSale,
      });
      await scan(EAN);

      componentOf(fixture).concludeSale();

      const [primo] = intentiInviati(createSale);
      expect(primo).toBeTruthy();
      expect(typeof primo).toBe('string');
    });

    it('⭐ timeout e ritentativo: il carrello resta e l’id è LO STESSO', async () => {
      // Timeout = errore INCERTO: il server potrebbe aver committato lo stesso,
      // e un id nuovo creerebbe una seconda vendita.
      const createSale = vi.fn((_body: unknown) =>
        throwError(() => ({ kind: 'timeout', message: 'La richiesta ha impiegato troppo tempo.' })),
      );
      const { fixture } = await setup({
        variantIdByCode: 'var-1',
        lookupItems: [ITEM],
        createSale,
      });
      await scan(EAN);
      const component = componentOf(fixture);

      component.concludeSale();
      // Il carrello sopravvive all'errore: è ciò che rende possibile il reinvio.
      expect(screen.getByText('Maglietta Basic — M / Bianco')).toBeTruthy();
      component.concludeSale();

      const [primo, secondo] = intentiInviati(createSale);
      expect(primo).toBeTruthy();
      expect(secondo).toBe(primo);
    });

    it('⭐ successo: l’intento si chiude, e la vendita dopo ne ha uno NUOVO', async () => {
      const createSale = vi.fn((_body: unknown) => risultato());
      const { fixture } = await setup({
        variantIdByCode: 'var-1',
        lookupItems: [ITEM],
        createSale,
      });
      const component = componentOf(fixture);

      await scan(EAN);
      component.concludeSale();
      // Il carrello si è svuotato: comincia un'altra compilazione, identica.
      await scan(EAN);
      component.concludeSale();

      const [primo, secondo] = intentiInviati(createSale);
      expect(primo).toBeTruthy();
      // ⛔ Due clienti, stessa maglietta, stesso minuto: due vendite. Se l'id
      // non si chiudesse al successo, la seconda sarebbe scambiata per un
      // reinvio della prima e non verrebbe registrata.
      expect(secondo).not.toBe(primo);
    });

    it('⭐ errore CERTO: l’intento si chiude — il server non ha creato niente', async () => {
      // 422: la richiesta è stata respinta prima di ogni effetto. Conservare
      // l'id farebbe rifiutare come «intento riusato» la versione corretta.
      const createSale = vi.fn((_body: unknown) =>
        throwError(() => ({ kind: 'validation', message: 'Dati non validi.', status: 422 })),
      );
      const { fixture } = await setup({
        variantIdByCode: 'var-1',
        lookupItems: [ITEM],
        createSale,
      });
      const component = componentOf(fixture);

      await scan(EAN);
      component.concludeSale();
      component.concludeSale();

      const [primo, secondo] = intentiInviati(createSale);
      expect(secondo).not.toBe(primo);
    });

    it('⭐ in MODIFICA non si manda alcun intento: non si sta creando', async () => {
      const createSale = vi.fn((_body: unknown) =>
        of({
          id: SALE_DOC.id,
          reference: 'VN-12',
          documentDate: '2026-08-10',
          totalMinor: 0,
          currency: 'EUR',
          lines: [],
        }),
      );
      const { fixture } = await setup({
        mode: 'sale',
        editId: SALE_DOC.id,
        loadDocument: SALE_DOC,
        createSale,
      });
      await screen.findByText('Maglietta Basic — M / Bianco');

      componentOf(fixture).concludeSale();

      const corpo = createSale.mock.calls[0]![0] as CorpoVendita;
      expect(corpo.id).toBe(SALE_DOC.id);
      // Rivendicare un intento qui impedirebbe la seconda modifica legittima
      // dello stesso documento.
      expect(corpo.creationIntentId).toBeUndefined();
    });

    it('⚠️ il doppio clic lo ferma il pending — ma NON è ciò che garantisce l’idempotenza', async () => {
      // ⚠️ `NEVER` e non `of(...)`: la richiesta deve restare IN VOLO. Con un
      // observable sincrono il `next` arriva prima del secondo click, il pending
      // è già tornato falso e la guardia non ha nulla da fermare — il test
      // proverebbe il contrario di quello che dice.
      const createSale = vi.fn((_body: unknown) => NEVER);
      const { fixture } = await setup({
        variantIdByCode: 'var-1',
        lookupItems: [ITEM],
        createSale,
      });
      await scan(EAN);
      const component = componentOf(fixture);

      // Due click di fila, senza che il primo abbia risposto.
      component.concludeSale();
      component.concludeSale();

      // La guardia di rientro (`if (salePending()) return`) ferma il secondo:
      // parte UN comando solo.
      expect(createSale).toHaveBeenCalledTimes(1);

      // ⛔ Ma è protezione di INTERFACCIA, e vale dentro questa istanza del
      // componente: due schede aperte, un refresh a metà volo o una sessione
      // ripresa la scavalcano. Ciò che rende il reinvio innocuo è l'intento, che
      // il server riconosce — non questo `if`.
      expect(intentiInviati(createSale)[0]).toBeTruthy();
    });
  });
});
