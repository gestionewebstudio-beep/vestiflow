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
    checkWebhooks: vi.fn(),
    registerMissingWebhooks: vi.fn(),
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

  // ── La verita' sullo stato dei webhook ──────────────────────────────────────────
  describe('stato delle notifiche', () => {
    function connectionWith(extra: Partial<ShopifyConnection>): ShopifyConnection {
      return { ...CONNECTED, autoSyncEnabled: true, ...extra };
    }

    it('mai verificate: non dice «zero», dice che non lo sappiamo', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ webhookTopicsKnown: false, webhookTopics: [] })),
      );
      await setup();

      expect(
        await screen.findByText(/Non sappiamo quali notifiche siano davvero registrate/i),
      ).toBeVisible();
      expect(screen.getByText('Non verificate')).toBeVisible();
      // Il numero esatto che descriveva un insieme sconosciuto non c'e' piu'.
      expect(screen.queryByText(/canali attivi/i)).toBeNull();
    });

    it('una notifica mancante viene NOMINATA, non contata', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: ['orders/cancelled'],
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      expect(await screen.findByText(/Manca una notifica su Shopify/i)).toBeVisible();
      // Il nome sta in due posti apposta: nella banda, e nei fatti sempre visibili — che
      // restano leggibili anche quando la banda parla di un altro problema.
      expect(screen.getByText(/Non registrate: orders\/cancelled/i)).toBeVisible();
      expect(screen.getByText('1 su 2 — manca orders/cancelled')).toBeVisible();
    });

    it('indirizzo diverso: dice che gli eventi vanno altrove', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: [],
            webhookAddress: 'http://localhost:3000/api/v1/shopify/webhooks',
            webhookAddressMatchesConfigured: false,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      expect(await screen.findByText(/Le notifiche non arrivano qui/i)).toBeVisible();
    });

    // ⚠ GUARDIA — nessuna informazione importante dietro una priorità.
    // Il difetto che questo test impedisce di ripetere: il nome del topic mancante viveva
    // solo dentro una banda che doveva prima vincere sulle altre, e con l'indirizzo
    // sbagliato non compariva più da nessuna parte. Restava «7 su 8», un numero muto.
    it('due problemi insieme: si dicono ENTRAMBI, e il nome resta nei fatti', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: ['orders/cancelled'],
            webhookAddress: 'https://vecchio-dominio.example/api/v1/shopify/webhooks',
            webhookAddressMatchesConfigured: false,
            webhookAddressComparable: true,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      // Nessuno dei due nasconde l'altro.
      expect(await screen.findByText(/2 problemi sulle notifiche/i)).toBeVisible();
      expect(screen.getByText(/gli eventi vengono consegnati altrove/i)).toBeVisible();
      expect(screen.getByText(/Non registrate: orders\/cancelled/i)).toBeVisible();

      // E il nome sta comunque nei fatti sempre visibili, che non competono con niente.
      expect(screen.getByText(/1 su 2 — manca orders\/cancelled/i)).toBeVisible();
    });

    it('il conteggio da solo non basta: la riga dei fatti nomina il mancante', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
            webhookMissingTopics: ['orders/cancelled'],
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      expect(await screen.findByText('7 su 8 — manca orders/cancelled')).toBeVisible();
    });

    it('da locale il confronto si spegne e lo dichiara, invece di tacere', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: [],
            webhookAddress: 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks',
            webhookAddressMatchesConfigured: null,
            webhookAddressComparable: false,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      expect(await screen.findByText(/confronto non possibile da questo ambiente/i)).toBeVisible();
      expect(screen.queryByText(/Le notifiche non arrivano qui/i)).toBeNull();
    });

    it('indirizzo non confrontabile: nessun allarme dato per ignoranza', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: [],
            webhookAddress: null,
            // `null` non e' `false`: non sappiamo confrontare, quindi non si segnala niente.
            webhookAddressMatchesConfigured: null,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      // L'affermazione da verificare e' un'ASSENZA: nessun allarme. Cercare il testo
      // «Aggiornamenti automatici attivi» pescherebbe anche l'avviso sulle giacenze, che
      // parla d'altro — misurare la cosa accanto invece di quella giusta.
      expect(await screen.findByText('Indirizzo di consegna')).toBeVisible();
      expect(screen.queryByText(/Le notifiche non arrivano qui/i)).toBeNull();
      expect(screen.queryByText('Problema')).toBeNull();
    });

    it('la data dell ultimo evento e dichiarativa, senza verdetto', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ lastWebhookEventAt: null })),
      );
      await setup();

      expect(await screen.findByText('Nessun evento ricevuto finora')).toBeVisible();
    });

    // ── Il pulsante di riparazione: solo quando ha senso, e solo quando e' sicuro ────
    it('senza verifica non compare: prima si guarda, poi si ripara', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ webhookTopicsKnown: false })),
      );
      await setup();

      await screen.findByRole('button', { name: /Verifica ora/i });
      expect(screen.queryByRole('button', { name: /Registra le notifiche mancanti/i })).toBeNull();
    });

    it('senza mancanti non compare: non c e niente da riparare', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: [],
            webhookAddressComparable: true,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      await screen.findByRole('button', { name: /Verifica ora/i });
      expect(screen.queryByRole('button', { name: /Registra le notifiche mancanti/i })).toBeNull();
    });

    // ⚠ GUARDIA — registro 1.7. Da un ambiente locale registrare creerebbe sottoscrizioni
    // verso localhost sul negozio vero, che si sommano alle buone invece di sostituirle.
    it('da un ambiente non consegnabile NON compare, anche con mancanti', async () => {
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: ['orders/cancelled'],
            webhookAddressComparable: false,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      await setup();

      expect(await screen.findByText(/manca orders\/cancelled/i)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Registra le notifiche mancanti/i })).toBeNull();
    });

    it('con mancanti e indirizzo buono: registra e mostra l esito RIMISURATO', async () => {
      const user = userEvent.setup();
      connectionService.getConnection.mockReturnValue(
        of(
          connectionWith({
            webhookTopicsKnown: true,
            webhookTopics: ['orders/create'],
            webhookMissingTopics: ['orders/cancelled'],
            webhookAddressComparable: true,
            webhooksCheckedAt: '2026-08-08T17:00:00.000Z',
          }),
        ),
      );
      connectionService.registerMissingWebhooks.mockReturnValue(
        of({
          checkedAt: '2026-08-08T18:00:00.000Z',
          shopDomain: 'demo.myshopify.com',
          configuredAddress: 'https://vestiflow.example/api/v1/shopify/webhooks',
          observedAddress: 'https://vestiflow.example/api/v1/shopify/webhooks',
          addressMatchesConfigured: true,
          addressComparable: true,
          topics: ['orders/create', 'orders/cancelled'],
          missingTopics: [],
          unexpectedTopics: [],
          otherAddresses: [],
          totalSubscriptions: 2,
        }),
      );
      await setup();

      await user.click(
        await screen.findByRole('button', { name: /Registra le notifiche mancanti/i }),
      );

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('2 notifiche registrate'),
      );
    });

    it('«Verifica ora» chiede a Shopify e riporta cosa manca', async () => {
      const user = userEvent.setup();
      connectionService.getConnection.mockReturnValue(of(connectionWith({})));
      connectionService.checkWebhooks.mockReturnValue(
        of({
          checkedAt: '2026-08-08T17:00:00.000Z',
          shopDomain: 'demo.myshopify.com',
          configuredAddress: 'https://vestiflow.example/api/v1/shopify/webhooks',
          observedAddress: 'https://vestiflow.example/api/v1/shopify/webhooks',
          addressMatchesConfigured: true,
          addressComparable: true,
          topics: ['orders/create'],
          missingTopics: ['orders/cancelled'],
          unexpectedTopics: [],
          otherAddresses: [],
          totalSubscriptions: 1,
        }),
      );
      await setup();

      await user.click(await screen.findByRole('button', { name: /Verifica ora/i }));

      // `alert` e non `status`: il ruolo ARIA segue il tono, e una notifica mancante e' un
      // avviso che interrompe la lettura, non un'informazione di servizio.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('orders/cancelled'));
    });
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
