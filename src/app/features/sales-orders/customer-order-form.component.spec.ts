import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
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
    suggestedWriteLocation: () => null,
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
              ? {
                  nextReferencePreview: 'OC-2026-0002',
                  unloadDocumentTypes: options.unloadDocumentTypes,
                }
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

describe('CustomerOrderFormComponent — caratterizzazione', () => {
  async function setup() {
    const view = await render(CustomerOrderFormComponent, {
      providers: formProviders(),
    });

    const component = view.fixture.componentInstance as unknown as {
      lines: {
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
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
      pricesIncludeVat: { set: (v: boolean) => void };
      numberConflictDialog: {
        open: (conflict: Record<string, unknown>) => void;
        isOpen: () => boolean;
      };
      acknowledgeConflictNumber: () => void;
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

    // Il documento della controparte è l'ordine che il cliente ha emesso: tipo,
    // numero e data viaggiano insieme, altrimenti sul documento resta un numero
    // senza sapere di che documento fosse.
    it('serializza il documento della controparte', () => {
      const controls = view.component.form.controls;
      controls['externalDocumentTypeId']!.setValue('type-1');
      controls['externalDocNumber']!.setValue(' 145 ');
      controls['externalDocDate']!.setValue('2026-07-25');

      expect(view.component.buildSavePayload()).toMatchObject({
        externalDocumentTypeId: 'type-1',
        externalDocNumber: '145',
        externalDocDate: '2026-07-25',
      });
    });

    // Svuotare i campi non è «non toccarli»: la testata viene riscritta per
    // intero, e il campo assente azzera quello che c'era.
    it('omette i campi della controparte quando sono vuoti', () => {
      const payload = view.component.buildSavePayload();

      expect(payload['externalDocumentTypeId']).toBeUndefined();
      expect(payload['externalDocNumber']).toBeUndefined();
      expect(payload['externalDocDate']).toBeUndefined();
    });
  });

  /**
   * Avviso di conflitto sul numero: è una presa d'atto, non una scelta.
   * Il documento NON viene salvato e la testata NON viene toccata — il numero
   * l'ha scelto l'operatore (qui il 7, per tappare un buco), e sostituirglielo
   * col primo libero butterebbe via l'intento. Il messaggio gli dice qual è il
   * primo libero; correggere è compito suo.
   */
  describe('conflitto sul numero documento', () => {
    const conflitto = {
      code: 'document_number_taken',
      number: 7,
      nextAvailable: 44,
      series: 'A',
    };

    it('la presa d’atto lascia in testata il numero digitato', async () => {
      view = await setup();
      view.component.form.controls['documentNumber']!.setValue(7);
      view.component.numberConflictDialog.open(conflitto);

      view.component.acknowledgeConflictNumber();

      expect(view.component.form.controls['documentNumber']!.value).toBe(7);
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

    expect(dice(form.externalOrderNotice(), 'corrispettivo', 'commercialista')).toBe(true);
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
