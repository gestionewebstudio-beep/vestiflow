import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { ViewportService } from '@core/services/viewport.service';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { ProductService } from '@domain/products/services/product.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { STORE_SALE_MODE_ROUTE_DATA_KEY } from '@domain/store-sales/models/store-sale-routing.util';
import type {
  CreateStoreReturnPayload,
  CreateStoreSalePayload,
} from '@domain/store-sales/models/store-sale.model';

import { StoreSalesService } from './services/store-sales.service';
import type { StoreSaleDocumentLine } from '@domain/store-sales/models/store-sale-document-line.model';

import { StoreSaleDocumentFormComponent } from './store-sale-document-form.component';

/** Colonne spente dal selettore: azzerate a ogni prova (`afterEach`). */
const colonneSpente = new Set<string>();

const SEDE = { id: 'loc-1', name: 'Negozio Milano' };
const ALTRA_SEDE = { id: 'loc-2', name: 'Magazzino' };
const ZERO = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };
const EAN_NOTO = '8001234567890';
const EAN_IGNOTO = '9999999999999';

/** Operatore col permesso sul catalogo: vede i comandi che creano articoli. */
const OPERATORE_CATALOGO = {
  id: 'usr-1',
  role: 'clerk',
  permissions: ['catalog.manage'],
  tenantChannelProfile: 'gestionale',
};

/**
 * Il contatore che il servizio comune propone in testata. `nextNumber` è il
 * primo libero: la testata lo mostra come PROPOSTA, e finché nessuno lo tocca
 * non viaggia al salvataggio — lo assegna il server.
 */
const CONTATORE = {
  id: 'cnt-1',
  type: DocumentType.StoreSale,
  series: null,
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 41,
  documentCount: 40,
};

/** Codice IVA attivo di vendita: la cella IVA della riga ne offre le voci. */
const VAT_22 = {
  id: 'vat-22',
  code: '22',
  ratePercent: 22,
  description: 'Imponibile 22%',
  usageScope: 'both',
  calculationMode: 'standard',
  nonDeductiblePercent: 0,
  isActive: true,
  isDefault: true,
};

/**
 * L'articolo che la ricerca e la scansione risolvono.
 *
 * ⚠️ `managesStock` porta il default della spunta di riga, che viene dal
 * contratto documentale comune e non dalla vecchia maschera del banco.
 */
const VARIANTE = {
  variantId: 'var-1',
  productId: 'prod-1',
  sku: 'MAG-001',
  articleCode: 'ART-1',
  productName: 'Maglietta Basic',
  title: 'Maglietta Basic — M / Bianco',
  barcode: EAN_NOTO,
  sellingPrice: { amountMinor: 2000, currencyCode: DEFAULT_CURRENCY },
  defaultVatCodeId: 'vat-22',
  managesStock: true,
  stockOnHand: 5,
  stockAvailable: 3,
};

const VAT_SNAPSHOT = {
  code: '22',
  natureKey: 'imponibile',
  natureLabel: 'Imponibile',
  officialCode: null,
  ratePercent: 22,
  description: 'Imponibile 22%',
  nonDeductiblePercent: 0,
  calculationMode: 'standard' as const,
  vatAffectsSupplierTotal: true,
};

/**
 * Vendita già registrata, con la testata piena: sono i campi che questa fase
 * **conserva senza mostrarli** (note, pagamento, cliente) e che un risalvataggio
 * non deve cancellare.
 */
const VENDITA: DocumentRecord = {
  id: 'doc-sale-1',
  tenantId: 'ten-1',
  createdAt: '2026-03-10T08:00:00.000Z',
  updatedAt: '2026-03-10T08:00:00.000Z',
  type: DocumentType.StoreSale,
  status: DocumentStatus.Confirmed,
  series: '',
  number: 12,
  year: 2026,
  documentDate: '2026-03-10',
  currency: DEFAULT_CURRENCY,
  subtotal: ZERO,
  tax: ZERO,
  total: ZERO,
  pricesIncludeVat: true,
  createdByName: 'Operatore',
  locationId: SEDE.id,
  customerId: 'cli-1',
  notes: 'Consegnato a mano',
  paymentMethod: 'card',
  lines: [
    {
      id: 'line-A',
      lineNumber: 1,
      variantId: 'var-1',
      sku: 'MAG-001',
      // ⛔ Il documento salvato porta il SOLO nome: la variante sta in
      // `variantLabel`, e il server ha smesso di concatenarle il 24/08.
      description: 'Maglietta Basic',
      variantLabel: 'M / Bianco',
      quantity: 2,
      unitPrice: { amountMinor: 2049.180328, currencyCode: DEFAULT_CURRENCY },
      discountPercent: 0,
      lineTotal: { amountMinor: 4098, currencyCode: DEFAULT_CURRENCY },
      loadsStock: true,
      vatCodeId: 'vat-22',
      vatSnapshot: VAT_SNAPSHOT,
    },
  ],
};

const RESO: DocumentRecord = {
  ...VENDITA,
  id: 'doc-return-1',
  type: DocumentType.StoreReturn,
  customerId: undefined,
  paymentMethod: undefined,
  causalText: 'Capo difettoso',
  lines: [{ ...VENDITA.lines![0]!, id: 'line-R', loadsStock: false }],
};

const ESITO = {
  id: 'doc-nuovo',
  reference: 'VN-1',
  documentDate: '2026-08-21',
  totalMinor: 4098,
  currency: DEFAULT_CURRENCY,
  lines: [],
};

/**
 * Un 409 nella forma in cui arriva DAVVERO al componente: `AppError.details` è
 * la `HttpErrorResponse`, e Nest annida il payload dentro `message`. Una
 * fixture più semplice renderebbe verde un estrattore che in produzione non
 * trova niente.
 */
/** Stub Web Audio: il beep si verifica senza audio reale. */
function stubAudioContext() {
  const suoni: number[] = [];
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    close = vi.fn(() => Promise.resolve());
    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          set value(hz: number) {
            suoni.push(hz);
          },
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return { gain: { value: 0 }, connect: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return suoni;
}

function errore409(payload: Record<string, unknown>) {
  return {
    kind: 'conflict',
    message: 'Conflitto.',
    status: 409,
    details: new HttpErrorResponse({ status: 409, error: { message: payload } }),
  };
}

interface SetupOptions {
  readonly mode?: 'sale' | 'return';
  readonly editId?: string;
  readonly loadDocument?: DocumentRecord;
  readonly loadFails?: boolean;
  readonly createSale?: ReturnType<typeof vi.fn>;
  readonly createReturn?: ReturnType<typeof vi.fn>;
  /**
   * Sedi fra cui scegliere. Con una sola, il default la precompila — ma il
   * campo resta il controllo comune (`11` A13).
   */
  readonly locations?: readonly { id: string; name: string }[];
  /**
   * Sede predefinita dell'operatore (contratto comune `defaultLocation`):
   * `null` = nessuna, e allora la sede si sceglie e il gate resta aperto.
   */
  readonly defaultLocation?: string | null;
  /** Modalità netto/ivato proposta dal contratto comune. */
  readonly priceMode?: boolean;
  /** L'articolo che ricerca e scansione risolvono (default: `VARIANTE`). */
  readonly variant?: typeof VARIANTE;
  /** Vista compatta (card) invece della tabella: il criterio responsive comune. */
  readonly compact?: boolean;
  /** I contatori che il servizio comune offre alla testata. */
  readonly counters?: readonly unknown[];
  /** Il contatore proposto; `null` = nessuno, e allora la serie si sceglie. */
  readonly proposedCounterId?: string | null;
  /** L'operatore, per i comandi legati ai permessi (catalogo, numerazioni). */
  readonly user?: unknown;
  /** La fotocamera è disponibile su questo dispositivo/ambiente. */
  readonly barcodeScanner?: boolean;
}

/**
 * Una fotocamera che esiste.
 *
 * ⚠️ Serve da quando il comando «Scansiona» non dipende piu' dalla sola
 * bandiera d'ambiente: chiede anche che il dispositivo abbia una fotocamera, e
 * jsdom non ne ha. Senza questo, il pulsante non comparirebbe **mai** e le
 * prove direbbero di sorvegliare una regola che non stanno esercitando.
 */
function conFotocamera(): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
}

async function setup(options: SetupOptions = {}) {
  const locations = options.locations ?? [SEDE, ALTRA_SEDE];
  const defaultLocation = options.defaultLocation === undefined ? SEDE.id : options.defaultLocation;
  const createSale = options.createSale ?? vi.fn(() => of(ESITO));
  const createReturn = options.createReturn ?? vi.fn(() => of(ESITO));
  const available = vi.fn(() =>
    of({
      counters: options.counters ?? [CONTATORE],
      proposedCounterId:
        options.proposedCounterId === undefined ? CONTATORE.id : options.proposedCounterId,
    }),
  );
  const getDocumentById = vi.fn(() =>
    options.loadFails
      ? throwError(() => ({ kind: 'server', message: 'Errore.' }))
      : of(options.loadDocument ?? VENDITA),
  );

  const rendered = await render(StoreSaleDocumentFormComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          // ⛔ Il modo lo pretende la rotta e il componente LANCIA se manca: i
          // due modi hanno effetti di magazzino opposti.
          snapshot: {
            data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: options.mode ?? 'sale' },
            paramMap: convertToParamMap(options.editId ? { id: options.editId } : {}),
          },
          paramMap: of(convertToParamMap(options.editId ? { id: options.editId } : {})),
        },
      },
      {
        provide: DocumentService,
        useValue: {
          getDocumentById,
          // Modalità iniziale netto/ivato: la risolve il contratto comune
          // (memoria dell'operatore, poi convenzione aziendale).
          getPriceModePreference: vi.fn(() => of(options.priceMode ?? false)),
        },
      },
      {
        provide: VatCodeService,
        useValue: { list: () => of([VAT_22] as readonly unknown[]) },
      },
      {
        provide: BarcodeLookupService,
        useValue: {
          parseScanInput: (raw: string) => ({ quantity: 1, code: raw.trim() }),
          resolveVariantIdByCode: vi.fn((code: string) =>
            of(code === EAN_NOTO ? VARIANTE.variantId : null),
          ),
        },
      },
      {
        provide: ProductService,
        useValue: {
          searchVariantSummaries: vi.fn(() => of([options.variant ?? VARIANTE])),
        },
      },
      {
        provide: TableColumnPreferenceService,
        useValue: {
          registerView: vi.fn(),
          // Pilotabile dal test: il selettore Colonne governa anche la card,
          // e serve poterlo dimostrare spegnendo una colonna.
          isColumnVisible: (_view: unknown, id: string) => !colonneSpente.has(id),
          columnWidth: (_view: unknown, _id: string, fallback: number) => fallback,
          setColumnWidth: vi.fn(),
          setColumnWidths: vi.fn(),
        },
      },
      { provide: StoreSalesService, useValue: { createSale, createReturn } },
      {
        provide: CustomerService,
        useValue: {
          getAllCustomers: vi.fn(() =>
            of([{ id: 'cli-1', displayName: 'Mario Rossi', type: 'person' }]),
          ),
        },
      },
      {
        provide: OperationalLocationsService,
        useValue: {
          actionLocations: () => locations,
          defaultLocation: () => locations.find((sede) => sede.id === defaultLocation) ?? null,
        },
      },
      {
        provide: ViewportService,
        useValue: { compact: () => options.compact ?? false },
      },
      // Numerazione: il servizio comune dei contatori (T8B). Il banco non ne
      // ha uno proprio — è lo stesso delle altre sette maschere.
      { provide: DocumentCountersService, useValue: { available } },
      {
        // Senza permesso l'ingranaggio «gestisci numerazioni» non compare,
        // né i comandi che creano un articolo.
        provide: AuthService,
        useValue: { currentUser: () => options.user ?? null },
      },
      {
        provide: APP_CONFIG,
        useValue: {
          production: false,
          appName: 'VestiFlow',
          apiBaseUrl: 'http://localhost:3000/api/v1',
          features: { barcodeScanner: options.barcodeScanner ?? true, shopify: false },
        },
      },
    ],
  });

  const component = rendered.fixture.componentInstance as StoreSaleDocumentFormComponent & {
    lines(): readonly StoreSaleDocumentLine[];
    pricesIncludeVat(): boolean;
    availabilityWarningCount(): number;
    setPriceMode(pricesIncludeVat: boolean): void;
    onStockToggle(index: number, checked: boolean): void;
    onLocationChange(value: string | null): void;
    /** Il gancio dell'overlay fotocamera: la riga la costruisce la maschera. */
    onScanLineAdded(event: { variantId: string; quantity: number }): void;
    /** Lo store comune della numerazione: il banco non ne ha uno proprio. */
    numbering: {
      onNumberChange(value: number | null): void;
      onSeriesChange(value: string): void;
      seriesOptions(): readonly { value: string; label: string }[];
    };
  };
  return { ...rendered, component, createSale, createReturn, getDocumentById, available };
}

const corpoVendita = (spia: ReturnType<typeof vi.fn>, chiamata = 0): CreateStoreSalePayload =>
  spia.mock.calls[chiamata]![0] as CreateStoreSalePayload;

const corpoReso = (spia: ReturnType<typeof vi.fn>, chiamata = 0): CreateStoreReturnPayload =>
  spia.mock.calls[chiamata]![0] as CreateStoreReturnPayload;

describe('StoreSaleDocumentFormComponent', () => {
  // jsdom non implementa <dialog>: senza questo, l'avviso «numero già usato»
  // esplode con «showModal is not a function». È un limite dell'ambiente di
  // prova, non del componente.
  beforeAll(() => {
    const proto = globalThis.HTMLDialogElement?.prototype;
    if (proto && !proto.showModal) {
      proto.showModal = function showModal(this: HTMLDialogElement) {
        this.open = true;
      };
      proto.close = function close(this: HTMLDialogElement) {
        this.open = false;
      };
    }
  });

  afterEach(() => {
  colonneSpente.clear();
    vi.unstubAllGlobals();
  });

  describe('il modo viene dalla rotta, e con lui tutto ciò che cambia', () => {
    it('vendita: titolo e sottotestata parlano di scarico', async () => {
      await setup({ mode: 'sale' });

      expect(screen.getByRole('heading', { name: 'Nuova vendita al banco' })).toBeTruthy();
      expect(screen.getByText(/vengono scaricate/)).toBeTruthy();
    });

    it('reso: titolo e sottotestata parlano di rientro', async () => {
      await setup({ mode: 'return' });

      expect(screen.getByRole('heading', { name: 'Nuovo reso al banco' })).toBeTruthy();
      // ⚠️ Era il difetto misurato quando i due testi erano fissi sulla vendita:
      // «Nuovo reso al banco» dichiarava lo scarico della giacenza.
      expect(screen.getByText(/rientra in giacenza/)).toBeTruthy();
    });

    it('senza modo nella rotta non parte: un fallback silenzioso è peggio', async () => {
      await expect(
        render(StoreSaleDocumentFormComponent, {
          providers: [
            provideRouter([]),
            {
              provide: ActivatedRoute,
              useValue: {
                snapshot: { data: {}, paramMap: convertToParamMap({}) },
                paramMap: of(convertToParamMap({})),
              },
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it('il cliente c’è sulla vendita', async () => {
      const { container } = await setup({ mode: 'sale' });

      expect(container.textContent).toContain('Cliente (facoltativo)');
    });

    it('⭐ il cliente c’è anche sul reso: A13 non distingue i due modi', async () => {
      const { container } = await setup({ mode: 'return' });

      expect(container.textContent).toContain('Cliente (facoltativo)');
    });
  });

  describe('la testata governa le righe', () => {
    it('senza sede, al posto delle righe c’è uno stato vuoto che dice cosa manca', async () => {
      // Più sedi possibili e nessuna preferita: A13 dice che non si prosegue
      // finché non se ne sceglie una.
      await setup({ defaultLocation: null });

      expect(screen.getByText('Scegli la sede')).toBeTruthy();
    });

    it('la sede preferita precompila e chiude il gate', async () => {
      await setup({ defaultLocation: SEDE.id });

      expect(screen.queryByText('Scegli la sede')).toBeNull();
    });

    it('⭐ con una sola sede il campo resta il controllo comune, non un’etichetta', async () => {
      // ⛔ La maschera legacy mostrava un'etichetta al posto della tendina: un
      // default non cambia la natura del campo (`11` A13, «precompila ma resta
      // modificabile»).
      await setup({ locations: [SEDE], defaultLocation: SEDE.id });

      expect(screen.getAllByLabelText('Sede').length).toBeGreaterThan(0);
      expect(screen.queryByText('Scegli la sede')).toBeNull();
    });

    it('⭐ senza una PREDEFINITA la sede si sceglie, anche se ce n’è una sola', async () => {
      // Contratto comune: chi non ha una sede predefinita assegnata la sceglie,
      // e il campo resta vuoto. ⛔ Il banco non inventa un ripiego sull'unica
      // disponibile — sarebbe di nuovo una regola sua.
      await setup({ locations: [SEDE], defaultLocation: null });

      expect(screen.getByText('Scegli la sede')).toBeTruthy();
    });
  });

  describe('caricamento di un documento esistente', () => {
    it('legge il documento per id', async () => {
      const { getDocumentById } = await setup({ editId: 'doc-sale-1' });

      expect(getDocumentById).toHaveBeenCalledWith('doc-sale-1');
      expect(screen.getByRole('heading', { name: 'Modifica vendita al banco' })).toBeTruthy();
    });

    it('un documento di tipo diverso non si apre qui', async () => {
      // Il tipo lo dice la ROTTA: aprire un reso su una maschera che dice
      // vendita farebbe correggere la cosa sbagliata.
      await setup({ mode: 'sale', editId: 'doc-return-1', loadDocument: RESO });

      expect(screen.getByText('Documento non disponibile')).toBeTruthy();
    });

    it('⭐ la sede del documento non viene sovrascritta da quella assegnata', async () => {
      // Con una sede unica assegnata, aprire un documento di un'ALTRA sede non
      // deve spostarlo: sarebbe un cambio di magazzino fatto aprendo, e su un
      // operatore autorizzato a entrambe il server non avrebbe da obiettare.
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({
        editId: 'doc-sale-1',
        loadDocument: { ...VENDITA, locationId: ALTRA_SEDE.id },
        // La sede assegnata all'operatore è un'altra: non deve vincere su
        // quella già persistita sul documento.
        defaultLocation: SEDE.id,
        createSale,
      });

      component.save();

      expect(corpoVendita(createSale).locationId).toBe(ALTRA_SEDE.id);
    });

    it('⭐ la data si carica dal documento e RESTA modificabile', async () => {
      // Contratto documentale comune: default oggi, modificabile, caricata dal
      // documento esistente. Il server la persiste in update senza rinumerare.
      await setup({ editId: 'doc-sale-1' });

      const campi = screen.getAllByLabelText<HTMLInputElement>('Data documento');
      expect(campi.length).toBeGreaterThan(0);
      expect(campi.some((campo) => campo.disabled)).toBe(false);
      expect(campi[0]!.value).toContain('10/03/2026');
    });

    it('la lettura fallita ha il suo stato, non una maschera vuota', async () => {
      await setup({ editId: 'doc-sale-1', loadFails: true });

      expect(screen.getByText('Impossibile caricare il documento.')).toBeTruthy();
    });
  });

  describe('salvataggio', () => {
    it('creazione: nessun id, intento presente, data del documento', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      expect(corpo.id).toBeUndefined();
      expect(corpo.creationIntentId).toBeTruthy();
      expect(corpo.locationId).toBe(SEDE.id);
      expect(corpo.documentDate).toBeTruthy();
    });

    it('modifica: id presente, nessun intento, e la data viaggia lo stesso', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      expect(corpo.id).toBe('doc-sale-1');
      // ⛔ Rivendicare un intento in modifica impedirebbe la seconda modifica
      // legittima dello stesso documento.
      expect(corpo.creationIntentId).toBeUndefined();
      // La data è modificabile anche dopo la conclusione: il client la manda
      // sempre, e il server la persiste senza rinumerare.
      expect(corpo.documentDate).toContain('2026-03-10');
    });

    it('⭐ risalvare un documento caricato non cancella la testata che non si vede', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      // Il server riscrive la testata da ciò che riceve: ometterli li
      // cancellerebbe, e i loro campi non si vedono ancora.
      expect(corpo.notes).toBe('Consegnato a mano');
      expect(corpo.customerId).toBe('cli-1');
    });

    it('⛔ il pagamento NON viaggia: la sua gestione è differita (A8)', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      // Nessun campo, nessun default, nessun trasporto: il valore storico lo
      // protegge il server, che senza metodo dichiarato conserva il persistito.
      expect(corpo).not.toHaveProperty('paymentMethod');
      expect(corpo).not.toHaveProperty('paymentMethodNote');
    });

    it('⭐ risalvare non altera le righe caricate', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const [riga] = corpoVendita(createSale).lines;
      expect(riga!.id).toBe('line-A');
      // Assenti = non modificate: il server conserva snapshot IVA e descrizione.
      expect(riga!.vatCodeId).toBeUndefined();
      expect(riga!.description).toBeUndefined();
      // Il prezzo torna com'era, coda decimale compresa.
      expect(riga!.unitPriceMinor).toBe(2049.180328);
    });

    it('reso: causale conservata e «Carica giacenze» nel nome del confine', async () => {
      const createReturn = vi.fn(() => of(ESITO));
      const { component } = await setup({
        mode: 'return',
        editId: 'doc-return-1',
        loadDocument: RESO,
        createReturn,
      });

      component.save();

      const corpo = corpoReso(createReturn);
      expect(corpo.causale).toBe('Capo difettoso');
      // Il concetto è `loadsStock`; `restockable` è come si chiama nel DTO.
      expect(corpo.lines[0]!.restockable).toBe(false);
      expect(corpo.lines[0]!.id).toBe('line-R');
    });

    it('⭐ reso: il cliente scelto viaggia, come sulla Vendita (A13)', async () => {
      const createReturn = vi.fn(() => of(ESITO));
      const { component } = await setup({
        mode: 'return',
        editId: 'doc-return-1',
        loadDocument: { ...RESO, customerId: 'cli-1' },
        createReturn,
      });

      component.save();

      expect(corpoReso(createReturn).customerId).toBe('cli-1');
    });

    it('senza sede non si salva', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ defaultLocation: null, createSale });

      component.save();

      expect(createSale).not.toHaveBeenCalled();
    });
  });

  // ── Le righe (`11` A14, A15, A18) ────────────────────────────────────────

  describe('la porta d’ingresso delle righe', () => {
    /** L'unica porta: si digita o si spara, e Invio conferma. */
    async function scansiona(rendered: Awaited<ReturnType<typeof setup>>, codice: string) {
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.clear(campo);
      await userEvent.type(campo, `${codice}{enter}`);
      rendered.fixture.detectChanges();
    }

    it('⭐ un codice risolto crea la riga, con i valori dell’articolo', async () => {
      const rendered = await setup();

      await scansiona(rendered, EAN_NOTO);

      expect(rendered.component.lines()).toHaveLength(1);
      const [riga] = rendered.component.lines();
      expect(riga!.variantId).toBe(VARIANTE.variantId);
      expect(riga!.sku).toBe('MAG-001');
      expect(riga!.unitPriceMinor).toBe(2000);
      expect(riga!.vatCodeId).toBe('vat-22');
    });

    it('⛔ un codice NON trovato non inventa righe', async () => {
      const rendered = await setup();

      await scansiona(rendered, 'codice-che-non-esiste');

      expect(rendered.component.lines()).toHaveLength(0);
      expect(screen.getByText(/Nessun articolo/)).toBeTruthy();
    });

    it('⭐ stesso EAN due volte: la riga esistente cresce, non ne nasce una seconda', async () => {
      // A14: al banco passare due volte lo stesso capo sul lettore vuol dire
      // due pezzi.
      const rendered = await setup();

      await scansiona(rendered, EAN_NOTO);
      await scansiona(rendered, EAN_NOTO);

      expect(rendered.component.lines()).toHaveLength(1);
      expect(rendered.component.lines()[0]!.quantity).toBe(2);
    });

    it('dopo l’inserimento il campo è pulito e pronto', async () => {
      const rendered = await setup();

      await scansiona(rendered, EAN_NOTO);

      expect(screen.getByLabelText<HTMLInputElement>('Scansiona o cerca un articolo').value).toBe(
        '',
      );
    });

    it('⛔ nessun movimento di magazzino durante ricerca e inserimento', async () => {
      // A18: l'effetto fisico nasce alla conclusione. La maschera non ha nessun
      // percorso verso i movimenti — a scrivere è solo il salvataggio.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await setup({ createSale });

      await scansiona(rendered, EAN_NOTO);

      expect(createSale).not.toHaveBeenCalled();
    });
  });

  describe('la riga e i suoi effetti', () => {
    async function conUnaRiga() {
      const rendered = await setup();
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('⛔ una quantità NORMALE non è un errore — e non lo era per nessuno', async () => {
      // Guardia di una regressione misurata il 22/08/2026: convertendo il banco a
      // FormArray il validatore della quantità era stato riscritto a mano come
      // `/^d+$/` invece di `/^\d+$/` — un carattere.
      // Come scritto pretendeva la LETTERA «d» ripetuta, quindi «1» era invalido:
      // ogni riga del banco marcava la propria quantità in errore, sempre.
      //
      // ⚠️ Nessun test lo vedeva perché tutti verificavano che un valore SBAGLIATO
      // fosse rifiutato, e nessuno che un valore GIUSTO fosse accettato. È la forma
      // in cui una validazione si rompe restando verde.
      const rendered = await conUnaRiga();

      const quantita = screen.getByRole<HTMLInputElement>('spinbutton', { name: /Quantità/i });
      expect(quantita.value).toBe('1');
      expect(quantita.getAttribute('aria-invalid')).toBeNull();
      expect(rendered.component.form.controls.lines.at(0).controls.quantity.valid).toBe(true);
    });

    it('⛔ al banco la quantità non scende sotto il pezzo', async () => {
      // Stessa regressione, altro versante: il banco nasceva con `min="1"` e
      // l'Ordine cliente con `min="0"`. Estraendo la riga comune il valore
      // dell'Ordine cliente si era imposto a entrambi.
      await conUnaRiga();

      const quantita = screen.getByRole<HTMLInputElement>('spinbutton', { name: /Quantità/i });
      expect(quantita.getAttribute('min')).toBe('1');
    });

    it('⛔ la colonna EAN mostra il DATO, non un trattino', async () => {
      // Misurato il 22/08/2026: la colonna era stata dichiarata senza che il
      // banco popolasse il controllo — visibile e muta, «—» su ogni riga. Una
      // colonna che non mostra niente è peggio di una colonna che manca:
      // sembra che l'articolo non abbia un EAN.
      const rendered = await conUnaRiga();

      expect(rendered.component.form.controls.lines.at(0).controls.barcode.value).toBe(EAN_NOTO);
    });

    it('⭐ sulla Vendita la spunta si legge «Scarica giacenze»', async () => {
      await conUnaRiga();

      expect(screen.getByRole('columnheader', { name: /Scarica giacenze/ })).toBeTruthy();
    });

    it('⭐ sul Reso la STESSA spunta si legge «Carica giacenze»', async () => {
      // Stesso campo del modello (`loadsStock`), due letture: nessun secondo
      // booleano, nessun modello parallelo.
      const rendered = await setup({ mode: 'return', editId: 'doc-return-1', loadDocument: RESO });

      expect(screen.getByRole('columnheader', { name: /Carica giacenze/ })).toBeTruthy();
      expect(rendered.component.lines()[0]!.loadsStock).toBe(false);
    });

    it('⭐ articolo che gestisce il magazzino: la spunta nasce ATTIVA', async () => {
      // `11` A15, deciso il 21/08/2026: il comportamento normale è che un capo
      // fisico venduto esca dal magazzino. La spunta esiste per l'eccezione.
      const rendered = await conUnaRiga();

      expect(rendered.component.lines()[0]!.loadsStock).toBe(true);
    });

    it('⭐ articolo che NON gestisce il magazzino: la spunta nasce DISATTIVA', async () => {
      const rendered = await setup({ variant: { ...VARIANTE, managesStock: false } });
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      expect(rendered.component.lines()[0]!.loadsStock).toBe(false);
    });

    it('la spunta si può togliere: la riga resta, l’effetto fisico no', async () => {
      const rendered = await conUnaRiga();

      rendered.component.onStockToggle(0, false);

      expect(rendered.component.lines()).toHaveLength(1);
      expect(rendered.component.lines()[0]!.loadsStock).toBe(false);
    });

    it('⛔ il COSTO non esiste fra le colonne, nemmeno spento', async () => {
      await setup();

      // La sola via per non offrirlo nel selettore è non dichiararlo.
      expect(screen.queryByRole('columnheader', { name: /costo/i })).toBeNull();
    });

    it('⛔ le quote della testata sommano 100%, non di piu', async () => {
      // Guardia di un difetto MISURATO il 24/08/2026: il banco rendeva dodici
      // colonne — «Scarica giacenze» e «Azioni» comprese — mentre il suo
      // catalogo ne dichiarava nove. Le quote percentuali si calcolano sul
      // totale delle colonne DICHIARATE, quindi le due non dichiarate ne
      // prendevano una in piu': la somma faceva **116,84%**.
      //
      // ⚠️ Non si vedeva come un errore. Con `table-layout: fixed` il browser
      // riscala per far stare la tabella nel contenitore, quindi ogni colonna
      // rendeva il 14% piu' stretta di quanto dichiarava e nessun minimo
      // proteggeva niente. È la stessa famiglia dell'intestazione spezzata
      // dell'Arrivo merce.
      await conUnaRiga();

      const quote = Array.from(document.querySelectorAll('thead th')).map((th) =>
        Number.parseFloat((th.getAttribute('style') ?? '').replace(/[^0-9.]/g, '') || '0'),
      );
      expect(quote.length).toBeGreaterThan(1);
      expect(quote.every((q) => q > 0)).toBe(true);
      expect(quote.reduce((somma, q) => somma + q, 0)).toBeCloseTo(100, 1);
    });

    it('⛔ le intestazioni non ordinano: al banco l’ordine è quello di scansione', async () => {
      await conUnaRiga();

      const articolo = screen.getByRole('columnheader', { name: /Articolo/ });
      expect(articolo.querySelector('button')).toBeNull();
    });

    it('quantità oltre la disponibilità: avviso, e si può concludere', async () => {
      const rendered = await conUnaRiga();

      // Disponibile 3, quantità 5.
      rendered.component.form.controls.lines.at(0).controls.quantity.setValue(5);
      rendered.fixture.detectChanges();

      expect(rendered.component.availabilityWarningCount()).toBe(1);
      // ⛔ Nessun blocco: il salvataggio parte lo stesso (A18).
      rendered.component.save();
      expect(rendered.createSale).toHaveBeenCalled();
    });
  });

  // ── Vista compatta: le card (`11` A12, riferimento Ordine cliente) ───────

  describe('la vista compatta', () => {
    async function conRigaSuMobile(extra: Partial<SetupOptions> = {}) {
      const rendered = await setup({ compact: true, ...extra });
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('⭐ sotto la soglia c’è la card, e la tabella NON è nel DOM', async () => {
      // Le due viste sono alternative: rendere anche quella che non si vede
      // significherebbe controlli doppi e ogni riga annunciata due volte.
      //
      // ⚠️ Il discriminante è «Riga 1», l'etichetta con cui la card comune si
      // annuncia: dalla migrazione la QUANTITÀ porta la stessa etichetta nelle
      // due viste («Quantità riga 1»), quindi cercarla non separa più niente.
      await conRigaSuMobile();

      expect(screen.getByLabelText('Riga 1')).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('⭐ sopra la soglia c’è la tabella, e le card no', async () => {
      const rendered = await setup();
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      expect(screen.getByRole('table')).toBeTruthy();
      expect(screen.queryByLabelText('Riga 1')).toBeNull();
    });

    it('a card CHIUSA restano i valori che si toccano di più', async () => {
      // Quantità, prezzo e totale: si modificano senza aprire niente.
      await conRigaSuMobile();

      expect(screen.getByLabelText('Quantità riga 1')).toBeTruthy();
      expect(screen.getByLabelText('Prezzo netto riga 1')).toBeTruthy();
      expect(screen.queryByLabelText('Sconto')).toBeNull();
    });

    /**
     * ⚠️ Il titolo della card e' il NOME, non il display completo: da quando il
     * banco passa dal risolutore comune la variante ha la sua riga, e cercare
     * `VARIANTE.title` («Maglietta Basic — M / Bianco») non trova piu' niente.
     */
    // ⚠️ Il campo del nome è la CELLA PRODOTTO comune e si annuncia «Nome
    // prodotto», come sulla riga di scrivania. L'involucro locale lo chiamava
    // «Descrizione»: stesso controllo (`productName`), un secondo nome.
    it('aprendola compaiono i campi del corpo', async () => {
      const rendered = await conRigaSuMobile();

      await userEvent.click(screen.getByText(VARIANTE.productName));
      rendered.fixture.detectChanges();

      expect(screen.getByLabelText('Nome prodotto')).toBeTruthy();
      expect(screen.getByLabelText('Sconto')).toBeTruthy();
    });

    it('⭐ la spunta di magazzino porta l’etichetta del modo anche su card', async () => {
      const rendered = await conRigaSuMobile();

      await userEvent.click(screen.getByText(VARIANTE.productName));
      rendered.fixture.detectChanges();

      expect(screen.getByLabelText('Scarica giacenze')).toBeTruthy();
    });

    it('⭐ e sul Reso la STESSA spunta dice «Carica giacenze»', async () => {
      const rendered = await conRigaSuMobile({ mode: 'return' });

      await userEvent.click(screen.getByText(VARIANTE.productName));
      rendered.fixture.detectChanges();

      expect(screen.getByLabelText('Carica giacenze')).toBeTruthy();
      // Stesso campo del modello: la card non introduce una seconda proprietà.
      expect(rendered.component.lines()[0]!.loadsStock).toBe(true);
    });

    it('⭐ il selettore Colonne c e anche su card, e governa quello che si vede', async () => {
      // ⛔ Qui si asseriva il CONTRARIO — «le card non hanno colonne» — ed era
      // vero finche' il corpo della card era scritto a mano dalla maschera:
      // il selettore non lo raggiungeva, quindi era un comando che non
      // comandava e nasconderlo era giusto.
      //
      // ⭐ Da quando il corpo e' guidato dal catalogo, quel selettore governa
      // anche la vista compatta. Un comando si spegne per CONFIGURAZIONE, non
      // per larghezza dello schermo (deciso dal proprietario il 24/08/2026).
      const rendered = await conRigaSuMobile();
      await userEvent.click(document.querySelector('.doc-line-card__expand')!);
      rendered.fixture.detectChanges();

      expect(screen.queryByText('Colonne')).not.toBeNull();
      // E governa davvero: il campo EAN c'e' finche' la colonna e' accesa…
      //
      // ⚠️ Si guarda l'ETICHETTA e non un `<input>`: su riga agganciata la
      // cella codice comune rende un valore in sola lettura, come sul desktop.
      expect(screen.queryByText('EAN')).not.toBeNull();
    });

    it('⛔ …e spenta la colonna, il campo sparisce anche dalla card', async () => {
      colonneSpente.add('barcode');
      const rendered = await conRigaSuMobile();
      await userEvent.click(document.querySelector('.doc-line-card__expand')!);
      rendered.fixture.detectChanges();

      expect(screen.queryByText('EAN')).toBeNull();
    });

    it('⭐ l’inserimento riuscito suona: è la conferma che si sente senza guardare', async () => {
      // `11` C: da telefono si spara un capo dopo l'altro con una mano sola e
      // lo sguardo sul cliente. Il beep è l'unico segnale che arriva comunque.
      const suoni = stubAudioContext();

      await conRigaSuMobile();

      expect(suoni.length).toBeGreaterThan(0);
    });

    it('⭐ preso e non trovato suonano DIVERSI', async () => {
      const suoni = stubAudioContext();
      const rendered = await conRigaSuMobile();

      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, 'codice-che-non-esiste{enter}');
      rendered.fixture.detectChanges();

      // Se fossero uguali, il beep direbbe «è successo qualcosa» invece di dire
      // che cosa — e senza guardare non si distinguerebbe.
      expect(new Set(suoni).size).toBeGreaterThan(1);
    });

    it('⛔ su desktop l’inserimento riuscito NON suona: la riga che compare è già la conferma', async () => {
      const suoni = stubAudioContext();
      const rendered = await setup();

      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      expect(suoni).toEqual([]);
    });

    it('lo stepper della card cambia la quantità della riga', async () => {
      const rendered = await conRigaSuMobile();

      await userEvent.click(screen.getByLabelText('Aumenta quantità'));

      expect(rendered.component.lines()[0]!.quantity).toBe(2);
    });

    it('⭐ il cestino in testata ELIMINA davvero la riga', async () => {
      // ⛔ Guardia di un difetto MISURATO sull'involucro locale: la card
      // condivisa emette `removeRequested` dal cestino della testata, ma
      // l'involucro non lo dichiarava fra i propri output e quindi non lo
      // rilanciava. Il cestino si premeva e non succedeva niente — un comando
      // che non comanda, e nessun test lo vedeva perché la riga restava
      // eliminabile dal pulsante in fondo al corpo aperto.
      const rendered = await conRigaSuMobile();
      expect(rendered.component.lines()).toHaveLength(1);

      await userEvent.click(screen.getByLabelText('Elimina riga'));
      rendered.fixture.detectChanges();

      expect(rendered.component.lines()).toHaveLength(0);
    });
  });

  describe('netto / ivato (A4)', () => {
    it('⭐ la modalità iniziale viene dal contratto comune, non dal banco', async () => {
      const rendered = await setup({ priceMode: true });

      expect(rendered.component.pricesIncludeVat()).toBe(true);
    });

    it('⭐ cambiare modalità NON cambia il dato: il netto resta il netto', async () => {
      const rendered = await setup({ priceMode: false });
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      const nettoPrima = rendered.component.lines()[0]!.unitPriceMinor;

      rendered.component.setPriceMode(true);
      rendered.fixture.detectChanges();

      expect(rendered.component.lines()[0]!.unitPriceMinor).toBe(nettoPrima);
    });

    it('la modalità viaggia nel payload: si persiste sul documento', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await setup({ createSale, priceMode: true });
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);

      rendered.component.save();

      expect(corpoVendita(createSale).pricesIncludeVat).toBe(true);
    });

    it('in modifica la modalità è quella del documento', async () => {
      // VENDITA porta `pricesIncludeVat: true`: la maschera la carica da lì e
      // non la ripropone dalla memoria dell'operatore.
      const rendered = await setup({ editId: 'doc-sale-1', priceMode: false });

      expect(rendered.component.pricesIncludeVat()).toBe(true);
    });

    it('⭐ il selettore sta nella TESTATA della colonna Prezzo', async () => {
      const rendered = await setup({ priceMode: false });
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      const intestazione = screen.getByRole('columnheader', { name: /Prezzo netto/ });
      expect(intestazione.querySelector('app-price-mode-menu')).toBeTruthy();
    });
  });

  // ── Il piede (`11` A16, A17) ─────────────────────────────────────────────

  describe('il piede', () => {
    async function conUnaRiga(extra: Partial<SetupOptions> = {}) {
      const rendered = await setup(extra);
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('i totali vengono dal motore comune, non da una somma locale', async () => {
      // Riga: 20,00 netti × 1, IVA 22% → imponibile 20,00, imposta 4,40.
      await conUnaRiga();

      expect(screen.getByText('Imponibile righe')).toBeTruthy();
      // Senza sconto documento imponibile righe e imponibile coincidono: il
      // valore compare due volte, ed è giusto così.
      expect(screen.getAllByText('20,00 €').length).toBeGreaterThan(0);
      expect(screen.getByText('4,40 €')).toBeTruthy();
      expect(screen.getByText('24,40 €')).toBeTruthy();
    });

    it('⛔ lo Sconto extra NON è esposto: è percentuale E importo, e D1 è aperta', async () => {
      await conUnaRiga();

      // Una sezione con la sola percentuale consoliderebbe una forma che
      // sappiamo già incompleta (`11` A16).
      expect(screen.queryByText(/Sconto extra/i)).toBeNull();
      expect(screen.queryByLabelText(/Sconto documento/i)).toBeNull();
    });

    it('⭐ uno sconto documento già persistito si vede nei totali e non si perde', async () => {
      // Non esporre un controllo non significa ignorare un dato: il valore
      // entra nei totali e resta sul documento.
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({
        editId: 'doc-sale-1',
        loadDocument: { ...VENDITA, documentDiscountPercent: 10 },
        createSale,
      });

      expect(screen.getByText('Sconto documento')).toBeTruthy();
      component.save();
      // ⛔ E il payload non lo azzera: il campo non c'è, quindi il server
      // conserva quello persistito.
      expect(corpoVendita(createSale)).not.toHaveProperty('documentDiscountPercent');
    });

    it('sulla Vendita l’azione finale dice «Concludi vendita»', async () => {
      await conUnaRiga();

      expect(screen.getByRole('button', { name: 'Concludi vendita' })).toBeTruthy();
    });

    it('sul Reso dice «Concludi reso»', async () => {
      await conUnaRiga({ mode: 'return' });

      expect(screen.getByRole('button', { name: 'Concludi reso' })).toBeTruthy();
    });

    it('senza righe non si conclude', async () => {
      await setup();

      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Concludi vendita' }).disabled,
      ).toBe(true);
    });

    it('la causale sta nel piede del Reso', async () => {
      await conUnaRiga({ mode: 'return' });

      expect(screen.getByLabelText('Causale (facoltativa)')).toBeTruthy();
    });

    it('⛔ e non compare sulla Vendita: la specifica non la prevede', async () => {
      await conUnaRiga();

      expect(screen.queryByLabelText('Causale (facoltativa)')).toBeNull();
    });

    it('note e causale caricate da un documento restano nel payload', async () => {
      const createReturn = vi.fn(() => of(ESITO));
      const { component } = await setup({
        mode: 'return',
        editId: 'doc-return-1',
        loadDocument: RESO,
        createReturn,
      });

      component.save();

      const corpo = corpoReso(createReturn);
      expect(corpo.causale).toBe('Capo difettoso');
      expect(corpo.notes).toBe('Consegnato a mano');
    });

    it('⛔ nessun Pagamento nel piede: è differito (A8)', async () => {
      const { container } = await conUnaRiga();

      expect(container.textContent).not.toContain('Pagamento');
      expect(container.textContent).not.toContain('Contanti');
    });
  });

  describe('dopo la conclusione', () => {
    async function concludi(extra: Partial<SetupOptions> = {}) {
      const rendered = await setup(extra);
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      rendered.component.save();
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('⭐ la conferma nomina il documento appena concluso', async () => {
      await concludi();

      expect(screen.getByText(/Vendita conclusa: VN-1/)).toBeTruthy();
    });

    it('⭐ e la compilazione è già quella del cliente successivo', async () => {
      const rendered = await concludi();

      expect(rendered.component.lines()).toHaveLength(0);
      expect(screen.getByLabelText<HTMLInputElement>('Scansiona o cerca un articolo').value).toBe(
        '',
      );
    });

    it('⭐ il modo NON cambia: si resta su Vendita', async () => {
      await concludi();

      expect(screen.getByRole('heading', { name: 'Nuova vendita al banco' })).toBeTruthy();
    });

    it('⭐ la vendita successiva ha un intento di creazione NUOVO', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await concludi({ createSale });

      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      rendered.component.save();

      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ la sede torna al default comune: un override non si trascina', async () => {
      // ⛔ Nessuna memoria del banco: la compilazione nuova riparte dalle stesse
      // regole di una aperta adesso.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await setup({ createSale, defaultLocation: SEDE.id });
      rendered.component.onLocationChange(ALTRA_SEDE.id);
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      rendered.component.save();
      rendered.fixture.detectChanges();

      // La vendita conclusa è andata sull'altra sede…
      expect(corpoVendita(createSale).locationId).toBe(ALTRA_SEDE.id);
      // …ma quella dopo riparte dalla predefinita.
      expect(rendered.component.form.controls.locationId.value).toBe(SEDE.id);
    });

    it('⛔ in MODIFICA non si svuota: non è un cliente successivo', async () => {
      // Correggere un documento esistente non è un'operazione di banco:
      // svuotare farebbe sparire ciò che si stava correggendo.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await setup({ editId: 'doc-sale-1', createSale });

      rendered.component.save();
      rendered.fixture.detectChanges();

      expect(rendered.component.lines()).toHaveLength(1);
    });
  });

  describe('idempotenza della creazione (T15)', () => {
    it('⭐ errore INCERTO: il reinvio porta lo STESSO intento', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({ kind: 'timeout', message: 'Troppo tempo.' })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      const primo = corpoVendita(createSale, 0).creationIntentId;
      const secondo = corpoVendita(createSale, 1).creationIntentId;
      expect(primo).toBeTruthy();
      // Il server potrebbe aver committato lo stesso: un intento nuovo
      // creerebbe un secondo documento.
      expect(secondo).toBe(primo);
    });

    it('⭐ errore CERTO: l’intento si chiude, il successivo è nuovo', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({ kind: 'validation', message: 'Dati non validi.', status: 422 })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ successo: l’intento si chiude — la vendita dopo è un’altra', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      // Due clienti, stessa maglietta, stesso minuto: due vendite.
      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ il 409 non è una categoria sola: l’intento occupato NON si chiude', async () => {
      const createSale = vi.fn(() =>
        throwError(() => errore409({ code: 'creation_intent_in_progress', resultRef: null })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      // Chiuderlo renderebbe il tentativo successivo una seconda creazione
      // inconsapevole.
      expect(corpoVendita(createSale, 1).creationIntentId).toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ numero già preso: la transazione ha fatto rollback, l’intento si chiude', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({
          kind: 'conflict',
          message: 'Numero già assegnato.',
          status: 409,
          details: new HttpErrorResponse({
            status: 409,
            error: { message: { code: 'document_number_taken' } },
          }),
        })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('quando il server nomina il documento già creato, il riferimento si conserva', async () => {
      const createSale = vi.fn(() =>
        throwError(() =>
          errore409({ code: 'creation_intent_mismatch', resultRef: 'doc-esistente' }),
        ),
      );
      const { component } = await setup({ createSale });

      component.save();

      expect(component.alreadyCreatedDocumentId()).toBe('doc-esistente');
    });
  });

  // ── Numero e serie: il contratto comune (T8B) ──────────────────────────
  //
  // ⛔ Nessuna numerazione del banco: quello che si verifica qui è che la
  // maschera usi il contratto comune, non che ne abbia uno suo.
  describe('numero e serie (T8B)', () => {
    const CONTATORE_B = { ...CONTATORE, id: 'cnt-2', series: 'B', isDefault: false, nextNumber: 5 };

    function campoNumero(container: HTMLElement): HTMLInputElement {
      // Per id, non per etichetta: la testata porta i due gemelli — pannello
      // mobile e griglia desktop — e «Numero» li nominerebbe entrambi.
      return container.querySelector<HTMLInputElement>('#ssf-number')!;
    }

    async function conRiga(rendered: Awaited<ReturnType<typeof setup>>) {
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('⭐ documento nuovo: la testata mostra il primo libero — ma non lo manda', async () => {
      // È una PROPOSTA: lo prende chi salva per primo, e finché nessuno la
      // tocca il numero lo assegna il server dentro la transazione.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await conRiga(await setup({ createSale }));

      expect(campoNumero(rendered.container).value).toBe('41');

      rendered.component.save();

      expect(corpoVendita(createSale).number).toBeUndefined();
      // Serie mai scelta = «decidi tu»: la sceglie il server col predefinito.
      expect(corpoVendita(createSale).series).toBeUndefined();
    });

    it('⭐ numero DIGITATO: da lì è una scelta, e viaggia', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await conRiga(await setup({ createSale }));

      const campo = campoNumero(rendered.container);
      await userEvent.clear(campo);
      await userEvent.type(campo, '77');
      rendered.fixture.detectChanges();
      rendered.component.save();

      expect(corpoVendita(createSale).number).toBe(77);
    });

    it('⭐ «Senza serie» è una SCELTA, e viaggia come stringa vuota', async () => {
      // ⛔ Ometterla la farebbe leggere come «decidi tu», e il documento
      // uscirebbe sotto la serie predefinita: il contrario di ciò che si è
      // scelto.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await conRiga(
        await setup({ createSale, counters: [CONTATORE, CONTATORE_B] }),
      );

      rendered.component.numbering.onSeriesChange('');
      rendered.fixture.detectChanges();
      rendered.component.save();

      expect(corpoVendita(createSale).series).toBe('');
    });

    it('⭐ in MODIFICA numero e serie si caricano, e restano MODIFICABILI', async () => {
      // Correzione del proprietario, 21/08/2026: il banco non fa eccezione al
      // contratto comune. Il server li scriveva solo alla nascita — era un gap.
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await setup({ createSale, editId: 'doc-sale-1' });
      rendered.fixture.detectChanges();

      const campo = campoNumero(rendered.container);
      expect(campo.value).toBe('12');
      expect(campo.disabled).toBe(false);

      await userEvent.clear(campo);
      await userEvent.type(campo, '13');
      rendered.fixture.detectChanges();
      rendered.component.save();

      expect(corpoVendita(createSale).number).toBe(13);
      // In modifica la serie viaggia SEMPRE: è del documento, e ometterla
      // dopo un cambio lo lascerebbe con quella vecchia.
      expect(corpoVendita(createSale).series).toBe('');
    });

    it('⭐ cambio di SEDE: i contatori si richiedono di nuovo', async () => {
      // Un contatore legato a una sede vale solo lì: senza ricarica la tendina
      // offrirebbe serie che in questa sede non si possono usare.
      const rendered = await setup({ defaultLocation: SEDE.id });
      const prima = rendered.available.mock.calls.length;

      rendered.component.onLocationChange(ALTRA_SEDE.id);
      rendered.fixture.detectChanges();

      expect(rendered.available.mock.calls.length).toBeGreaterThan(prima);
    });

    it('⭐ concluso un documento, il successivo riparte da una PROPOSTA', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const rendered = await conRiga(await setup({ createSale }));
      const campo = campoNumero(rendered.container);
      await userEvent.clear(campo);
      await userEvent.type(campo, '77');
      rendered.fixture.detectChanges();

      rendered.component.save();
      rendered.fixture.detectChanges();
      await conRiga(rendered);
      rendered.component.save();

      // ⛔ Il documento dopo non eredita il numero imposto per quello prima:
      // sarebbe un numero già usato, mandato di nuovo come scelta.
      expect(corpoVendita(createSale, 1).number).toBeUndefined();
    });

    it('⭐ numero già preso: l’avviso scrive in testata il primo libero', async () => {
      const createSale = vi.fn(() =>
        throwError(() =>
          errore409({
            code: 'document_number_taken',
            number: 41,
            nextAvailable: 42,
            series: null,
          }),
        ),
      );
      const rendered = await conRiga(await setup({ createSale }));

      rendered.component.save();
      rendered.fixture.detectChanges();

      expect(screen.getByText('Numero già usato')).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'OK' }));
      rendered.fixture.detectChanges();

      // Ridigitarlo a mano sarebbe l'occasione per un errore di battitura e
      // un secondo conflitto: il numero nuovo lo scrive la maschera.
      expect(campoNumero(rendered.container).value).toBe('42');
    });
  });

  // ── Fotocamera e codice non trovato ────────────────────────────────────
  //
  // ⛔ La regola è una sola: **niente si crea da sé e niente si apre da sé**
  // (`11` A14). Un'azione scelta dall'operatore è un'altra cosa.
  describe('scansione con fotocamera e articolo non a catalogo', () => {
    it('⭐ «Scansiona» c’è su MOBILE, dove la fotocamera serve', async () => {
      conFotocamera();
      await setup({ barcodeScanner: true, compact: true });

      expect(screen.getByRole('button', { name: /Scansiona/ })).toBeTruthy();
    });

    it('⛔ su DESKTOP il comando fotocamera NON compare', async () => {
      // Decisione del proprietario, 24/08/2026: davanti a un monitor la
      // fotocamera del portatile inquadra l'operatore, non il capo — e un
      // pulsante che apre una finestra inutilizzabile è un comando che non
      // comanda.
      //
      // ⚠️ **La scansione resta**: su scrivania si legge col lettore HID, che
      // scrive nel campo di ricerca come una tastiera. La prova qui sotto
      // inchioda proprio quello — il campo c'è, e accetta il codice.
      conFotocamera();
      await setup({ barcodeScanner: true });

      expect(screen.queryByRole('button', { name: /Scansiona/ })).toBeNull();
      expect(screen.getByLabelText('Scansiona o cerca un articolo')).toBeTruthy();
    });

    it('⛔ e il lettore HID continua a funzionare su desktop', async () => {
      const rendered = await setup({ barcodeScanner: true });

      // Una pistola HID scrive nel campo e preme Invio: e' una tastiera.
      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_NOTO}{enter}`);
      rendered.fixture.detectChanges();

      expect(rendered.component.form.controls.lines.length).toBe(1);
    });

    it('senza la bandiera d ambiente il comando non compare, nemmeno su mobile', async () => {
      conFotocamera();
      await setup({ barcodeScanner: false, compact: true });

      expect(screen.queryByRole('button', { name: /Scansiona/ })).toBeNull();
    });

    it('⭐ la riga dall’overlay passa dalla porta comune: stesso articolo → INCREMENTA', async () => {
      // È la regola del banco (A14), e non la decide la scansione: due passate
      // dello stesso capo sono due pezzi, non due righe.
      const rendered = await setup();

      rendered.component.onScanLineAdded({ variantId: VARIANTE.variantId, quantity: 2 });
      rendered.fixture.detectChanges();
      rendered.component.onScanLineAdded({ variantId: VARIANTE.variantId, quantity: 3 });
      rendered.fixture.detectChanges();

      expect(rendered.component.lines()).toHaveLength(1);
      expect(rendered.component.lines()[0]!.quantity).toBe(5);
    });

    it('⭐ codice non trovato: nessun pannello si apre da sé, ma le AZIONI ci sono', async () => {
      stubAudioContext();
      const rendered = await setup({ user: OPERATORE_CATALOGO });

      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_IGNOTO}{enter}`);
      rendered.fixture.detectChanges();

      // ⛔ Nessuna anagrafica aperta d'ufficio.
      expect(screen.queryByText('Anagrafica prodotto')).toBeNull();
      expect(rendered.component.lines()).toHaveLength(0);
      // ⭐ Ma la via d'uscita è a schermo, ed è una scelta.
      expect(screen.getByRole('button', { name: 'Crea prodotto' })).toBeTruthy();
    });

    it('⭐ senza permesso sul catalogo il comando non c’è: c’è a chi chiedere', async () => {
      stubAudioContext();
      const rendered = await setup({ user: null });

      const campo = screen.getByLabelText('Scansiona o cerca un articolo');
      await userEvent.type(campo, `${EAN_IGNOTO}{enter}`);
      rendered.fixture.detectChanges();

      expect(screen.queryByRole('button', { name: 'Crea prodotto' })).toBeNull();
      expect(rendered.container.textContent).toContain('chiedi a un responsabile');
    });
  });

  // ── La tabella righe a documento vuoto ─────────────────────────────────
  describe('area righe senza righe', () => {
    it('⭐ a testata completa la TABELLA c’è, con le sue intestazioni', async () => {
      // Come sul riferimento (Ordine cliente, `11` A15): le intestazioni dicono
      // che cosa si sta per compilare, e il selettore Colonne ha un senso.
      const rendered = await setup({ defaultLocation: SEDE.id });

      expect(rendered.container.querySelector('table')).toBeTruthy();
      expect(screen.getByText('Nessuna riga inserita')).toBeTruthy();
    });

    it('⛔ a testata INCOMPLETA la tabella non c’è: al suo posto cosa manca', async () => {
      const rendered = await setup({ defaultLocation: null });

      expect(rendered.container.querySelector('table')).toBeNull();
      expect(screen.getByText('Scegli la sede')).toBeTruthy();
    });
  });
});
