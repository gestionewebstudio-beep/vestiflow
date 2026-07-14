import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { ProductService } from '@features/products/services/product.service';

import { TransferFormComponent } from './transfer-form.component';
import { DocumentService } from './services/document.service';

const LOCATIONS = [
  { id: 'loc-1', name: 'Milano' },
  { id: 'loc-2', name: 'Roma' },
];

function operationalLocationsMock() {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

describe('TransferFormComponent', () => {
  async function setup() {
    await render(TransferFormComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: {} }, paramMap: of(convertToParamMap({})) },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
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

  // Regressione: le opzioni della location di destinazione escludono l'origine.
  // targetLocationOptions e' un computed che legge locationId dal FormControl
  // (non signal): deve ri-filtrare quando l'origine cambia, non restare fisso.
  it('ri-filtra le destinazioni escludendo la nuova origine selezionata', async () => {
    const user = userEvent.setup();
    await setup();

    // Cambia origine da Milano (default) a Roma.
    await user.click(screen.getByRole('button', { name: 'Location di origine' }));
    await user.click(screen.getByRole('option', { name: 'Roma' }));

    // La destinazione ora deve poter offrire Milano (non piu' Roma, ora origine).
    await user.click(screen.getByRole('button', { name: 'Location di destinazione' }));
    expect(screen.getByRole('option', { name: 'Milano' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Roma' })).toBeNull();
  });
});
