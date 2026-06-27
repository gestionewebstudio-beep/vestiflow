import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AuthService } from '@core/auth';
import { AppErrorKind } from '@core/models/app-error.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';

import { InventoryService } from '@features/inventory/services/inventory.service';

import { RetailSaleRegisterComponent } from './retail-sale-register.component';

const LOCATIONS = [
  {
    id: 'loc-1',
    tenantId: 't1',
    name: 'Negozio Centro',
    code: 'NC',
    isActive: true,
    shopifyLocationId: null,
  },
];

const SCAN_RESULT = {
  variantId: 'var-1',
  productId: 'prod-1',
  sku: 'SKU-1',
  productName: 'Maglietta',
  remainingAvailable: 4,
  movementId: 'mov-1',
};

const ownerUser: User = {
  id: 'u1',
  tenantId: 't1',
  email: 'owner@test.it',
  displayName: 'Owner',
  avatarUrl: null,
  role: UserRole.Owner,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: false,
  tenantChannelProfile: 'gestionale',
  tenantName: 'Cliente test',
  assignedLocationId: null,
  assignedLocationName: null,
  permissions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function authServiceProvider(): {
  provide: typeof AuthService;
  useValue: { currentUser: () => User };
} {
  return {
    provide: AuthService,
    useValue: {
      currentUser: () => ownerUser,
    },
  };
}

function operationalLocationsMock(locations: typeof LOCATIONS) {
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

describe('RetailSaleRegisterComponent', () => {
  const registerRetailScan = vi.fn();
  const setActiveLocation = vi.fn();

  beforeEach(() => {
    registerRetailScan.mockReset();
    setActiveLocation.mockReset();
    registerRetailScan.mockReturnValue(of(SCAN_RESULT));
  });

  async function setup(options?: { locationId?: string | null; barcodeScanner?: boolean }) {
    const activeLocationId = signal<string | null>(options?.locationId ?? 'loc-1');

    await render(RetailSaleRegisterComponent, {
      providers: [
        provideRouter([]),
        authServiceProvider(),
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: 'http://localhost:3000/api/v1',
            features: { barcodeScanner: options?.barcodeScanner ?? false, shopify: false },
          },
        },
        {
          provide: InventoryService,
          useValue: {
            getLocations: () => of(LOCATIONS),
            registerRetailScan,
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock(LOCATIONS),
        },
        {
          provide: LocationContextService,
          useValue: {
            activeLocationId: activeLocationId.asReadonly(),
            setActiveLocation,
          },
        },
      ],
    });
  }

  it('mostra titolo e sezioni vendita/storno', async () => {
    await setup();
    expect(screen.getByRole('heading', { name: 'Registra vendita', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vendita', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Storno', level: 2 })).toBeTruthy();
  });

  it('registra vendita con codice e location', async () => {
    const user = userEvent.setup();
    await setup();

    await user.type(
      screen.getByLabelText('SKU o barcode', { selector: '#retail-sale-code' }),
      '8001234567890',
    );
    await user.click(screen.getByRole('button', { name: 'Registra vendita' }));

    await waitFor(() => {
      expect(registerRetailScan).toHaveBeenCalledWith({
        code: '8001234567890',
        locationId: 'loc-1',
        action: 'sale',
        channel: 'in_store',
      });
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Vendita registrata: Maglietta (SKU-1)',
    );
    expect(screen.getByText('Ultime registrazioni')).toBeTruthy();
  });

  it('registra storno con codice e location', async () => {
    const user = userEvent.setup();
    await setup();

    await user.type(
      screen.getByLabelText('SKU o barcode', { selector: '#retail-return-code' }),
      'SKU-1',
    );
    await user.click(screen.getByRole('button', { name: 'Registra storno' }));

    await waitFor(() => {
      expect(registerRetailScan).toHaveBeenCalledWith({
        code: 'SKU-1',
        locationId: 'loc-1',
        action: 'return',
        channel: 'in_store',
      });
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Storno registrato: Maglietta (SKU-1)',
    );
  });

  it('mostra errore se manca la location', async () => {
    const user = userEvent.setup();
    const activeLocationId = signal<string | null>(null);

    await render(RetailSaleRegisterComponent, {
      providers: [
        provideRouter([]),
        authServiceProvider(),
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: 'http://localhost:3000/api/v1',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        {
          provide: InventoryService,
          useValue: {
            getLocations: () => of([]),
            registerRetailScan,
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock([]),
        },
        {
          provide: LocationContextService,
          useValue: {
            activeLocationId: activeLocationId.asReadonly(),
            setActiveLocation,
          },
        },
      ],
    });

    await user.type(
      screen.getByLabelText('SKU o barcode', { selector: '#retail-sale-code' }),
      'SKU-1',
    );
    await user.click(screen.getByRole('button', { name: 'Registra vendita' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Seleziona la location del negozio.',
    );
    expect(registerRetailScan).not.toHaveBeenCalled();
  });

  it('mostra errore se variante non trovata', async () => {
    const user = userEvent.setup();
    registerRetailScan.mockReturnValue(
      throwError(() => ({
        kind: AppErrorKind.NotFound,
        message: 'Variante non trovata per SKU o barcode',
      })),
    );
    await setup();

    await user.type(
      screen.getByLabelText('SKU o barcode', { selector: '#retail-sale-code' }),
      'UNKNOWN',
    );
    await user.click(screen.getByRole('button', { name: 'Registra vendita' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nessuna variante trovata per questo SKU o barcode.',
    );
  });

  it('mostra pulsante scanner se feature abilitata', async () => {
    await setup({ barcodeScanner: true });
    expect(screen.getAllByRole('button', { name: 'Scansiona barcode' }).length).toBe(2);
  });
});
