import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { ProductService } from '@features/products/services/product.service';

import { MovementFormComponent } from './movement-form.component';
import { InventoryService } from './services/inventory.service';

const LOCATION = { id: 'loc-1', name: 'Milano' };
const VARIANT = {
  variantId: 'var-1',
  productId: 'prod-1',
  productName: 'Maglietta',
  title: 'Maglietta / M / Rosso',
  sku: 'MAG-M-ROSSO',
};

function operationalLocationsMock() {
  return {
    locations: () => [LOCATION],
    writeLocations: () => [LOCATION],
    actionLocations: () => [LOCATION],
    transferTargetLocations: () => [LOCATION],
    defaultLocation: () => null,
    suggestedWriteLocation: () => LOCATION,
    isFixedSingleStore: () => true,
    fixedSingleStoreLocationId: () => LOCATION.id,
    fixedSingleStoreLabel: () => LOCATION.name,
  };
}

describe('MovementFormComponent', () => {
  async function setup() {
    await render(MovementFormComponent, {
      providers: [
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { features: { barcodeScanner: false, shopify: false } } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ variantId: 'var-1' }) } },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (query?: { search?: string; variantId?: string }) =>
              query?.variantId || (query?.search && query.search.length >= 2)
                ? of([VARIANT])
                : of([]),
            findVariantByCode: () => of(VARIANT),
          },
        },
        { provide: InventoryService, useValue: { getLevelsByVariant: () => of([]) } },
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
  }

  // Regressione: `review()` legge form.getRawValue() (non reattivo). Rientrando in
  // fase riepilogo dopo aver cambiato solo un campo del form (quantita'), il
  // computed deve ricalcolare invece di restare memoizzato sui valori precedenti.
  it('ricalcola il riepilogo dopo aver modificato la quantita e rientrare in review', async () => {
    const user = userEvent.setup();
    await setup();

    const quantityInput = screen.getByLabelText('Quantità');
    await user.clear(quantityInput);
    await user.type(quantityInput, '7');
    await user.click(screen.getByRole('button', { name: 'Continua' }));

    expect(screen.getByText('Riepilogo movimento')).toBeVisible();
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Modifica' }));

    const quantityInputAgain = screen.getByLabelText('Quantità');
    await user.clear(quantityInputAgain);
    await user.type(quantityInputAgain, '13');
    await user.click(screen.getByRole('button', { name: 'Continua' }));

    expect(screen.getByText('Riepilogo movimento')).toBeVisible();
    expect(screen.getAllByText('13').length).toBeGreaterThan(0);
    expect(screen.queryByText('7')).toBeNull();
  });
});
