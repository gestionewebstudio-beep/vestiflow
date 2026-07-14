import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@features/customers/services/customer.service';
import { ProductService } from '@features/products/services/product.service';
import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';

import { SalesDocumentFormComponent } from './sales-document-form.component';
import { DocumentService } from './services/document.service';

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
  async function setup() {
    await render(SalesDocumentFormComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { salesDocumentType: DocumentType.Proforma } },
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
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
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

    const priceInput = screen.getByLabelText('Prezzo');
    await user.clear(priceInput);
    await user.type(priceInput, '10,00');

    // qty 1 × 10,00 con IVA 22% = imponibile 10,00 + IVA 2,20 = 12,20.
    expect(await screen.findByText(/12,20/)).toBeVisible();
  });
});
