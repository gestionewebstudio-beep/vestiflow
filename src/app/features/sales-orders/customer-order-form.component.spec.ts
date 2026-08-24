import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { DocumentType } from '@core/models/document.model';
import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
import { DocumentActionsService } from '@core/services/document-actions.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';
import { ViewportService } from '@core/services/viewport.service';

import { CustomerOrderFormComponent } from './customer-order-form.component';

/**
 * Test di CARATTERIZZAZIONE.
 *
 * Non descrivono come il form dovrebbe comportarsi: fotografano come si
 * comporta OGGI, per poter estrarre il core condiviso dei form documento
 * sapendo se qualcosa cambia. I valori attesi sono calcolati a mano dalla
 * specifica di dominio (imponibile, sconto documento ripartito per aliquota,
 * IVA su netto scontato) e vanno cambiati solo con una decisione esplicita.
 */

const IVA_22 = { id: 'vat-22', ratePercent: 22, calculationMode: 'standard', label: '22%' };
const IVA_10 = { id: 'vat-10', ratePercent: 10, calculationMode: 'standard', label: '10%' };
const ESENTE = { id: 'vat-esente', ratePercent: 0, calculationMode: 'exempt', label: 'Esente' };
const VAT_CODES = [IVA_22, IVA_10, ESENTE];

const LOCATIONS = [{ id: 'loc-1', name: 'Milano' }];

function operationalLocationsMock() {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => null,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

/**
 * Modalità della maschera e documento caricato: l'unica cosa che cambia fra un
 * Ordine cliente nuovo e un DDT già salvato che si riapre.
 */
interface FormOptions {
  readonly kind?: 'quote' | 'sales-ddt' | 'manual-unload';
  readonly id?: string;
  readonly user?: unknown;
  readonly document?: unknown;
  readonly order?: unknown;
  readonly updateDocument?: ReturnType<typeof vi.fn>;
  readonly createDocument?: ReturnType<typeof vi.fn>;
  readonly saveManualOrder?: ReturnType<typeof vi.fn>;
  /** Tipi di scarico disponibili: senza, «Concludi ordine» non compare mai. */
  readonly unloadDocumentTypes?: readonly string[];
  /** Primo numero libero proposto dal numeratore predefinito del tipo. */
  readonly proposedNumber?: number;
  /** Tipo del numeratore proposto (deve combaciare con `kind`). */
  readonly counterType?: DocumentType;
  readonly toast?: { readonly showInfo: ReturnType<typeof vi.fn> };
}

function formProviders(options: FormOptions = {}) {
  const counters =
    options.proposedNumber === undefined
      ? []
      : [
          {
            id: 'cnt-1',
            type: options.counterType ?? DocumentType.Quote,
            series: null,
            locationId: null,
            locationName: null,
            isDefault: true,
            nextNumber: options.proposedNumber,
            documentCount: 0,
          },
        ];
  return [
    // Catch-all: creato il documento, la maschera naviga davvero al dettaglio.
    // Senza una rotta che agganci, quella navigazione fallisce.
    provideRouter([{ path: '**', children: [] }]),
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: {
          data: options.kind ? { customerDocumentKind: options.kind } : {},
          queryParamMap: convertToParamMap({}),
        },
        paramMap: of(convertToParamMap(options.id ? { id: options.id } : {})),
      },
    },
    {
      provide: APP_CONFIG,
      useValue: {
        production: false,
        appName: 'VestiFlow',
        apiBaseUrl: '',
        features: { barcodeScanner: false, shopify: false },
      },
    },
    { provide: AuthService, useValue: { currentUser: () => options.user ?? null } },
    { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
    { provide: VatCodeService, useValue: { list: () => of(VAT_CODES) } },
    { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
    {
      provide: CustomerService,
      useValue: { getAllCustomers: () => of([]), createCustomer: vi.fn() },
    },
    {
      provide: BarcodeLookupService,
      useValue: { resolveVariantIdByCode: () => of(null), parseScanInput: (v: string) => v },
    },
    { provide: BreadcrumbLabelService, useValue: { set: vi.fn(), clear: vi.fn() } },
    { provide: DocumentActionsService, useValue: { set: vi.fn(), clear: vi.fn() } },
    {
      provide: DocumentCountersService,
      useValue: {
        available: () => of({ counters, proposedCounterId: counters.length > 0 ? 'cnt-1' : null }),
      },
    },
    {
      provide: ToastService,
      useValue: options.toast ?? { showInfo: vi.fn(), showError: vi.fn() },
    },
    // Tendina del documento della controparte in testata: il componente
    // condiviso la carica appena viene montato.
    { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
    {
      provide: DocumentService,
      useValue: {
        getDocumentById: options.document ? () => of(options.document) : vi.fn(),
        createDocument: options.createDocument ?? vi.fn(),
        updateDocument: options.updateDocument ?? vi.fn(),
        previewDocumentNumber: () =>
          of({ reference: 'OC-2026-0001', previewNumber: 1, series: 'A', year: 2026 }),
        // Solo i documenti a registro leggono la preferenza: l'Ordine
        // cliente resta a netto (modalita' prezzo ri-gated).
        getPriceModePreference: () => of(false),
        // Controllo cronologico (§4): serie in ordine, nessun avviso.
        checkChronology: () => of({ conflicts: [], dismissed: false }),
        dismissChronologyWarning: () => of(void 0),
      },
    },
    {
      provide: ProductService,
      useValue: {
        searchVariantSummaries: () => of([]),
        getSupplierVariantLinks: () => of([]),
        createProduct: vi.fn(),
      },
    },
    {
      provide: SalesOrderService,
      useValue: {
        getManualOrderMeta: () =>
          of(
            options.unloadDocumentTypes
              ? { unloadDocumentTypes: options.unloadDocumentTypes }
              : null,
          ),
        getSalesOrderById: options.order ? () => of(options.order) : vi.fn(),
        saveManualOrder: options.saveManualOrder ?? vi.fn(),
        reloadOwnReservations: vi.fn(),
        getOrderReservations: () => of([]),
      },
    },
    { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
    {
      provide: TableViewPreferenceApiService,
      useValue: { load: () => of(null), save: () => of(undefined) },
    },
  ];
}

/**
 * Le due viste di riga sono ESCLUSIVE, non una nascosta sotto l'altra.
 *
 * Prima la tabella restava viva sotto il breakpoint, solo invisibile: gli
 * identificativi dei campi esistevano in doppia copia, e ogni stato condiviso
 * poteva aprirsi nella vista che non si vede — è già successo con la scelta fra
 * più codici. È anche il presupposto del punto unico della navigazione, che
 * lavora per identificativo: con due viste vive «l'id della riga i, campo x»
 * non è univoco.
 */
describe('CustomerOrderFormComponent — le due viste di riga', () => {
  async function apri(compatta: boolean) {
    const view = await render(CustomerOrderFormComponent, {
      providers: [
        ...formProviders(),
        { provide: ViewportService, useValue: { compact: () => compatta } },
      ],
    });
    const comp = view.fixture.componentInstance as unknown as {
      addLine: () => void;
      form: { controls: Record<string, { setValue: (v: unknown) => void }> };
      lines: {
        at: (i: number) => {
          controls: Record<string, { setValue: (v: unknown) => void; value: unknown }>;
        };
      };
    };
    // La testata va completata: finché mancano cliente e location le righe non
    // esistono in NESSUNA delle due viste — al loro posto c'è lo stato vuoto.
    comp.form.controls['customerId']!.setValue('cus-1');
    comp.form.controls['locationId']!.setValue('loc-1');
    comp.addLine();
    comp.lines.at(0).controls['productName']!.setValue('Articolo');
    view.fixture.detectChanges();
    return view.container;
  }

  it('sopra la soglia vive la tabella, e le card non esistono', async () => {
    const c = await apri(false);

    expect(c.querySelector('.doc-form__table-wrap')).not.toBeNull();
    expect(c.querySelector('.co-form__cards')).toBeNull();
  });

  it('sotto la soglia vivono le card, e la tabella non esiste', async () => {
    const c = await apri(true);

    expect(c.querySelector('.co-form__cards')).not.toBeNull();
    // Non «nascosta»: assente. Se tornasse a esserci, tornerebbero i doppioni
    // di identificativo su cui la navigazione andrà a poggiare.
    expect(c.querySelector('.doc-form__table-wrap')).toBeNull();
  });

  // Il presupposto del punto unico: un identificativo, un elemento. Prima
  // `co-sku-0` e `co-m-sku-0` esistevano insieme, e `getElementById` trovava
  // quello nascosto — `.focus()` diventava un no-op silenzioso.
  it('sopra la soglia esiste solo l’identificativo della tabella', async () => {
    const c = await apri(false);

    expect(c.querySelectorAll('#co-sku-0')).toHaveLength(1);
    expect(c.querySelectorAll('#co-m-sku-0')).toHaveLength(0);
  });

  // La card tiene i codici nel corpo, che si apre: si espande prima di
  // guardare, altrimenti la prova misurerebbe una card chiusa e passerebbe
  // anche se la tabella fosse ancora viva.
  it('sotto la soglia esiste solo l’identificativo della card', async () => {
    const view = await render(CustomerOrderFormComponent, {
      providers: [
        ...formProviders(),
        { provide: ViewportService, useValue: { compact: () => true } },
      ],
    });
    const comp = view.fixture.componentInstance as unknown as {
      addLine: () => void;
      toggleLineCard: (i: number) => void;
      form: { controls: Record<string, { setValue: (v: unknown) => void }> };
      lines: {
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
      };
    };
    comp.form.controls['customerId']!.setValue('cus-1');
    comp.form.controls['locationId']!.setValue('loc-1');
    comp.addLine();
    comp.lines.at(0).controls['productName']!.setValue('Articolo');
    comp.toggleLineCard(0);
    view.fixture.detectChanges();

    expect(view.container.querySelectorAll('#co-m-sku-0')).toHaveLength(1);
    expect(view.container.querySelectorAll('#co-sku-0')).toHaveLength(0);
  });
});

/**
 * Il giro del fuoco, innestato sul punto unico.
 *
 * Prova sul DOM vero: `focus()` su un id inesistente è un no-op silenzioso, ed è
 * il difetto da cui questo lavoro parte.
 */
describe('CustomerOrderFormComponent — il fuoco atterra dove deve', () => {
  async function conRighe(quante: number) {
    const view = await render(CustomerOrderFormComponent, { providers: formProviders() });
    const comp = view.fixture.componentInstance as unknown as {
      addLine: () => void;
      form: { controls: Record<string, { setValue: (v: unknown) => void }> };
      lines: {
        length: number;
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
      };
      lineFocus: {
        rowDown: (i: number, field: string) => void;
        next: (i: number, field: string) => void;
      };
    };
    // Le righe vivono dentro un `fieldset` disabilitato finché cliente e
    // location non ci sono: un campo dentro un fieldset disabilitato NON prende
    // il fuoco, e la prova misurerebbe il cancello invece del giro.
    comp.form.controls['customerId']!.setValue('cli-1');
    comp.form.controls['locationId']!.setValue('loc-1');
    while (comp.lines.length < quante) {
      comp.addLine();
    }
    for (let i = 0; i < quante; i += 1) {
      comp.lines.at(i).controls['productName']!.setValue(`Articolo ${i}`);
    }
    view.fixture.detectChanges();
    return { view, comp };
  }

  const fuoco = () => globalThis.document.activeElement?.id ?? '';

  /**
   * Il cambio riga passa dal gancio, che rimanda di un tick: è lì che vive il
   * tempismo del fuoco, perché una riga appena creata dev'essere resa prima che
   * qualcuno provi a metterci il fuoco dentro.
   */
  const dopoIlGancio = () => new Promise((risolvi) => setTimeout(risolvi));

  it('↓ conserva la colonna', async () => {
    const { comp } = await conRighe(2);

    comp.lineFocus.rowDown(0, 'unitPrice');
    await dopoIlGancio();

    expect(fuoco()).toBe('co-price-1');
  });

  // Difetto chiuso dall'innesto: la riga «documento collegato» non rende alcun
  // controllo del giro, quindi il fuoco ci finiva sopra e MORIVA.
  it('la riga «documento collegato» viene scavalcata, non è una fermata', async () => {
    const { view, comp } = await conRighe(3);
    comp.lines.at(1).controls['isReference']!.setValue(true);
    view.fixture.detectChanges();

    comp.lineFocus.rowDown(0, 'quantity');
    await dopoIlGancio();

    expect(fuoco()).toBe('co-qty-2');
  });
});

describe('CustomerOrderFormComponent — caratterizzazione', () => {
  async function setup() {
    const view = await render(CustomerOrderFormComponent, {
      providers: formProviders(),
    });

    const component = view.fixture.componentInstance as unknown as {
      lines: {
        at: (i: number) => {
          controls: Record<string, { setValue: (v: unknown) => void; value: unknown }>;
        };
        length: number;
      };
      form: { controls: Record<string, { setValue: (v: unknown) => void; value: unknown }> };
      documentTotals: () => {
        linesTotal: { amountMinor: number };
        documentDiscount: { amountMinor: number };
        subtotal: { amountMinor: number };
        tax: { amountMinor: number };
        total: { amountMinor: number };
      };
      addLine: () => void;
      buildSavePayload: () => Record<string, unknown>;
      pricesIncludeVat: { (): boolean; set: (v: boolean) => void };
      setPriceMode: (pricesIncludeVat: boolean) => void;
      patchFormFromOrder: (order: unknown) => void;
      numberConflictDialog: {
        open: (conflict: Record<string, unknown>) => void;
        isOpen: () => boolean;
      };
      acknowledgeConflictNumber: () => void;
      /** True finché in testata c'è la proposta e nessuno l'ha toccata. */
      numberIsProposal: () => boolean;
    };

    return { ...view, component };
  }

  interface Line {
    readonly name?: string;
    readonly qty?: number;
    readonly price?: string;
    readonly vatCodeId?: string;
    readonly discount?: string;
    readonly isReference?: boolean;
  }

  /** Compila la riga `index`, creandola se serve. */
  function fillLine(
    component: Awaited<ReturnType<typeof setup>>['component'],
    index: number,
    line: Line,
  ): void {
    while (component.lines.length <= index) {
      component.addLine();
    }
    const controls = component.lines.at(index).controls;
    controls['productName']!.setValue(line.name ?? 'Articolo');
    controls['quantity']!.setValue(line.qty ?? 1);
    controls['unitPrice']!.setValue(line.price ?? '');
    controls['vatCodeId']!.setValue(line.vatCodeId ?? '');
    controls['discount']!.setValue(line.discount ?? '');
    controls['isReference']!.setValue(line.isReference ?? false);
  }

  /** Ordine già salvato, nella forma che il form riceve dal mapper. */
  function ordineSalvato(over: {
    pricesIncludeVat?: boolean;
    unitPriceMinor?: number;
  }): Record<string, unknown> {
    const amountMinor = over.unitPriceMinor ?? 10000;
    return {
      id: 'ord-1',
      orderNumber: 'OC-0001',
      customerId: 'cli-1',
      locationId: 'loc-1',
      placedAt: '2026-08-01T00:00:00.000Z',
      pricesIncludeVat: over.pricesIncludeVat === true,
      documentDiscountPercent: 0,
      lines: [
        {
          id: 'line-1',
          sku: 'SKU-1',
          title: 'Maglietta',
          quantity: 1,
          unitPrice: { amountMinor, currencyCode: 'EUR' },
          lineTotal: { amountMinor: Math.round(amountMinor), currencyCode: 'EUR' },
          vatCodeId: IVA_22.id,
          commitsStock: true,
          isReference: false,
        },
      ],
    };
  }

  let view: Awaited<ReturnType<typeof setup>>;

  describe('documentTotals', () => {
    beforeEach(async () => {
      view = await setup();
    });

    it('documento vuoto: tutti i totali a zero', () => {
      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 0 },
        documentDiscount: { amountMinor: 0 },
        subtotal: { amountMinor: 0 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 0 },
      });
    });

    it('riga senza codice IVA: imponibile = totale, nessuna imposta', () => {
      fillLine(view.component, 0, { qty: 3, price: '10,00' });

      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 3000 },
        subtotal: { amountMinor: 3000 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 3000 },
      });
    });

    it('riga con IVA 22% in modalità netto: imposta sul netto', () => {
      fillLine(view.component, 0, { qty: 2, price: '50,00', vatCodeId: IVA_22.id });

      // 2 × 50,00 = 100,00 netti → IVA 22,00 → totale 122,00
      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        subtotal: { amountMinor: 10000 },
        tax: { amountMinor: 2200 },
        total: { amountMinor: 12200 },
      });
    });

    it('codice IVA non standard (esente): aliquota trattata come zero', () => {
      fillLine(view.component, 0, { qty: 1, price: '100,00', vatCodeId: ESENTE.id });

      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 10000 },
      });
    });

    it('le righe «documento collegato» non entrano nei totali', () => {
      fillLine(view.component, 0, { qty: 1, price: '10,00' });
      fillLine(view.component, 1, { name: 'Preventivo PR-1', isReference: true, price: '999,00' });

      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 1000 },
        total: { amountMinor: 1000 },
      });
    });

    it('sconto documento: riduce l’imponibile e l’IVA segue il netto scontato', () => {
      fillLine(view.component, 0, { qty: 1, price: '100,00', vatCodeId: IVA_22.id });
      view.component.form.controls['documentDiscountPercent']!.setValue('10');

      // 100,00 − 10% = 90,00 imponibile → IVA 19,80 → totale 109,80
      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        documentDiscount: { amountMinor: 1000 },
        subtotal: { amountMinor: 9000 },
        tax: { amountMinor: 1980 },
        total: { amountMinor: 10980 },
      });
    });

    it('sconto documento con due aliquote: IVA ripartita in proporzione', () => {
      fillLine(view.component, 0, { qty: 1, price: '100,00', vatCodeId: IVA_22.id });
      fillLine(view.component, 1, { qty: 1, price: '100,00', vatCodeId: IVA_10.id });
      view.component.form.controls['documentDiscountPercent']!.setValue('10');

      // Imponibile 200,00 − 10% = 180,00, ripartito 50/50 → 90,00 per aliquota.
      // IVA = 90,00·22% + 90,00·10% = 19,80 + 9,00 = 28,80 → totale 208,80
      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 20000 },
        documentDiscount: { amountMinor: 2000 },
        subtotal: { amountMinor: 18000 },
        tax: { amountMinor: 2880 },
        total: { amountMinor: 20880 },
      });
    });
  });

  describe('documentTotals in modalità prezzi ivati', () => {
    it('scorpora il netto dal lordo di riga', async () => {
      view = await setup();
      view.component.pricesIncludeVat.set(true);
      fillLine(view.component, 0, { qty: 1, price: '122,00', vatCodeId: IVA_22.id });

      // 122,00 lordi con IVA 22% → netto 100,00, imposta 22,00, totale 122,00
      expect(view.component.documentTotals()).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        subtotal: { amountMinor: 10000 },
        tax: { amountMinor: 2200 },
        total: { amountMinor: 12200 },
      });
    });
  });

  describe('buildSavePayload', () => {
    beforeEach(async () => {
      view = await setup();
    });

    it('scarta le righe vuote', () => {
      fillLine(view.component, 0, { name: '', qty: 5, price: '10,00' });

      expect(view.component.buildSavePayload()['lines']).toEqual([]);
    });

    it('serializza la riga con prezzo in unità minori e quantità numerica', () => {
      fillLine(view.component, 0, { name: 'Maglietta', qty: 3, price: '19,90' });

      const lines = view.component.buildSavePayload()['lines'] as readonly Record<
        string,
        unknown
      >[];
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        title: 'Maglietta',
        quantity: 3,
        unitPriceMinor: 1990,
        isReference: false,
      });
    });

    it('senza nome usa lo SKU come titolo, e «Articolo» se manca anche quello', () => {
      fillLine(view.component, 0, { name: '' });
      view.component.lines.at(0).controls['sku']!.setValue('SKU-1');

      const lines = view.component.buildSavePayload()['lines'] as readonly Record<
        string,
        unknown
      >[];
      expect(lines[0]).toMatchObject({ title: 'SKU-1' });
    });

    it('riporta lo sconto documento come percentuale effettiva', () => {
      fillLine(view.component, 0, { qty: 1, price: '10,00' });
      view.component.form.controls['documentDiscountPercent']!.setValue('15');

      expect(view.component.buildSavePayload()['documentDiscountPercent']).toBe(15);
    });
  });

  /**
   * Netto/ivato sull'Ordine cliente — acceso il 16/08/2026.
   *
   * La maschera non aveva il selettore: il template lo escludeva «finché non
   * arriva il supporto backend dedicato». Adesso c'è, e con lui due regole che
   * queste prove tengono ferme:
   *
   *  1. la modalità è una proprietà dell'ORDINE, non di chi lo apre;
   *  2. il prezzo memorizzato è SEMPRE il netto, con la sua coda decimale.
   */
  describe('netto/ivato: la modalità è dell’ordine, il prezzo salvato è il netto', () => {
    beforeEach(async () => {
      view = await setup();
    });

    /** Il prezzo unitario che il salvataggio manderebbe al server. */
    function savedPrice(): number {
      const lines = view.component.buildSavePayload()['lines'] as readonly Record<
        string,
        unknown
      >[];
      return lines[0]!['unitPriceMinor'] as number;
    }

    /** Cosa mostra il campo prezzo della prima riga. */
    function shownPrice(): unknown {
      return view.component.lines.at(0).controls['unitPrice']!.value;
    }

    it('in modalità ivato al server va il NETTO, non il valore mostrato', () => {
      view.component.setPriceMode(true);
      fillLine(view.component, 0, { qty: 1, price: '122,00', vatCodeId: IVA_22.id });

      // 122,00 ivati al 22% → 100,00 netti. Prima di oggi partiva 122,00 e
      // l'API ci sommava di nuovo l'IVA: il totale usciva gonfio dell'aliquota.
      expect(savedPrice()).toBe(10000);
    });

    it('in modalità netto il valore mostrato è già il netto', () => {
      fillLine(view.component, 0, { qty: 1, price: '100,00', vatCodeId: IVA_22.id });

      expect(savedPrice()).toBe(10000);
    });

    it('25,00 ivati si memorizzano con la coda decimale, non troncati', () => {
      view.component.setPriceMode(true);
      fillLine(view.component, 0, { qty: 1, price: '25,00', vatCodeId: IVA_22.id });

      // 2500 / 1,22 = 2049,180327868… — la colonna ne tiene sei decimali di
      // euro, ed è quella coda a far tornare 25,00 alla riapertura. Troncata a
      // 2049 il prezzo tornerebbe 24,99, e un prezzo ivato su cinque lo fa.
      expect(savedPrice()).toBeCloseTo(2049.1803, 4);
      expect(savedPrice()).not.toBe(2049);
    });

    it('netto → ivato → netto: il prezzo torna IDENTICO', () => {
      view.component.setPriceMode(true);
      fillLine(view.component, 0, { qty: 1, price: '25,00', vatCodeId: IVA_22.id });
      const partenza = savedPrice();

      view.component.setPriceMode(false);
      expect(shownPrice()).toBe('20,49');
      view.component.setPriceMode(true);

      // Il giro passa per un campo a DUE decimali: ricalcolare il netto da lì
      // lo riporterebbe a 2049 tondo. Il netto attraversa il cambio intatto
      // perché la modalità dice come si vede, non quanto vale.
      expect(shownPrice()).toBe('25,00');
      expect(savedPrice()).toBe(partenza);
    });

    it('passando a netto e salvando lì, la coda NON si perde', () => {
      // È il caso in cui l'arrotondamento prematuro morderebbe davvero: il
      // campo mostra 20,49, e salvare quello scriverebbe 2049 tondo — da lì in
      // poi il prezzo ivato varrebbe 24,99 per sempre.
      view.component.setPriceMode(true);
      fillLine(view.component, 0, { qty: 1, price: '25,00', vatCodeId: IVA_22.id });
      const ivato = savedPrice();

      view.component.setPriceMode(false);

      expect(shownPrice()).toBe('20,49');
      expect(savedPrice()).toBe(ivato);
      expect(savedPrice()).not.toBe(2049);
    });

    it('ridigitando il prezzo vince il valore digitato, non quello ricordato', () => {
      // Il rovescio della medaglia: la memoria del netto non deve sopravvivere
      // a una modifica dell'operatore, o il campo direbbe una cosa e il
      // salvataggio ne scriverebbe un'altra.
      view.component.patchFormFromOrder(
        ordineSalvato({ pricesIncludeVat: true, unitPriceMinor: 2049.180328 }),
      );
      expect(savedPrice()).toBe(2049.180328);

      view.component.lines.at(0).controls['unitPrice']!.setValue('61,00');

      expect(savedPrice()).toBe(5000);
    });

    it('la modalità viaggia nel salvataggio, così l’ordine se la ricorda', () => {
      view.component.setPriceMode(true);
      fillLine(view.component, 0, { qty: 1, price: '10,00' });

      expect(view.component.buildSavePayload()['pricesIncludeVat']).toBe(true);
    });

    it('aprendo un ordine vince la SUA modalità, non quella di chi lo apre', () => {
      // L'operatore stava lavorando in ivato: è una sua preferenza, non un
      // dato dell'ordine che sta per aprire.
      view.component.setPriceMode(true);

      view.component.patchFormFromOrder(ordineSalvato({ pricesIncludeVat: false }));

      expect(view.component.pricesIncludeVat()).toBe(false);
    });

    it('due operatori vedono lo stesso ordine nello stesso modo', () => {
      const ordine = ordineSalvato({ pricesIncludeVat: true });

      view.component.setPriceMode(false); // primo operatore, preferenza netto
      view.component.patchFormFromOrder(ordine);
      const primo = shownPrice();

      view.component.setPriceMode(true); // secondo operatore, preferenza ivato
      view.component.patchFormFromOrder(ordine);

      expect(shownPrice()).toBe(primo);
    });

    it('ordine riaperto e risalvato senza toccare niente: prezzo invariato', () => {
      // È la prova che nessuna riapertura lima la coda decimale. Il campo
      // mostra 25,00; il netto memorizzato ha sei decimali, e resta quello.
      view.component.patchFormFromOrder(
        ordineSalvato({ pricesIncludeVat: true, unitPriceMinor: 2049.180328 }),
      );

      expect(shownPrice()).toBe('25,00');
      expect(savedPrice()).toBe(2049.180328);
    });

    it('ordine storico in netto: riaperto e risalvato resta identico', () => {
      view.component.patchFormFromOrder(
        ordineSalvato({ pricesIncludeVat: false, unitPriceMinor: 3500 }),
      );

      expect(shownPrice()).toBe('35,00');
      expect(savedPrice()).toBe(3500);
    });
  });

  /**
   * Avviso di conflitto sul numero: è una presa d'atto, non una scelta.
   *
   * Il documento NON viene salvato, ma **la testata SÌ viene aggiornata**
   * (specifica numerazione §3): il numero digitato è perso comunque — il buco
   * l'ha appena preso un altro — e lavorando in più persone l'operatore non può
   * sapere quale sia il prossimo libero se non glielo si scrive. Chi voleva un
   * altro buco lo digita: il campo resta suo.
   *
   * ⚠️ Fino al 12/08/2026 queste prove fissavano il contrario, ed erano l'unico
   * punto in cui il codice contraddiceva una decisione presa invece di non
   * averla ancora eseguita.
   */
  describe('conflitto sul numero documento', () => {
    const conflitto = {
      code: 'document_number_taken',
      number: 7,
      nextAvailable: 44,
      series: 'A',
    };

    it('la presa d’atto scrive in testata il numero nuovo', async () => {
      view = await setup();
      view.component.form.controls['documentNumber']!.setValue(7);
      view.component.numberConflictDialog.open(conflitto);

      view.component.acknowledgeConflictNumber();

      expect(view.component.form.controls['documentNumber']!.value).toBe(44);
    });

    // Il numero nuovo è una SCELTA, non una proposta: deve viaggiare al
    // salvataggio successivo. Se restasse pristine, `numberIsProposal()` lo
    // ometterebbe e il server ne assegnerebbe un terzo — diverso da quello
    // appena mostrato all'operatore.
    it('il numero nuovo viaggia al salvataggio, non passa per proposta', async () => {
      view = await setup();
      view.component.form.controls['documentNumber']!.setValue(7);
      view.component.numberConflictDialog.open(conflitto);

      view.component.acknowledgeConflictNumber();

      expect(view.component.numberIsProposal()).toBe(false);
    });

    it('la presa d’atto NON salva il documento', async () => {
      view = await setup();
      const salesOrders = TestBed.inject(SalesOrderService) as unknown as {
        saveManualOrder: ReturnType<typeof vi.fn>;
      };
      view.component.numberConflictDialog.open(conflitto);

      view.component.acknowledgeConflictNumber();

      expect(salesOrders.saveManualOrder).not.toHaveBeenCalled();
    });

    it('la presa d’atto chiude l’avviso', async () => {
      view = await setup();
      view.component.numberConflictDialog.open(conflitto);
      expect(view.component.numberConflictDialog.isOpen()).toBe(true);

      view.component.acknowledgeConflictNumber();

      expect(view.component.numberConflictDialog.isOpen()).toBe(false);
    });
  });
});

/**
 * Il blocco alla riapertura.
 *
 * Questa maschera ospita QUATTRO tipi di documento, e fino al 08/2026 il blocco
 * ne copriva due: DDT vendita e Scarico manuale si aprivano scrivibili perché il
 * meccanismo era stato scritto per il solo Ordine cliente, e gli altri avevano
 * preso `editUnlocked = true` come ripiego. Questi test dicono che ora la regola
 * è una sola, e che dopo il salvataggio il documento torna protetto senza che si
 * esca dalla maschera.
 *
 * Il dialogo di sblocco non viene pilotato dalla UI: usa `<dialog>`, che jsdom
 * non implementa. Si esercita `confirmUnlockEdit()`, che è ciò che quel dialogo
 * chiama — è la strada lasciata aperta dal TODO sull'Ordine fornitore.
 */
describe('CustomerOrderFormComponent — blocco alla riapertura', () => {
  const OWNER = { id: 'u-1', role: 'owner' };

  /** Documento a registro già salvato e confermato, con due righe. */
  function documentoConfermato(type: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'doc-1',
      type,
      status: 'confirmed',
      reference: 'DDT-2026-0001',
      number: 1,
      series: 'A',
      documentDate: '2026-08-01T00:00:00.000Z',
      customerId: null,
      customerName: 'Cliente prova',
      locationId: 'loc-1',
      currency: 'EUR',
      pricesIncludeVat: false,
      documentDiscountPercent: 0,
      lines: [
        {
          id: 'l-1',
          lineNumber: 1,
          description: 'Prima riga',
          quantity: 1,
          unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
          discountPercent: 0,
          loadsStock: false,
        },
        {
          id: 'l-2',
          lineNumber: 2,
          description: 'Seconda riga',
          quantity: 1,
          unitPrice: { amountMinor: 2000, currencyCode: 'EUR' },
          discountPercent: 0,
          loadsStock: false,
        },
      ],
      ...overrides,
    };
  }

  function ordineCaricato(overrides: Record<string, unknown> = {}) {
    return {
      id: 'so-1',
      orderNumber: 'OC-2026-0001',
      source: 'manual',
      currency: 'EUR',
      documentDate: '2026-08-01T00:00:00.000Z',
      customerId: null,
      customerName: 'Cliente prova',
      locationId: 'loc-1',
      documentDiscountPercent: 0,
      lines: [],
      ...overrides,
    };
  }

  interface LockedForm {
    readonly formReadOnly: () => boolean;
    readonly canUnlockDocument: () => boolean;
    readonly canConclude: () => boolean;
    readonly externalOrderNotice: () => readonly string[];
    confirmUnlockEdit: () => void;
    saveDocument: () => void;
    onLineDrop: (event: { previousIndex: number; currentIndex: number }) => void;
    readonly lines: {
      length: number;
      at: (i: number) => { controls: Record<string, { value: unknown }> };
    };
  }

  async function apri(options: FormOptions) {
    const view = await render(CustomerOrderFormComponent, {
      providers: formProviders({ user: OWNER, ...options }),
    });
    return view.fixture.componentInstance as unknown as LockedForm;
  }

  it('un DDT vendita salvato si riapre protetto', async () => {
    const form = await apri({
      kind: 'sales-ddt',
      id: 'doc-1',
      document: documentoConfermato('sales_ddt'),
    });

    expect(form.formReadOnly()).toBe(true);
  });

  it('uno scarico manuale salvato si riapre protetto', async () => {
    const form = await apri({
      kind: 'manual-unload',
      id: 'doc-1',
      document: documentoConfermato('manual_unload'),
    });

    expect(form.formReadOnly()).toBe(true);
  });

  it('un preventivo confermato si riapre protetto', async () => {
    const form = await apri({
      kind: 'quote',
      id: 'doc-1',
      document: documentoConfermato('quote'),
    });

    expect(form.formReadOnly()).toBe(true);
  });

  // Togliendo il ramo bozza da syncOnLoad il comportamento non doveva cambiare,
  // perché a gatearlo è `isConfirmedEdit()`. Questa è la verifica.
  it('una bozza resta subito modificabile, senza passare dallo sblocco', async () => {
    const form = await apri({
      kind: 'quote',
      id: 'doc-1',
      document: documentoConfermato('quote', { status: 'draft' }),
    });

    expect(form.formReadOnly()).toBe(false);
  });

  it('sbloccato e salvato, il documento torna protetto senza uscire dalla maschera', async () => {
    const documento = documentoConfermato('sales_ddt');
    const updateDocument = vi.fn(() => of(documento));
    const form = await apri({
      kind: 'sales-ddt',
      id: 'doc-1',
      document: documento,
      updateDocument,
    });

    form.confirmUnlockEdit();
    expect(form.formReadOnly()).toBe(false);

    form.saveDocument();

    expect(updateDocument).toHaveBeenCalled();
    expect(form.formReadOnly()).toBe(true);
  });

  // Il <fieldset disabled> ferma i controlli del form, non il drag & drop: su un
  // documento protetto le righe si sarebbero riordinate lo stesso, e senza
  // nemmeno sporcare il form — una modifica invisibile in attesa del primo
  // salvataggio.
  it('su un documento protetto il riordino delle righe non ha effetto', async () => {
    const form = await apri({
      kind: 'sales-ddt',
      id: 'doc-1',
      document: documentoConfermato('sales_ddt'),
    });
    expect(form.formReadOnly()).toBe(true);
    expect(form.lines.length).toBe(2);

    form.onLineDrop({ previousIndex: 0, currentIndex: 1 });

    expect(form.lines.at(0).controls['productName']!.value).toBe('Prima riga');
  });

  // La sola lettura di un ordine da canale esterno è una proprietà del
  // documento, non uno stato del lock: non deve dipendere dal set di sessione.
  it('un ordine da canale esterno resta in sola lettura anche dopo uno sblocco', async () => {
    const form = await apri({
      id: 'so-1',
      order: ordineCaricato({ source: 'online' }),
    });
    expect(form.canUnlockDocument()).toBe(false);

    form.confirmUnlockEdit();

    expect(form.formReadOnly()).toBe(true);
  });
});

/**
 * Ordini da canale esterno: il divieto spiega, invece di manifestarsi come un
 * errore tecnico a lavoro fatto.
 *
 * Ogni verifica ha il suo controllo inverso: un test che dice «non compare» va
 * in verde anche quando quella cosa non compare mai, e allora non sta
 * verificando la guardia — sta verificando il nulla.
 */
describe('CustomerOrderFormComponent — ordini da canale esterno', () => {
  const OWNER = { id: 'u-1', role: 'owner' };

  interface ExternalForm {
    readonly externalOrderNotice: () => readonly string[];
    readonly canConclude: () => boolean;
    readonly formReadOnly: () => boolean;
  }

  function ordine(overrides: Record<string, unknown> = {}) {
    return {
      id: 'so-1',
      orderNumber: 'OC-2026-0001',
      source: 'online',
      currency: 'EUR',
      documentDate: '2026-08-01T00:00:00.000Z',
      customerId: null,
      customerName: 'Cliente prova',
      locationId: 'loc-1',
      documentDiscountPercent: 0,
      lines: [],
      ...overrides,
    };
  }

  async function apri(order: Record<string, unknown>) {
    const view = await render(CustomerOrderFormComponent, {
      providers: formProviders({
        user: OWNER,
        id: 'so-1',
        order,
        // Senza tipi di scarico «Concludi ordine» non comparirebbe comunque, e
        // il test sull'esclusione sarebbe vuoto.
        unloadDocumentTypes: ['sales_ddt'],
      }),
    });
    return view.fixture.componentInstance as unknown as ExternalForm;
  }

  /** Una frase del banner che contenga tutte le parole date. */
  function dice(notice: readonly string[], ...parole: readonly string[]): boolean {
    return notice.some((line) => parole.every((parola) => line.includes(parola)));
  }

  it('su un ordine manuale il banner non dice niente', async () => {
    const form = await apri(ordine({ source: 'manual' }));

    expect(form.externalOrderNotice()).toEqual([]);
  });

  it('un ordine dal sito rimanda a Shopify per la modifica', async () => {
    const form = await apri(ordine({ source: 'online' }));

    expect(dice(form.externalOrderNotice(), 'modificalo su Shopify')).toBe(true);
  });

  // Uno scontrino non si modifica: si fa un reso. Dire «modificalo su Shopify»
  // a chi ha battuto una vendita in cassa manda a cercare una strada che non
  // esiste — è lo stesso difetto che stiamo togliendo, spostato altrove.
  it('una vendita da cassa manda al reso, non alla modifica su Shopify', async () => {
    const form = await apri(ordine({ source: 'pos' }));
    const notice = form.externalOrderNotice();

    expect(dice(notice, 'reso')).toBe(true);
    expect(dice(notice, 'modificalo su Shopify')).toBe(false);
  });

  // VestiFlow PREPARA la rettifica, non la emette: il banner non deve far
  // credere che la faccenda si chiuda da sola.
  it('sulla cassa il banner dice che la rettifica è preparata, non emessa', async () => {
    const form = await apri(ordine({ source: 'pos' }));

    expect(dice(form.externalOrderNotice(), 'prepara la rettifica')).toBe(true);
  });

  it('un ordine evaso avvisa che i totali del commercialista si sposterebbero', async () => {
    const form = await apri(ordine({ source: 'online', fulfilledAt: '2026-08-02T10:00:00.000Z' }));

    expect(dice(form.externalOrderNotice(), 'corrispettivi', 'commercialista')).toBe(true);
  });

  // Il controllo che vale più degli altri. L'evasione PARZIALE non crea né
  // vendita online né corrispettivo — marca solo l'ordine da verificare —
  // quindi il banner non deve dire che ne esiste uno. Agganciarlo allo stato
  // «evaso anche parzialmente» che la maschera usa altrove lo farebbe mentire.
  it('un ordine evaso solo in parte non dichiara un corrispettivo che non c’è', async () => {
    const form = await apri(ordine({ source: 'online', fulfillmentStatus: 'partial' }));

    expect(dice(form.externalOrderNotice(), 'corrispettivo')).toBe(false);
  });

  it('un ordine non ancora evaso spiega che l’evasione la registra Shopify', async () => {
    const form = await apri(ordine({ source: 'online' }));

    expect(dice(form.externalOrderNotice(), 'evasione', 'Shopify')).toBe(true);
  });

  it('«Concludi ordine» non compare su un ordine da canale esterno', async () => {
    const form = await apri(ordine({ source: 'online' }));

    expect(form.canConclude()).toBe(false);
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se
  // «Concludi ordine» fosse sparito per tutti.
  it('«Concludi ordine» resta su un ordine manuale', async () => {
    const form = await apri(ordine({ source: 'manual' }));

    expect(form.canConclude()).toBe(true);
  });

  /**
   * Il riepilogo di un ordine di canale si LEGGE, non si ricalcola.
   *
   * Numeri veri di `#1010` (15/08/2026): maglietta 25,00 con 12,00 di sconto
   * allocato da Shopify, un secondo articolo a 24,59 senza sconto, spedizione
   * 26,01, imposta 11,46 inclusa, totale 63,60.
   *
   * Prima di questa correzione la maschera mostrava **25,00** come totale del
   * documento: ricostruiva le righe col motore dell'ordine manuale — quantità
   * per prezzo scontato dalla percentuale — dove la spedizione non esiste, lo
   * sconto a importo non esiste e i prezzi si credono netti. Il difetto era
   * invisibile finché anche il database conteneva 25,00.
   */
  it('un ordine di canale mostra i totali del canale, non quelli ricalcolati', async () => {
    const eur = (amountMinor: number) => ({ amountMinor, currencyCode: 'EUR' });

    await apri(
      ordine({
        subtotal: eur(3759),
        total: eur(6360),
        tax: eur(1146),
        shipping: eur(2601),
        discount: eur(1200),
        lines: [
          {
            id: 'l-1',
            sku: 'SKU-1',
            title: 'maglietta',
            quantity: 1,
            unitPrice: eur(2500),
            lineTotal: eur(1300),
          },
          {
            id: 'l-2',
            sku: 'SKU-2',
            title: 'Prodotto test sincro',
            quantity: 1,
            unitPrice: eur(2459),
            lineTotal: eur(2459),
          },
        ],
      }),
    );

    const riepilogo = document.body.textContent ?? '';

    // Il totale è quello che il cliente ha pagato, non la somma delle righe.
    expect(riepilogo).toContain('Totale ordine');
    expect(riepilogo).toContain('63,60');

    // Lo sconto d'ordine compare UNA VOLTA SOLA, qui: le righe restano al
    // prezzo pieno, come le mostra Shopify. Contarlo due volte darebbe 25,59.
    expect(riepilogo).toContain('Sconto ordine');
    expect(riepilogo).toContain('12,00');
    expect(riepilogo).toContain('49,59');

    // La spedizione non è una riga articolo: senza questa voce il totale non
    // tornerebbe con Shopify per 26,01 €.
    expect(riepilogo).toContain('Spedizione');
    expect(riepilogo).toContain('26,01');

    // I prezzi del canale sono ivati: l'imponibile si ricava per differenza
    // (63,60 − 11,46), non chiamando imponibile la somma delle righe.
    expect(riepilogo).toContain('52,14');
    expect(riepilogo).toContain('IVA inclusa');

    // E l'etichetta netta dell'ordine manuale non deve comparire su un lordo.
    expect(riepilogo).not.toContain('Imponibile righe');
  });
});

/**
 * Numero proposto e numero imposto.
 *
 * Il numero in testata è il primo libero: mostrarlo aiuta chi compila, ma
 * rimandarlo al server lo trasforma in una scelta — e il secondo operatore si
 * becca un dialogo di conflitto per un numero che gli aveva proposto la
 * maschera. Quando invece è l'operatore a scriverlo (per riempire un buco nella
 * numerazione) resta un'imposizione e viaggia col documento.
 */
describe('CustomerOrderFormComponent — numero proposto e numero imposto', () => {
  interface NumberForm {
    readonly numberIsProposal: () => boolean;
    readonly form: { controls: Record<string, { value: unknown }> };
    saveDocument: () => void;
  }

  /** Preventivo appena salvato, come lo restituisce il server. */
  function preventivoSalvato(number: number) {
    return {
      id: 'doc-1',
      type: 'quote',
      status: 'confirmed',
      reference: `PRE-2026-${String(number).padStart(4, '0')}`,
      number,
      series: 'A',
      documentDate: '2026-08-01T00:00:00.000Z',
      customerId: null,
      customerName: 'Cliente prova',
      locationId: 'loc-1',
      currency: 'EUR',
      pricesIncludeVat: false,
      documentDiscountPercent: 0,
      lines: [],
    };
  }

  interface NumberOptions {
    /** Primo numero libero che il numeratore propone in testata. */
    readonly proposedNumber?: number;
    /** Numero che il server assegna davvero (diverso = l'ha preso un altro). */
    readonly assignedNumber?: number;
  }

  async function apriPreventivo(options: NumberOptions = {}) {
    const proposedNumber = options.proposedNumber ?? 42;
    const createDocument = vi.fn((_body: Record<string, unknown>) =>
      of(preventivoSalvato(options.assignedNumber ?? proposedNumber)),
    );
    const toast = { showInfo: vi.fn(), showError: vi.fn() };

    const view = await render(CustomerOrderFormComponent, {
      providers: formProviders({
        kind: 'quote',
        user: { id: 'u-1', role: 'owner' },
        proposedNumber,
        createDocument,
        toast,
      }),
    });
    const form = view.fixture.componentInstance as unknown as NumberForm;

    // La proposta arriva dopo il primo render: aspettarla è ciò che rende
    // attendibile tutto il resto del test.
    await waitFor(() => expect(form.form.controls['documentNumber']!.value).toBe(proposedNumber));
    const numberInput = (await screen.findAllByLabelText<HTMLInputElement>('Numero'))[0]!;

    return { form, numberInput, createDocument, toast };
  }

  it('il numero proposto non viene inviato: lo assegna il server', async () => {
    const { form, createDocument, toast } = await apriPreventivo({ proposedNumber: 42 });

    expect(form.numberIsProposal()).toBe(true);

    form.saveDocument();

    expect(createDocument).toHaveBeenCalledTimes(1);
    const body = createDocument.mock.calls[0]![0];
    expect(body['number']).toBeUndefined();
    // Numero assegnato uguale a quello mostrato: niente da segnalare.
    expect(toast.showInfo).not.toHaveBeenCalled();
  });

  it('il campo dichiara che il numero è una proposta', async () => {
    await apriPreventivo({ proposedNumber: 42 });

    const hints = await screen.findAllByText('Primo libero: lo prende chi salva per primo.');
    expect(hints.length).toBeGreaterThan(0);
  });

  // L'altra metà della regola: il numero scritto a mano è una scelta, e va
  // difesa fino al dialogo di conflitto se quel numero è già occupato.
  it('il numero digitato dall’operatore viene inviato', async () => {
    const user = userEvent.setup();
    const { form, numberInput, createDocument } = await apriPreventivo({
      proposedNumber: 42,
      assignedNumber: 7,
    });

    await user.clear(numberInput);
    await user.type(numberInput, '7');
    expect(form.numberIsProposal()).toBe(false);

    form.saveDocument();

    const body = createDocument.mock.calls[0]![0];
    expect(body['number']).toBe(7);
  });

  // Concorrenza: il server ha assegnato il primo libero e non è più quello che
  // l'operatore aveva davanti. Dirglielo, o trascriverà il numero sbagliato.
  it('avvisa quando il numero assegnato è diverso da quello proposto', async () => {
    const { form, toast } = await apriPreventivo({ proposedNumber: 42, assignedNumber: 46 });

    form.saveDocument();

    expect(toast.showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
  });

  // Il controllo inverso: sul numero imposto l'avviso tace, perché quel caso ha
  // già il suo dialogo di conflitto e due messaggi per la stessa cosa confondono.
  it('sul numero imposto non aggiunge un avviso al dialogo di conflitto', async () => {
    const user = userEvent.setup();
    const { form, numberInput, toast } = await apriPreventivo({
      proposedNumber: 42,
      assignedNumber: 46,
    });

    await user.clear(numberInput);
    await user.type(numberInput, '42');

    form.saveDocument();

    expect(toast.showInfo).not.toHaveBeenCalled();
  });
});

/**
 * Conferma di un codice: gli esiti sono TRE, non due.
 *
 * Prima di 08/2026 questa maschera passava da `resolveVariantIdByCode`, che
 * restituisce `string | null`: un codice articolo condiviso da più taglie
 * tornava `null` e finiva in silenzio, indistinguibile da un codice
 * inesistente. Senza queste due prove la regressione tornerebbe muta — è
 * esattamente il modo in cui era passata inosservata.
 */
describe('CustomerOrderFormComponent — conferma dei codici', () => {
  function variante(overrides: Record<string, unknown>) {
    return {
      productId: 'prod-1',
      articleCode: 'ART-9',
      productName: 'Maglietta',
      title: 'Maglietta',
      sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      ...overrides,
    };
  }

  interface CodeForm {
    readonly commitCodeLookup: (
      index: number,
      field: 'articleCode' | 'sku' | 'barcode',
      advance?: boolean,
    ) => void;
    readonly codeLookup: {
      readonly isOpenOn: (index: number, field: string) => boolean;
      readonly matches: () => readonly { readonly variantId: string }[];
    };
    readonly lineCardVm: (index: number) => {
      readonly codeChoice: {
        readonly field: string;
        readonly items: readonly { readonly variantId: string }[];
      } | null;
    };
    readonly addLine: () => void;
    readonly onMobileCodeBlur: (index: number, field: 'articleCode' | 'sku' | 'barcode') => void;
    readonly onCodeSuggestionPick: (index: number, variantId: string) => void;
    readonly lines: {
      at: (i: number) => {
        controls: Record<string, { setValue: (v: unknown) => void; value: unknown }>;
      };
    };
  }

  async function apri(catalogo: readonly Record<string, unknown>[]) {
    const view = await render(CustomerOrderFormComponent, {
      providers: [
        ...formProviders(),
        // Ultimo provider per lo stesso token: vince su quello di base.
        {
          provide: ProductService,
          useValue: {
            // ⚠️ Il filtro per `variantId` va rispettato, come fa il servizio
            // vero. Prima questo finto catalogo lo ignorava e rispondeva
            // sempre con tutto: la ricerca per id — quella che il form usa
            // quando la variante non è ancora fra le pinned — tornava il
            // PRIMO articolo del catalogo qualunque cosa si chiedesse. Un
            // test che agganciava la seconda variante non poteva funzionare,
            // e la causa non era nel form.
            searchVariantSummaries: (params?: { readonly variantId?: string }) =>
              of(
                params?.variantId
                  ? catalogo.filter((row) => row['variantId'] === params.variantId)
                  : catalogo,
              ),
            // L'endpoint per codice tace sui casi ambigui: qui non deve mai
            // essere la strada che salva il test.
            findVariantByCode: () => throwError(() => new Error('404')),
            getSupplierVariantLinks: () => of([]),
            createProduct: vi.fn(),
          },
        },
      ],
    });
    return view.fixture.componentInstance as unknown as CodeForm & {
      onVariantSelect: (index: number, variantId: string | null) => void;
    };
  }

  /**
   * Sostituzione d'articolo sulla stessa riga (difetto trovato il 15/08/2026).
   *
   * Il prezzo si scriveva solo se il campo era vuoto: richiamando un secondo
   * articolo sulla riga, restava il prezzo del primo. La riga diceva un
   * articolo e costava un altro, e nessuno se ne accorgeva fino alla fattura.
   */
  /**
   * ⭐ **Quinto consumer del risolutore comune** (`03c` §5).
   *
   * ⚠️ Questi test esistono perché i due divieti che la migrazione chiude qui
   * **non erano coperti da nessuna prova**: il fixture `variante()` ha
   * `productName: 'Maglietta'` non vuoto, quindi il ramo `productName || title`
   * non veniva mai eseguito; e nessun articolo di prova era privo di
   * `unitOfMeasure`, quindi il ripiego cablato su `'pz'` non si vedeva.
   */
  describe('il richiamo articolo passa dal risolutore comune', () => {
    it('⛔ nome vuoto in anagrafica: la riga resta vuota, non prende il titolo', async () => {
      const form = await apri([
        variante({
          variantId: 'var-senza-nome',
          sku: 'FEL-L-BLU',
          // L'unica forma di dato che esegue il ramo di ripiego.
          productName: '',
          title: 'Felpa / L / Blu',
          variantLabel: 'L / Blu',
        }),
      ]);

      form.onVariantSelect(0, 'var-senza-nome');

      const riga = form.lines.at(0).controls;
      // Il titolo contiene la variante: ripiegarci sopra la rimetterebbe dentro
      // il nome. Vuoto è corretto — dice che l'ANAGRAFICA è incompleta.
      expect(riga['productName']!.value).toBe('');
      expect(riga['productName']!.value).not.toContain('Felpa');
      // …e la variante arriva comunque nella sua colonna.
      expect(riga['variantLabel']!.value).toBe('L / Blu');
    });

    it('⛔ articolo senza unità: la cella resta vuota, non dice «pz»', async () => {
      const form = await apri([
        variante({
          variantId: 'var-metri',
          sku: 'TES-1',
          productName: 'Tessuto al metro',
          title: 'Tessuto al metro',
          // Nessuna `unitOfMeasure`: prima qui scattava `?? 'pz'`, e un
          // articolo venduto a metri diceva «pezzi».
        }),
      ]);

      form.onVariantSelect(0, 'var-metri');

      expect(form.lines.at(0).controls['unitOfMeasure']!.value).toBe('');
    });

    it("l'unità dell'articolo arriva sulla riga quando c'è", async () => {
      const form = await apri([
        variante({ variantId: 'var-m', sku: 'MAG-M', unitOfMeasure: 'mt' }),
      ]);

      form.onVariantSelect(0, 'var-m');

      expect(form.lines.at(0).controls['unitOfMeasure']!.value).toBe('mt');
    });

    it('⛔ un SERVIZIO non fa scattare «Impegna magazzino»', async () => {
      const form = await apri([
        variante({
          variantId: 'var-srv',
          sku: 'SRV-1',
          productName: 'Consulenza',
          title: 'Consulenza',
          // `managesStock` ASSENTE, non `false`: è la forma che una regola
          // scritta come `managesStock !== false` lascerebbe passare.
          kind: 'service',
        }),
      ]);

      form.onVariantSelect(0, 'var-srv');

      expect(form.lines.at(0).controls['commitsStock']!.value).toBe(false);
    });

    it('un articolo normale la fa scattare', async () => {
      const form = await apri([variante({ variantId: 'var-art', sku: 'ART-1' })]);

      form.onVariantSelect(0, 'var-art');

      expect(form.lines.at(0).controls['commitsStock']!.value).toBe(true);
    });

    it('⛔ la quantità digitata sopravvive al richiamo dello stesso articolo', async () => {
      const form = await apri([variante({ variantId: 'var-q', sku: 'QTA-1' })]);

      form.onVariantSelect(0, 'var-q');
      form.lines.at(0).controls['quantity']!.setValue(7);

      // Lo stesso articolo, richiamato di nuovo: è ciò che fa il rientro dal
      // pannello anagrafica.
      form.onVariantSelect(0, 'var-q');

      expect(form.lines.at(0).controls['quantity']!.value).toBe(7);
    });
  });

  it('sostituendo l’articolo sulla riga, il prezzo segue il nuovo', async () => {
    const form = await apri([
      variante({
        variantId: 'var-A',
        sku: 'MAG-A',
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      }),
      variante({
        variantId: 'var-B',
        sku: 'MAG-B',
        sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
      }),
    ]);

    form.onVariantSelect(0, 'var-A');
    expect(form.lines.at(0).controls['unitPrice']!.value).toBe('10,00');

    form.onVariantSelect(0, 'var-B');

    expect(form.lines.at(0).controls['variantId']!.value).toBe('var-B');
    expect(form.lines.at(0).controls['unitPrice']!.value).toBe('25,00');
  });

  // Il rovescio: un articolo SENZA prezzo non lascia in piedi quello di prima.
  // Svuotare è corretto, tenere il vecchio no.
  it('sostituendo con un articolo senza prezzo, il campo si svuota', async () => {
    const form = await apri([
      variante({
        variantId: 'var-A',
        sku: 'MAG-A',
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      }),
      variante({
        variantId: 'var-zero',
        sku: 'MAG-Z',
        sellingPrice: { amountMinor: 0, currencyCode: 'EUR' },
      }),
    ]);

    form.onVariantSelect(0, 'var-A');
    form.onVariantSelect(0, 'var-zero');

    expect(form.lines.at(0).controls['unitPrice']!.value).toBe('');
  });

  it('più corrispondenze esatte aprono la scelta invece di tacere', async () => {
    const form = await apri([
      variante({ variantId: 'var-M', sku: 'MAG-M' }),
      variante({ variantId: 'var-L', sku: 'MAG-L' }),
    ]);
    form.lines.at(0).controls['articleCode']!.setValue('ART-9');

    form.commitCodeLookup(0, 'articleCode');

    expect(form.codeLookup.isOpenOn(0, 'articleCode')).toBe(true);
    expect(form.codeLookup.matches().map((row) => row.variantId)).toEqual(['var-M', 'var-L']);
  });

  // §4.5: Invio registra e RESTA. Senza corrispondenza la cella è ancora un
  // campo, quindi «restare» è possibile ed è lì che la regola morde. Prima Tab
  // e Invio emettevano lo stesso esito e il form non poteva distinguerli.
  it('Invio senza corrispondenza non sposta il fuoco; il Tab sì', async () => {
    const form = await apri([]);
    const avanza = vi.spyOn(
      form as unknown as { focusNextLineField: (i: number, f: string) => void },
      'focusNextLineField',
    );
    form.lines.at(0).controls['sku']!.setValue('IGNOTO');

    form.commitCodeLookup(0, 'sku', false);
    expect(avanza).not.toHaveBeenCalled();

    form.commitCodeLookup(0, 'sku', true);
    expect(avanza).toHaveBeenCalledWith(0, 'sku');
  });

  // Il controllo inverso: senza, la prova qui sopra passerebbe anche se la
  // scelta si aprisse sempre, pure quando l'articolo è uno solo.
  it('una corrispondenza sola aggancia la riga, senza chiedere niente', async () => {
    const form = await apri([variante({ variantId: 'var-M', sku: 'MAG-M' })]);
    form.lines.at(0).controls['sku']!.setValue('MAG-M');

    form.commitCodeLookup(0, 'sku');

    expect(form.codeLookup.isOpenOn(0, 'sku')).toBe(false);
    expect(form.lines.at(0).controls['variantId']!.value).toBe('var-M');
  });

  // La stessa scelta deve avere dove mostrarsi anche nella card mobile: la
  // decisione vale su Ordine cliente, non su Ordine cliente desktop. Senza
  // questa, da telefono la riga non si agganciava e non lo diceva.
  it('la card mobile riceve la scelta sotto il campo da cui si è confermato', async () => {
    const form = await apri([
      variante({ variantId: 'var-M', sku: 'MAG-M' }),
      variante({ variantId: 'var-L', sku: 'MAG-L' }),
    ]);
    form.lines.at(0).controls['articleCode']!.setValue('ART-9');

    form.commitCodeLookup(0, 'articleCode');

    const choice = form.lineCardVm(0).codeChoice;
    expect(choice?.field).toBe('articleCode');
    expect(choice?.items.map((item) => item.variantId)).toEqual(['var-M', 'var-L']);
  });

  // Il controllo inverso: la card non deve mostrare un pannello quando non c'è
  // niente da scegliere, e nemmeno su una riga che non è quella della scelta.
  it('la card mobile non mostra niente senza scelta, né sulle altre righe', async () => {
    const form = await apri([
      variante({ variantId: 'var-M', sku: 'MAG-M' }),
      variante({ variantId: 'var-L', sku: 'MAG-L' }),
    ]);
    form.addLine();
    expect(form.lineCardVm(0).codeChoice).toBeNull();

    form.lines.at(0).controls['articleCode']!.setValue('ART-9');
    form.commitCodeLookup(0, 'articleCode');

    // La scelta è della riga che l'ha aperta: la seconda card non deve
    // mostrare il pannello di un'altra riga.
    expect(form.lineCardVm(1).codeChoice).toBeNull();
  });

  /**
   * Lo sfocamento conferma anche su mobile, come Tab sul desktop — e si incrocia
   * con la grazia che lascia arrivare il tocco su una voce della scelta.
   *
   * I due meccanismi vanno provati INSIEME: presi separatamente sembrano
   * entrambi a posto, ed è nell'incrocio che si pestano.
   */
  describe('sfocamento sulla card mobile', () => {
    /** Fa scadere la grazia: prima di allora non è ancora stato deciso nulla. */
    function passaLaGrazia(): void {
      vi.advanceTimersByTime(250);
    }

    it('lo sfocamento conferma un codice mai confermato, come Tab sul desktop', async () => {
      const form = await apri([variante({ variantId: 'var-M', sku: 'MAG-M' })]);
      vi.useFakeTimers();
      try {
        form.lines.at(0).controls['sku']!.setValue('MAG-M');

        form.onMobileCodeBlur(0, 'sku');
        passaLaGrazia();

        expect(form.lines.at(0).controls['variantId']!.value).toBe('var-M');
      } finally {
        vi.useRealTimers();
      }
    });

    // Il caso in cui i due meccanismi si pesterebbero: se lo sfocamento
    // confermasse comunque, partirebbe una seconda ricerca il cui esito
    // riaprirebbe la scelta DOPO che il tocco l'aveva già risolta.
    it('dopo il tocco su una voce lo sfocamento non riapre niente', async () => {
      const form = await apri([
        variante({ variantId: 'var-M', sku: 'MAG-M' }),
        variante({ variantId: 'var-L', sku: 'MAG-L' }),
      ]);
      vi.useFakeTimers();
      try {
        form.lines.at(0).controls['articleCode']!.setValue('ART-9');
        form.commitCodeLookup(0, 'articleCode');
        // Il tocco arriva dentro la grazia, prima che lo sfocamento decida.
        form.onMobileCodeBlur(0, 'articleCode');
        form.onCodeSuggestionPick(0, 'var-L');

        passaLaGrazia();

        expect(form.lines.at(0).controls['variantId']!.value).toBe('var-L');
        expect(form.lineCardVm(0).codeChoice).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    // Uscire senza scegliere non è un errore: il valore digitato resta scritto,
    // la scelta si chiude, e NON si cerca di nuovo — cercare la farebbe
    // ricomparire su una riga che l'operatore ha già lasciato.
    it('uscire con la scelta aperta la chiude e non la fa ricomparire', async () => {
      const form = await apri([
        variante({ variantId: 'var-M', sku: 'MAG-M' }),
        variante({ variantId: 'var-L', sku: 'MAG-L' }),
      ]);
      vi.useFakeTimers();
      try {
        form.lines.at(0).controls['articleCode']!.setValue('ART-9');
        form.commitCodeLookup(0, 'articleCode');

        form.onMobileCodeBlur(0, 'articleCode');
        passaLaGrazia();

        expect(form.lineCardVm(0).codeChoice).toBeNull();
        expect(form.lines.at(0).controls['variantId']!.value).toBe('');
        // Il codice digitato resta: è quello che l'operatore voleva.
        expect(form.lines.at(0).controls['articleCode']!.value).toBe('ART-9');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

/**
 * La maschera serve quattro modalità, e tre di loro vivono nel registro
 * `documents`. La quarta — l'Ordine cliente — vive in `SalesOrder` e ha un
 * numeratore proprio: chiedere per lei le serie del Preventivo mostrava in
 * testata numeri di un altro tipo documento, e faceva controllare la
 * cronologia (§4) su una serie che non è la sua.
 */
describe('CustomerOrderFormComponent — quale numeratore chiede ogni modalità', () => {
  async function apri(kind?: 'quote' | 'sales-ddt' | 'manual-unload') {
    const available = vi.fn((_type: DocumentType, _locationId?: string | null, _data?: string) =>
      of({ counters: [], proposedCounterId: null }),
    );
    const checkChronology = vi.fn(
      (_type: DocumentType, _series: string, _numero: number, _data: string) =>
        of({ conflicts: [], dismissed: false }),
    );

    const view = await render(CustomerOrderFormComponent, {
      providers: [
        ...formProviders({ kind, user: { id: 'u-1', role: 'owner' } }),
        // Ultimo provider vince: le spie sostituiscono i doppioni di comodo.
        { provide: DocumentCountersService, useValue: { available } },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
            previewDocumentNumber: () =>
              of({ reference: 'X-1', previewNumber: 1, series: 'A', year: 2026 }),
            getPriceModePreference: () => of(false),
            checkChronology,
            dismissChronologyWarning: () => of(void 0),
          },
        },
      ],
    });

    await waitFor(() => expect(available).toHaveBeenCalled());
    const istanza = view.fixture.componentInstance as unknown as {
      chronology: { run: (salva: () => void) => void };
      form: { controls: Record<string, { setValue: (v: unknown) => void }> };
    };

    return { available, checkChronology, chronology: istanza.chronology, form: istanza.form };
  }

  it('l’Ordine cliente chiede le serie del proprio numeratore, non quelle del Preventivo', async () => {
    const { available } = await apri();

    expect(available.mock.calls[0]![0]).toBe(DocumentType.CustomerOrder);
  });

  it('l’Ordine cliente controlla la cronologia sul proprio tipo', async () => {
    const { checkChronology, chronology, form } = await apri();
    // Senza un numero in testata non c'è una coppia da controllare e la
    // chiamata non parte: è la regola del §4, non un dettaglio del test.
    form.controls['documentNumber']!.setValue(7);
    form.controls['documentDate']!.setValue('2026-08-13');

    chronology.run(() => undefined);

    const [tipo, , numero, data] = checkChronology.mock.calls[0]!;
    expect(tipo).toBe(DocumentType.CustomerOrder);
    expect(numero).toBe(7);
    expect(data).toBe('2026-08-13');
  });

  it('senza numero in testata non chiede niente e lascia salvare', async () => {
    const { checkChronology, chronology, form } = await apri();
    form.controls['documentNumber']!.setValue(null);
    const salvato = vi.fn();

    chronology.run(salvato);

    expect(checkChronology).not.toHaveBeenCalled();
    expect(salvato).toHaveBeenCalledTimes(1);
  });

  it('il Preventivo resta sul proprio, che è un tipo del registro', async () => {
    const { available } = await apri('quote');

    expect(available.mock.calls[0]![0]).toBe(DocumentType.Quote);
  });

  it('il DDT di vendita resta sul proprio', async () => {
    const { available } = await apri('sales-ddt');

    expect(available.mock.calls[0]![0]).toBe(DocumentType.SalesDdt);
  });
});

/**
 * Comandi che l'API nega: da qui devono sparire, non restare grigi.
 *
 * Come sopra, ogni «non compare» ha il suo controllo inverso col titolare: un
 * test che verifica un'assenza va in verde anche quando quel comando non c'è
 * mai stato, e allora non sta verificando la guardia.
 */
describe('CustomerOrderFormComponent — comandi fuori dai permessi', () => {
  const OWNER = { id: 'u-1', role: 'owner' };

  /** Commessa che gestisce ordini e preventivi e nient'altro. */
  const COMMESSA = {
    id: 'u-2',
    role: 'clerk',
    permissions: ['section.sales', 'doc.sales_order.manage', 'doc.quote.manage'],
  };

  async function apri(user: unknown, options: FormOptions = {}) {
    return render(CustomerOrderFormComponent, { providers: formProviders({ user, ...options }) });
  }

  it('senza customers.manage la scorciatoia «Nuovo cliente» non compare', async () => {
    const view = await apri(COMMESSA);

    expect(view.queryAllByRole('button', { name: /nuovo cliente/i })).toHaveLength(0);
  });

  it('al titolare «Nuovo cliente» resta', async () => {
    const view = await apri(OWNER);

    expect(view.queryAllByRole('button', { name: /nuovo cliente/i }).length).toBeGreaterThan(0);
  });

  it('senza catalog.manage la creazione articolo dalla maschera non compare', async () => {
    const view = await apri(COMMESSA);

    expect(view.queryAllByRole('button', { name: /nuovo prodotto/i })).toHaveLength(0);
  });

  it('al titolare la creazione articolo resta', async () => {
    const view = await apri(OWNER);

    expect(view.queryAllByRole('button', { name: /nuovo prodotto/i }).length).toBeGreaterThan(0);
  });

  // Il campo numero da 12/08/2026 sta anche sull'Ordine cliente, ma la prova
  // resta sul Preventivo: lì il numeratore è quello del registro — lo stesso che
  // l'ingranaggio apre — e l'esito non dipende da come si è scelto di mostrare
  // la numerazione sull'ordine.
  it('senza documents.configure l’ingranaggio delle numerazioni non compare', async () => {
    const view = await apri(COMMESSA, { kind: 'quote' });

    expect(view.queryAllByRole('button', { name: 'Gestisci numerazioni' })).toHaveLength(0);
  });

  it('al titolare l’ingranaggio delle numerazioni resta', async () => {
    const view = await apri(OWNER, { kind: 'quote' });

    expect(view.queryAllByRole('button', { name: 'Gestisci numerazioni' }).length).toBeGreaterThan(
      0,
    );
  });
});
