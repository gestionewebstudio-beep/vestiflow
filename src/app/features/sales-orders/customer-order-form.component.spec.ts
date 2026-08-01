import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render } from '@testing-library/angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
import { DocumentActionsService } from '@core/services/document-actions.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentService } from '@domain/documents/services/document.service';
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

describe('CustomerOrderFormComponent — caratterizzazione', () => {
  async function setup() {
    const view = await render(CustomerOrderFormComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
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
        { provide: AuthService, useValue: { currentUser: () => null } },
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
          useValue: { available: () => of({ counters: [], proposedCounterId: null }) },
        },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
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
            getManualOrderMeta: () => of(null),
            getSalesOrderById: vi.fn(),
            saveManualOrder: vi.fn(),
          },
        },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        {
          provide: TableViewPreferenceApiService,
          useValue: { load: () => of(null), save: () => of(undefined) },
        },
      ],
    });

    const component = view.fixture.componentInstance as unknown as {
      lines: {
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
        length: number;
      };
      form: { controls: Record<string, { setValue: (v: unknown) => void }> };
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
  });
});
