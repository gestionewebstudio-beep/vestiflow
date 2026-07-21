import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
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

function operationalLocationsMock(defaultLocation: { id: string; name: string } | null = null) {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => defaultLocation,
    suggestedWriteLocation: () => defaultLocation,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

describe('TransferFormComponent', () => {
  async function setup(options?: {
    readonly defaultLocation?: { id: string; name: string } | null;
  }) {
    await render(TransferFormComponent, {
      providers: [
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: {} }, paramMap: of(convertToParamMap({})) },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock(options?.defaultLocation ?? null),
        },
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

  // Specifica «sede predefinita»: puo' precompilare SOLO l'origine; la
  // destinazione non viene MAI autocompilata.
  it('precompila la sola origine con la sede predefinita; destinazione mai autocompilata', async () => {
    await setup({ defaultLocation: LOCATIONS[0] });

    const origin = screen.getByRole('button', { name: 'Location di origine' });
    expect(origin).toHaveTextContent('Milano (predefinita)');

    const target = screen.getByRole('button', { name: 'Location di destinazione' });
    expect(target).toHaveTextContent('Seleziona destinazione…');
  });

  // Senza predefinita (utente multi-sede): nessun fallback "prima location
  // disponibile", entrambi i campi partono vuoti.
  it('senza sede predefinita non autoseleziona origine ne destinazione', async () => {
    await setup();

    expect(screen.getByRole('button', { name: 'Location di origine' })).toHaveTextContent(
      'Seleziona origine…',
    );
    expect(screen.getByRole('button', { name: 'Location di destinazione' })).toHaveTextContent(
      'Seleziona destinazione…',
    );
  });
});
