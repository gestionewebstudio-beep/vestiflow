import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';

import { ShopifyIntegrationPanelComponent } from './shopify-integration-panel.component';

const CONNECTED = {
  id: 'conn-1',
  tenantId: 'tenant-1',
  status: ShopifyConnectionStatus.Connected,
  shopDomain: 'demo.myshopify.com',
  scopes: ['read_products', 'write_inventory'],
  autoSyncEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as ShopifyConnection;

const LOCATION_SETUP = {
  active: true,
  label: 'Location collegate',
  detail: '2 location collegate a Shopify',
} as const;

describe('ShopifyIntegrationPanelComponent', () => {
  const connectionService = {
    getConnection: vi.fn(),
    beginAuth: vi.fn(),
    disconnect: vi.fn(),
    syncProducts: vi.fn(),
    syncInventory: vi.fn(),
    syncCustomers: vi.fn(),
    syncOrders: vi.fn(),
    syncLocations: vi.fn(),
    syncWebhooks: vi.fn(),
    disableWebhooks: vi.fn(),
    clearErrors: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connectionService.getConnection.mockReturnValue(of(CONNECTED));
    connectionService.syncLocations.mockReturnValue(
      of({ totalCount: 2, importedCount: 2, matchedCount: 0, autoLicensed: false }),
    );
  });

  async function setup(inputs: Partial<{ mustChooseLocations: boolean }> = {}) {
    const locationsChanged = vi.fn();
    await render(ShopifyIntegrationPanelComponent, {
      inputs: { locationSetupStatus: LOCATION_SETUP, ...inputs },
      on: { locationsChanged },
      providers: [
        provideRouter([]),
        { provide: ShopifyConnectionService, useValue: connectionService },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              id: 'u1',
              role: 'owner',
              tenantChannelProfile: 'shopify',
            }),
          },
        },
      ],
    });
    return { locationsChanged };
  }

  it('mostra il negozio collegato leggendo la connessione una volta sola', async () => {
    await setup();

    expect(await screen.findByText('demo.myshopify.com')).toBeVisible();
    // Store condiviso: la pagina e il pannello guardano la stessa lettura.
    expect(connectionService.getConnection).toHaveBeenCalledTimes(1);
  });

  it('lo stato delle location arriva dalla pagina: il pannello lo mostra e basta', async () => {
    await setup();

    expect(await screen.findByText('Location collegate')).toBeVisible();
    expect(screen.getByText('2 location collegate a Shopify')).toBeVisible();
  });

  it('dopo «Sincronizza location» avvisa chi ospita il pannello, che rilegge le sedi', async () => {
    const user = userEvent.setup();
    const { locationsChanged } = await setup();

    await user.click(await screen.findByRole('button', { name: /Sincronizza location/i }));

    await waitFor(() => expect(locationsChanged).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('2 location importate da Shopify');
  });

  it('con piano multi-sede il messaggio chiede di scegliere le sedi da attivare', async () => {
    const user = userEvent.setup();
    await setup({ mustChooseLocations: true });

    await user.click(await screen.findByRole('button', { name: /Sincronizza location/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Seleziona le sedi da attivare in VestiFlow',
      ),
    );
  });

  it('un errore di sync resta a schermo: non e’ un avviso che scade', async () => {
    const user = userEvent.setup();
    connectionService.syncProducts.mockReturnValue(
      throwError(() => ({ kind: 'server', message: 'Shopify non risponde.' })),
    );
    await setup();

    await user.click(await screen.findByRole('button', { name: /Importa catalogo/i }));

    expect(await screen.findByText('Shopify non risponde.')).toBeVisible();
  });
});
