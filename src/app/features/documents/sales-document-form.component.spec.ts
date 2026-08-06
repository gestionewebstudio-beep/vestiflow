import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { TenantCompanyService } from '@domain/tenant/services/tenant-company.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';

import { SalesDocumentFormComponent } from './sales-document-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';

function operationalLocationsMock() {
  const locations = [{ id: 'loc-1', name: 'Milano' }];
  return {
    locations: () => locations,
    writeLocations: () => locations,
    actionLocations: () => locations,
    transferTargetLocations: () => locations,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

describe('SalesDocumentFormComponent', () => {
  async function setup(pricesIncludeVat = false) {
    await render(SalesDocumentFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: { available: () => of({ counters: [], proposedCounterId: null }) },
        },
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { salesDocumentType: DocumentType.Proforma },
              queryParamMap: convertToParamMap({}),
            },
            paramMap: of(convertToParamMap({})),
            data: of({ salesDocumentType: DocumentType.Proforma }),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        {
          provide: CustomerService,
          useValue: { getCustomers: () => of({ data: [], page: 1, pageSize: 100, total: 0 }) },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        // Iniettato per la generazione «Concludi ordine → Fattura accompagnatoria».
        { provide: SalesOrderService, useValue: { concludeManualPrefill: vi.fn() } },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        // Dati cedente: alimentano l'IBAN precompilato in fattura.
        { provide: TenantCompanyService, useValue: { getCompany: () => of(null) } },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            // DDT agganciabili in fattura (mai richiesti senza cliente).
            getDocuments: () => of({ data: [], page: 1, pageSize: 50, total: 0 }),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
            getPriceModePreference: () => of(pricesIncludeVat),
          },
        },
      ],
    });
  }

  // Regressione: i totali stimati sono un computed che legge valori dai
  // FormControl (non signal). Devono aggiornarsi digitando il prezzo di riga,
  // non restare congelati sul valore iniziale (€ 0,00).
  it('aggiorna il totale stimato quando cambia il prezzo di riga', async () => {
    const user = userEvent.setup();
    await setup();

    expect(screen.queryByText(/12,20/)).toBeNull();

    const priceInput = screen.getByLabelText('Prezzo netto');
    await user.clear(priceInput);
    await user.type(priceInput, '10,00');

    // qty 1 × 10,00 con IVA 22% = imponibile 10,00 + IVA 2,20 = 12,20.
    expect(await screen.findByText(/12,20/)).toBeVisible();
  });

  // §sei decimali: 123,97 al 22% non ha un netto intero. Con l'imposta calcolata
  // sull'imponibile arrotondato il documento valeva 123,96 — un centesimo meno
  // di quello che l'operatore aveva digitato, e diverso da quello che il campo
  // prezzo continuava a mostrargli.
  it('il totale torna al prezzo ivato digitato, coda decimale compresa', async () => {
    const user = userEvent.setup();
    await setup(true);

    const priceInput = screen.getByLabelText('Prezzo ivato');
    await user.clear(priceInput);
    await user.type(priceInput, '123,97');

    // Imponibile 101,61 + IVA 22,36 = 123,97, esattamente il prezzo digitato.
    expect(await screen.findByText(/101,61/)).toBeVisible();
    expect(screen.getAllByText(/123,97/).length).toBeGreaterThan(0);
  });

  // In modalità ivata cambia solo come si legge il prezzo: il documento vale
  // lo stesso, perché imponibile e imposta si ricavano dal netto scorporato.
  it('in modalità ivata i totali si calcolano dal netto scorporato', async () => {
    const user = userEvent.setup();
    await setup(true);

    const priceInput = screen.getByLabelText('Prezzo ivato');
    await user.clear(priceInput);
    await user.type(priceInput, '12,20');

    // 12,20 ivati al 22% → imponibile 10,00, IVA 2,20, totale 12,20.
    expect(await screen.findByText(/10,00/)).toBeVisible();
    expect(screen.getAllByText(/12,20/).length).toBeGreaterThan(0);
  });
});
