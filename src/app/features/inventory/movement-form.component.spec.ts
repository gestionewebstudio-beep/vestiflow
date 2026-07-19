import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { CustomerService } from '@features/customers/services/customer.service';
import { ProductService } from '@features/products/services/product.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';

import { MovementFormComponent } from './movement-form.component';
import { InventoryService } from './services/inventory.service';

const LOCATION = { id: 'loc-1', name: 'Milano' };
const VARIANT = {
  variantId: 'var-1',
  productId: 'prod-1',
  productName: 'Maglietta',
  title: 'Maglietta / M / Rosso',
  sku: 'MAG-M-ROSSO',
  articleCode: '00042',
  sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
  purchasePrice: { amountMinor: 900, currencyCode: 'EUR' },
  unitOfMeasure: 'pz',
  stockAvailable: 5,
};
const VARIANT_2 = {
  ...VARIANT,
  variantId: 'var-2',
  title: 'Maglietta / L / Rosso',
  sku: 'MAG-L-ROSSO',
};
const LEVELS = [{ id: 'lvl-1', variantId: 'var-1', locationId: 'loc-1', available: 5, onHand: 6 }];

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
  async function setup(queryParams: Record<string, string> = {}) {
    const registerMovementBatch = vi.fn().mockReturnValue(of({ created: 1 }));
    await render(MovementFormComponent, {
      providers: [
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { features: { barcodeScanner: false, shopify: false } } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (query?: {
              search?: string;
              variantId?: string;
              productId?: string;
            }) =>
              query?.productId
                ? of([VARIANT, VARIANT_2])
                : query?.variantId || (query?.search && query.search.length >= 2)
                  ? of([VARIANT])
                  : of([]),
            findVariantByCode: () => of(VARIANT),
          },
        },
        {
          provide: InventoryService,
          useValue: { getLevelsByVariant: () => of(LEVELS), registerMovementBatch },
        },
        { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
        { provide: CustomerService, useValue: { getAllCustomers: () => of([]) } },
      ],
    });
    return { registerMovementBatch };
  }

  it('deep-link variantId: articolo già in lista con quantità 1', async () => {
    await setup({ variantId: 'var-1' });

    expect(await screen.findByText('Maglietta / M / Rosso')).toBeVisible();
    expect(screen.getByLabelText('Quantità per Maglietta / M / Rosso')).toHaveValue(1);
  });

  it('deep-link productId: tutte le varianti del prodotto già in lista', async () => {
    await setup({ productId: 'prod-1', type: 'unload' });

    expect(await screen.findByText('Maglietta / M / Rosso')).toBeVisible();
    expect(await screen.findByText('Maglietta / L / Rosso')).toBeVisible();
    expect(screen.getByLabelText('Quantità per Maglietta / M / Rosso')).toHaveValue(1);
    expect(screen.getByLabelText('Quantità per Maglietta / L / Rosso')).toHaveValue(1);
  });

  it('scarico oltre il disponibile: avviso non bloccante sulla riga', async () => {
    const user = userEvent.setup();
    await setup({ variantId: 'var-1', type: 'unload' });

    expect(screen.getByRole('heading', { name: 'Registra scarico' })).toBeVisible();

    const quantity = screen.getByLabelText('Quantità per Maglietta / M / Rosso');
    await user.clear(quantity);
    await user.type(quantity, '99');

    expect(screen.getByText(/Supera il disponibile \(5\)/)).toBeVisible();
    // Non bloccante: il Salva resta attivo.
    expect(screen.getByRole('button', { name: /Salva/ })).toBeEnabled();
  });

  it('rettifica: causale precompilata, giacenza attuale readonly e nuova giacenza', async () => {
    await setup({ variantId: 'var-1', type: 'adjustment' });

    expect(screen.getByRole('heading', { name: 'Registra rettifica' })).toBeVisible();
    expect(screen.getByLabelText(/Causale/)).toHaveValue('Rettifica giacenza');

    // Giacenza attuale calcolata dal sistema (onHand a Milano = 6).
    expect(screen.getByText('Giacenza attuale')).toBeVisible();
    expect(screen.getByLabelText('Nuova giacenza per Maglietta / M / Rosso')).toHaveValue(6);
  });

  it('ricerca in fondo alla lista: aggiunge senza uscire, doppio add incrementa', async () => {
    const user = userEvent.setup();
    await setup();

    const search = screen.getByLabelText('Cerca articolo per codice articolo, nome, SKU o EAN');
    await user.type(search, 'mag');
    await user.click(await screen.findByRole('button', { name: /Aggiungi/ }));

    const quantity = screen.getByLabelText('Quantità per Maglietta / M / Rosso');
    expect(quantity).toHaveValue(1);

    await user.type(search, 'mag');
    await user.click(await screen.findByRole('button', { name: /Aggiungi/ }));
    expect(quantity).toHaveValue(2);
  });
});
