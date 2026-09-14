import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject, TimeoutError, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import type { ShopifySetupDto } from '@domain/channels/shopify/models/shopify-setup.dto';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySetupService } from '@domain/channels/shopify/services/shopify-setup.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { SHOPIFY_ALLINEA_COLUMN_DEFS } from '../../models/shopify-allinea-table-columns.config';
import { ShopifyIntegrationPanelComponent } from './shopify-integration-panel.component';

/**
 * ⚠️ **Il servizio vero delle preferenze colonne tira dietro `AuthService` e
 * `APP_CONFIG`**, che con questo pannello non c’entrano. Basta un doppio che
 * renda le colonne predefinite dell’elenco delle non allineate (`docs/26` A3)
 * e non salvi nulla — la risoluzione vera ha le sue prove, in `shared/`.
 */
const COLONNE_FINTE = {
  provide: TableColumnPreferenceService,
  useValue: {
    registerView: vi.fn(),
    columnDefs: vi.fn(() => SHOPIFY_ALLINEA_COLUMN_DEFS),
    visibleColumns: vi.fn(() =>
      signal(SHOPIFY_ALLINEA_COLUMN_DEFS.map((c) => ({ ...c, pinned: false }))).asReadonly(),
    ),
    visibleColumnIds: vi.fn(() => SHOPIFY_ALLINEA_COLUMN_DEFS.map((c) => c.id)),
    state: vi.fn(() =>
      signal({
        presetId: 'default',
        columnOrder: SHOPIFY_ALLINEA_COLUMN_DEFS.map((c) => c.id),
        hiddenColumnIds: [] as string[],
        pinnedColumnIds: [] as string[],
        columnWidths: {},
      }).asReadonly(),
    ),
    presetMap: vi.fn(() => ({})),
    isColumnVisible: vi.fn(() => true),
    moveColumn: vi.fn(),
    toggleColumn: vi.fn(),
    togglePin: vi.fn(),
    applyPreset: vi.fn(),
    resetToDefault: vi.fn(),
    columnWidth: vi.fn((_vista: unknown, _colonna: string, ripiego: number) => ripiego),
    setColumnWidths: vi.fn(),
  },
};

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
  label: 'Sedi collegate',
  detail: '2 sedi collegate a una location del negozio',
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
    allineaDisponibilita: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connectionService.getConnection.mockReturnValue(of(CONNECTED));
    connectionService.syncLocations.mockReturnValue(
      of({ totalCount: 2, importedCount: 0, matchedCount: 1, autoLicensed: false }),
    );
  });

  /** Il titolare, salvo che una prova chieda un altro utente. */
  const TITOLARE = {
    id: 'u1',
    role: 'owner',
    tenantChannelProfile: 'shopify',
    permissions: [],
  };

  /** Nessun percorso di prima connessione: la connessione è nata prima. */
  const PERCORSO_ASSENTE: ShopifySetupDto = {
    presente: false,
    status: null,
    direction: null,
    locations: [],
    sediVestiFlow: [],
    anteprima: null,
    esito: null,
    confirmedAt: null,
    activatedAt: null,
    blocchiAttivazione: [],
    irrisolti: [],
    trasferimentoInCorso: false,
    situazione: { calcolataAt: '2026-09-13T01:00:00.000Z', problemi: [] },
  };

  async function setup(
    inputs: Partial<{ mustChooseLocations: boolean; scheda: string | null }> = {},
    utente: object = TITOLARE,
    percorso: ShopifySetupDto = PERCORSO_ASSENTE,
  ) {
    const locationsChanged = vi.fn();
    const setupService = { stato: vi.fn().mockReturnValue(of(percorso)) };
    await render(ShopifyIntegrationPanelComponent, {
      inputs: { locationSetupStatus: LOCATION_SETUP, ...inputs },
      on: { locationsChanged },
      providers: [
        // La scheda è nella rotta: una rotta che accetta qualunque segmento, senza rendere.
        provideRouter([{ path: '**', children: [] }]),
        COLONNE_FINTE,
        { provide: ShopifyConnectionService, useValue: connectionService },
        { provide: ShopifySetupService, useValue: setupService },
        { provide: AuthService, useValue: { currentUser: () => utente } },
      ],
    });
    return { locationsChanged, setupService };
  }

  /**
   * ⭐ **Le quattro sezioni, e i comandi col PROPRIO permesso** (11/09/2026):
   * i pulsanti di sincronizzazione stanno solo qui, e chi ha un solo permesso
   * vede il solo comando che quel permesso concede — senza connessione, senza
   * configurazione, senza una lettura della connessione che l’API gli negherebbe.
   */
  describe('una sede sola, con i permessi di prima', () => {
    it('il titolare vede le CINQUE schede; senza scheda nella rotta si apre la sincronizzazione automatica', async () => {
      await setup();

      // ⭐ docs/29 §3: Prima connessione · Sincronizzazione automatica · Operazioni manuali ·
      //    Problemi ed esiti · Connessione e sedi. Le schede sono quelle condivise (app-nav-tabs).
      const schede = await screen.findByRole('navigation', { name: 'Aree di Shopify' });
      const nomi = within(schede)
        .getAllByRole('link')
        .map((a) => a.textContent?.trim().replace(/\s+/g, ' '));
      expect(nomi).toEqual([
        'Prima connessione',
        'Sincronizzazione automatica sospesa',
        'Operazioni manuali',
        'Problemi ed esiti 0',
        'Connessione e sedi',
      ]);
      // La scheda predefinita a percorso concluso o assente: gli aggiornamenti automatici.
      expect(
        screen.getByRole('heading', { name: /Aggiornamenti automatici tra Shopify e VestiFlow/ }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: /Importa catalogo/ })).toBeNull();
      // Stato e dominio stanno nell'intestazione della PAGINA (14/09/2026), non nel
      // pannello; qui le schede. Nessun titolo doppio «Integrazione Shopify».
      expect(screen.getByRole('navigation', { name: 'Aree di Shopify' })).toBeVisible();
      expect(screen.queryByText('demo.myshopify.com')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Integrazione Shopify' })).toBeNull();
    });

    it('la scheda Operazioni manuali: quattro righe con la stessa griglia, direzione dichiarata, un solo «Allinea»', async () => {
      await setup({ scheda: 'operazioni' });

      expect(
        await screen.findByRole('heading', { name: /Operazioni avviate manualmente/ }),
      ).toBeVisible();
      expect(screen.getAllByText('Shopify → VestiFlow')).toHaveLength(3);
      expect(screen.getByText('VestiFlow → Shopify')).toBeVisible();
      expect(screen.getByRole('button', { name: /Importa catalogo/ })).toBeVisible();
      // ⭐ UN solo comando manuale sulle quantità (13/09/2026): niente «Riallinea».
      expect(screen.getByRole('button', { name: /Allinea giacenze su Shopify/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Riallinea/ })).toBeNull();
      expect(screen.getByRole('button', { name: /Importa clienti/ })).toBeVisible();
      expect(screen.getByRole('button', { name: /Importa ordini/ })).toBeVisible();
      // Ogni riga dice cosa fa e su quali dati; l'esito, se non c'è, lo dice.
      // ⭐ Quando serve e che cosa modifica, verificati contro docs/24 §9.2 (14/09/2026).
      expect(screen.getByText(/su tutto il catalogo del negozio/)).toBeVisible();
      expect(
        screen.getByText(/Non tocca nome e categoria VestiFlow, prezzi di vendita e quantità/),
      ).toBeVisible();
      expect(screen.getAllByText('Nessun esito disponibile').length).toBeGreaterThan(0);
      // Le altre schede non sono qui.
      expect(screen.queryByRole('button', { name: /Rileggi le location dal negozio/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Disconnetti Shopify/ })).toBeNull();
    });

    it('la scheda Connessione e sedi: negozio, accesso, sedi, e la disconnessione in fondo in un contenitore neutro', async () => {
      await setup({ scheda: 'connessione' });

      expect(await screen.findByRole('heading', { name: 'Negozio' })).toBeVisible();
      expect(screen.getByRole('heading', { name: /^Sedi/ })).toBeVisible();
      // ⭐ Il comando sta a destra del titolo; il suo QUANDO nel «?», che cosa fa e non fa
      //    resta visibile (14/09/2026).
      expect(screen.getByRole('button', { name: /Rileggi le location dal negozio/ })).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Quando rileggere le location' }),
      ).toHaveAccessibleDescription(/dopo aver aggiunto, rinominato o disattivato una location/i);
      expect(screen.getByText(/non crea sedi e non cambia le scelte già fatte/)).toBeVisible();
      expect(screen.queryByText('Prossimi passi')).toBeNull();
      // ⭐ Quattro gruppi distinti (14/09/2026): negozio, permessi, sedi, operazioni sensibili.
      expect(screen.getByRole('heading', { name: /Permessi su Shopify/ })).toBeVisible();
      expect(screen.getByRole('heading', { name: /Operazioni sensibili/ })).toBeVisible();
      expect(screen.getByRole('button', { name: /Disconnetti Shopify/ })).toBeVisible();
      // ⛔ La purga è SPENTA finché l'API la rifiuta, col motivo accanto al pulsante
      //    (proprietario, 13/09/2026): un comando acceso e poi negato è un difetto.
      const purga = screen.getByRole('button', { name: /Disconnetti e rimuovi dati/ });
      expect(purga).toBeVisible();
      expect(purga).toBeDisabled();
      expect(purga).toHaveAccessibleDescription(/l'API rifiuta la rimozione dei dati importati/);
    });

    it('chi ha il solo permesso sulle giacenze vede «Allinea giacenze», e nient’altro', async () => {
      await setup(
        {},
        {
          id: 'u2',
          role: 'manager',
          tenantChannelProfile: 'shopify',
          permissions: ['inventory.import_export'],
        },
      );

      expect(
        await screen.findByRole('heading', { name: /Operazioni avviate manualmente/ }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: /Allinea giacenze su Shopify/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Riallinea/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Importa catalogo/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Importa clienti/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Importa ordini/ })).toBeNull();
      // Senza il permesso sulla connessione non ci sono schede: solo le operazioni concesse.
      expect(screen.queryByRole('navigation', { name: 'Aree di Shopify' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Negozio' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Prima connessione' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Disconnetti Shopify/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Connetti Shopify/ })).toBeNull();
      // Non si chiede una connessione che l’API negherebbe (403), e non si finge «non connesso».
      expect(connectionService.getConnection).not.toHaveBeenCalled();
      expect(screen.queryByText(/Nessuna connessione Shopify attiva/)).toBeNull();
      expect(screen.getByText(/visibili al titolare/)).toBeVisible();
    });

    it('l’esito del comando compare accanto ai Comandi, anche per chi non è titolare', async () => {
      const user = userEvent.setup();
      connectionService.allineaDisponibilita.mockReturnValue(
        of({
          totale: 4,
          esaminate: 4,
          allineate: 3,
          giaAllineate: 1,
          nonAllineate: [],
          completo: true,
        }),
      );
      await setup(
        {},
        {
          id: 'u2',
          role: 'manager',
          tenantChannelProfile: 'shopify',
          permissions: ['inventory.import_export'],
        },
      );

      await user.click(await screen.findByRole('button', { name: /Allinea giacenze su Shopify/ }));
      expect(connectionService.allineaDisponibilita).toHaveBeenCalledTimes(1);
      // L'esito sta sulla riga dell'operazione, accanto al pulsante.
      const riga = screen.getByRole('listitem', { name: 'Allinea giacenze su Shopify' });
      expect(await within(riga).findByRole('status')).toHaveTextContent(/Controllo completato/);
    });

    /**
     * ⭐ Clienti e ordini seguono le combinazioni dell’API (deciso l’11/09/2026):
     * chi ha «Esportare dati» E «Gestire clienti» vede ed esegue «Importa
     * clienti» senza gestire la connessione — e NON vede «Importa ordini», che
     * chiede un’altra combinazione.
     */
    it('chi ha la combinazione dei clienti vede ed esegue «Importa clienti», non «Importa ordini»', async () => {
      const user = userEvent.setup();
      connectionService.syncCustomers.mockReturnValue(
        of({
          synced: true,
          imported: 2,
          updated: 1,
          skipped: 0,
          remoteCustomerCount: 3,
          failed: [],
        }),
      );
      await setup(
        {},
        {
          id: 'u3',
          role: 'manager',
          tenantChannelProfile: 'shopify',
          permissions: ['section.customers', 'customers.manage', 'reports.export'],
        },
      );

      expect(
        await screen.findByRole('heading', { name: /Operazioni avviate manualmente/ }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: /Importa clienti/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Importa ordini/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Importa catalogo/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Allinea giacenze/ })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Negozio' })).toBeNull();
      expect(connectionService.getConnection).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /Importa clienti/ }));
      expect(connectionService.syncCustomers).toHaveBeenCalledTimes(1);
      const operazioni = screen.getByRole('region', { name: /Operazioni avviate manualmente/ });
      expect(await within(operazioni).findByRole('status')).toBeVisible();
      // ⭐ E l'esito resta sulla SUA riga, con lo stato e la data.
      const riga = screen.getByRole('listitem', { name: 'Importa clienti' });
      expect(riga).toHaveTextContent('eseguita');
      expect(riga).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
      expect(riga).not.toHaveTextContent('Nessun esito disponibile');
    });

    it('«Esportare dati» da solo non mostra né Importa clienti né Importa ordini', async () => {
      await setup(
        {},
        {
          id: 'u4',
          role: 'manager',
          tenantChannelProfile: 'shopify',
          permissions: ['reports.export'],
        },
      );
      expect(
        await screen.findByRole('heading', { name: /Operazioni avviate manualmente/ }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: /Importa clienti/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Importa ordini/ })).toBeNull();
    });
  });

  it('mostra il negozio collegato leggendo la connessione una volta sola', async () => {
    await setup();

    expect(await screen.findByRole('navigation', { name: 'Aree di Shopify' })).toBeVisible();
    // Store condiviso: la pagina e il pannello guardano la stessa lettura.
    expect(connectionService.getConnection).toHaveBeenCalledTimes(1);
  });

  it('lo stato delle location arriva dalla pagina: il pannello lo mostra e basta', async () => {
    await setup({ scheda: 'connessione' });

    expect(await screen.findByText('Sedi collegate')).toBeVisible();
    expect(screen.getByText('2 sedi collegate a una location del negozio')).toBeVisible();
  });

  /**
   * ⛔ La sincronizzazione delle sedi non parte da sola.
   *
   * Non è una lettura: crea sedi quando il nome non coincide, rinomina quelle
   * collegate e ne cancella o disattiva altre. Partiva da tre punti — questo
   * pannello al ritorno da OAuth, la prima apertura delle Impostazioni e un
   * effect della shell che scattava da qualunque pagina — e tre sedi VestiFlow
   * più tre location Shopify diventavano sei (registro difetti 3.14).
   *
   * Se questo test fallisce, qualcuno ha rimesso un innesco automatico.
   */
  it('aprendo il pannello non parte nessuna sincronizzazione delle sedi', async () => {
    await setup();

    await screen.findByRole('navigation', { name: 'Aree di Shopify' });
    expect(connectionService.syncLocations).not.toHaveBeenCalled();
  });

  it('dopo «Rileggi le location dal negozio» avvisa chi ospita il pannello, che rilegge le sedi; l’esito dice cosa ha letto, non «importato»', async () => {
    const user = userEvent.setup();
    const { locationsChanged } = await setup({ scheda: 'connessione' });

    await user.click(
      await screen.findByRole('button', { name: /Rileggi le location dal negozio/i }),
    );

    await waitFor(() => expect(locationsChanged).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Lette 2 location dal negozio: 1 è collegata a una sede. Per le altre la scelta — collega, crea o lascia fuori — è nella tabella «Sedi».',
    );
  });

  it('con piano multi-sede il messaggio chiede di scegliere le sedi da attivare', async () => {
    const user = userEvent.setup();
    await setup({ mustChooseLocations: true, scheda: 'connessione' });

    await user.click(
      await screen.findByRole('button', { name: /Rileggi le location dal negozio/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Seleziona le sedi da attivare in VestiFlow',
      ),
    );
  });

  // ── La verita' sullo stato dei webhook ──────────────────────────────────────────
  /** Le notifiche stanno in un approfondimento chiuso (docs/29 §3): si apre. */
  /** I fatti delle notifiche sono una sezione sempre visibile (14/09/2026): basta attenderla. */
  async function apriNotifiche() {
    await screen.findByRole('heading', { name: /Notifiche dal negozio/ });
  }

  /** I nomi tecnici e l'indirizzo stanno nel dettaglio richiudibile (14/09/2026): si apre. */
  function apriDettagliTecnici(): void {
    const dettaglio = screen
      .getByText('Dettagli tecnici delle notifiche')
      .closest('details') as HTMLDetailsElement;
    dettaglio.open = true;
  }

  describe('stato delle notifiche', () => {
    function connectionWith(extra: Partial<ShopifyConnection>): ShopifyConnection {
      return { ...CONNECTED, autoSyncEnabled: true, ...extra };
    }

    it('mai verificate: non dice «zero», dice che non lo sappiamo', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ webhookTopicsKnown: false, webhookTopics: [] })),
      );
      await setup();
      await apriNotifiche();

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
      await apriNotifiche();

      // ⭐ L'avviso dice la FUNZIONE in italiano (proprietario, 14/09/2026); il fatto conta;
      //    il nome tecnico del topic sta nel dettaglio richiudibile.
      expect(
        await screen.findByText(
          /Manca una notifica su Shopify: quella per gli annullamenti degli ordini/i,
        ),
      ).toBeVisible();
      expect(screen.getByText('1 su 2 · 1 mancante')).toBeVisible();
      apriDettagliTecnici();
      expect(screen.getByText('orders/cancelled')).toBeVisible();
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
      await apriNotifiche();

      expect(await screen.findByText(/Le notifiche non arrivano a questo ambiente/i)).toBeVisible();
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
      await apriNotifiche();

      // Nessuno dei due nasconde l'altro: un avviso solo, con entrambe le frasi.
      const avviso = await screen.findByRole('alert');
      expect(avviso).toHaveTextContent(/gli eventi vengono consegnati altrove/i);
      expect(avviso).toHaveTextContent(/quella per gli annullamenti degli ordini/i);

      // E il conteggio sta nei fatti sempre visibili; il nome nel dettaglio tecnico.
      expect(screen.getByText('1 su 2 · 1 mancante')).toBeVisible();
      apriDettagliTecnici();
      expect(screen.getByText('orders/cancelled')).toBeVisible();
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
      await apriNotifiche();

      expect(await screen.findByText('7 su 8 · 1 mancante')).toBeVisible();
      // Il nome del mancante non è sparito: sta nel dettaglio tecnico, con la sua pastiglia.
      apriDettagliTecnici();
      expect(screen.getByText('orders/cancelled')).toBeVisible();
      expect(screen.getByText('mancante')).toBeVisible();
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
      await apriNotifiche();

      apriDettagliTecnici();
      expect(await screen.findByText(/confronto non possibile da questo ambiente/i)).toBeVisible();
      expect(screen.queryByText(/Le notifiche non arrivano a questo ambiente/i)).toBeNull();
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
      await apriNotifiche();

      // L'affermazione da verificare e' un'ASSENZA: nessun allarme. Cercare il testo
      // «Aggiornamenti automatici attivi» pescherebbe anche l'avviso sulle giacenze, che
      // parla d'altro — misurare la cosa accanto invece di quella giusta.
      apriDettagliTecnici();
      expect(await screen.findByText('Indirizzo di consegna')).toBeVisible();
      expect(screen.queryByText(/Le notifiche non arrivano a questo ambiente/i)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('la data dell ultimo evento e dichiarativa, senza verdetto', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ lastWebhookEventAt: null })),
      );
      await setup();
      await apriNotifiche();

      expect(await screen.findByText('Nessun evento ricevuto finora')).toBeVisible();
    });

    // ── Il pulsante di riparazione: solo quando ha senso, e solo quando e' sicuro ────
    it('senza verifica non compare: prima si guarda, poi si ripara', async () => {
      connectionService.getConnection.mockReturnValue(
        of(connectionWith({ webhookTopicsKnown: false })),
      );
      await setup();
      await apriNotifiche();

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
      await apriNotifiche();

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
      await apriNotifiche();

      expect(await screen.findByText(/quella per gli annullamenti degli ordini/i)).toBeVisible();
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
      await apriNotifiche();

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
      await apriNotifiche();

      await user.click(await screen.findByRole('button', { name: /Verifica ora/i }));

      // `alert` e non `status`: il ruolo ARIA segue il tono, e una notifica mancante e' un
      // avviso che interrompe la lettura, non un'informazione di servizio.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('orders/cancelled'));
    });
  });

  /**
   * ⛔ **Il messaggio DELL'OPERAZIONE, non un errore qualunque nella pagina.**
   *    Il pannello ha più punti che possono mostrare testo — l'errore di
   *    connessione, il banner dell'azione, gli avvisi di configurazione — e una
   *    prova che cercasse il testo ovunque sarebbe verde anche se l'esito
   *    dell'import comparisse nel posto sbagliato o non comparisse affatto.
   *    Qui si legge il **banner dell'azione**, per classe.
   */
  function messaggioDellAzione(): string {
    const banner = document.querySelector('.inline-banner .inline-banner__text');
    return banner?.textContent?.trim() ?? '';
  }

  it('⛔ import TUTTO FALLITO: il messaggio dell operazione non dice «sincronizzato»', async () => {
    const user = userEvent.setup();
    connectionService.syncProducts.mockReturnValue(
      of({
        synced: true as const,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteProductCount: 2,
        failed: [
          { shopifyProductId: '1', message: 'canale non raggiungibile' },
          { shopifyProductId: '2', message: 'canale non raggiungibile' },
        ],
      }),
    );
    await setup({ scheda: 'operazioni' });

    await user.click(await screen.findByRole('button', { name: /Importa catalogo/i }));

    await waitFor(() => expect(messaggioDellAzione()).toContain('Import non riuscito'));
    expect(messaggioDellAzione()).not.toContain('sincronizzato');
  });

  it('⭐ import con SALTATI: il messaggio li nomina e non li chiama errori', async () => {
    const user = userEvent.setup();
    connectionService.syncProducts.mockReturnValue(
      of({
        synced: true as const,
        imported: 2,
        updated: 0,
        skipped: 3,
        remoteProductCount: 5,
        failed: [],
      }),
    );
    await setup({ scheda: 'operazioni' });

    await user.click(await screen.findByRole('button', { name: /Importa catalogo/i }));

    await waitFor(() => expect(messaggioDellAzione()).toContain('3 prodotti sono stati saltati'));
    // ⚠️ L'asserzione è sul modo in cui i saltati sono PRESENTATI, non sulla
    //    parola: il messaggio dice «non sono errori», quindi cercare la
    //    sottostringa «errori» lo boccerebbe per la ragione opposta a quella
    //    voluta. Ciò che non deve comparire è il vocabolario del fallimento.
    expect(messaggioDellAzione()).toContain('non sono errori');
    expect(messaggioDellAzione()).not.toContain('falliti');
    expect(messaggioDellAzione()).not.toContain('con 3 errori');
  });

  it('un errore di sync resta a schermo: non e’ un avviso che scade', async () => {
    const user = userEvent.setup();
    connectionService.syncProducts.mockReturnValue(
      throwError(() => ({ kind: 'server', message: 'Shopify non risponde.' })),
    );
    await setup({ scheda: 'operazioni' });

    await user.click(await screen.findByRole('button', { name: /Importa catalogo/i }));

    // In cima alla scheda come errore, e sulla riga come ultimo esito «non riuscita».
    const errori = await screen.findAllByText('Shopify non risponde.');
    expect(errori.length).toBeGreaterThan(0);
    expect(errori[0]).toBeVisible();
    expect(screen.getByRole('listitem', { name: 'Importa catalogo' })).toHaveTextContent(
      'non riuscita',
    );
  });

  /**
   * ALLINEA GIACENZE — il comportamento del pannello.
   *
   * ⭐ Il servizio incatena i blocchi; qui si misura che cosa VEDE chi preme:
   *    un gesto solo, l'avanzamento senza numeri inventati, e la differenza fra
   *    un controllo concluso e uno interrotto.
   */
  describe('Allinea giacenze', () => {
    function avanzamento(sovrascrivi: Partial<Record<string, unknown>> = {}) {
      return {
        totale: 300,
        esaminate: 200,
        allineate: 3,
        giaAllineate: 197,
        nonAllineate: [],
        completo: false,
        ...sovrascrivi,
      };
    }

    function nonAllineata(indice: number, motivo = 'livello_non_disponibile') {
      return {
        variantId: `var-${indice}`,
        locationId: 'loc-1',
        articolo: `Articolo ${indice}`,
        codiceArticolo: `ART-${indice}`,
        variante: 'M · Rosso',
        sku: `SKU-${indice}`,
        sede: 'Magazzino 1',
        motivo,
        dettaglio: 'una frase lunga',
      };
    }

    const pulsante = () => screen.getByRole('button', { name: /Allinea giacenze su Shopify/i });

    it('⭐ una pressione sola: il servizio si chiama una volta e i blocchi li incatena lui', async () => {
      connectionService.allineaDisponibilita.mockReturnValue(
        of(avanzamento({ esaminate: 300, completo: true })),
      );
      const { setupService } = await setup({ scheda: 'operazioni' });
      const lettureIniziali = setupService.stato.mock.calls.length;

      await userEvent.click(pulsante());

      // ⭐ Una chiamata: chi preme non preme una seconda volta per proseguire.
      expect(connectionService.allineaDisponibilita).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(/Controllo completato/)).toBeVisible();
      // ⭐ A controllo concluso la SITUAZIONE si rilegge: le coppie che hanno preso
      //    la base escono dai problemi subito (collaudo del 13/09/2026: 82 → 7 sul
      //    server, «82» a schermo finché non si ricaricava la pagina).
      expect(setupService.stato.mock.calls.length).toBe(lettureIniziali + 1);
      // ⭐ Il riepilogo finale: allineate, gia' corrette, non allineate.
      expect(screen.getByText('Allineate', { selector: 'dt' })).toBeVisible();
      expect(screen.getByText('Già corrette')).toBeVisible();
      expect(screen.getByText('Non allineate')).toBeVisible();
    });

    it('⭐ l avanzamento conta le COPPIE esaminate, e non inventa percentuali', async () => {
      const blocchi = new Subject<unknown>();
      connectionService.allineaDisponibilita.mockReturnValue(blocchi.asObservable());
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());
      blocchi.next(avanzamento({ esaminate: 200 }));

      const stato = await screen.findByText(/Controllo in corso/);
      expect(stato.textContent).toContain('200');
      expect(stato.textContent).toContain('300');
      // ⛔ Nessuna percentuale: sarebbe un numero che nessuno ha misurato.
      expect(stato.textContent).not.toContain('%');
      blocchi.complete();
    });

    it('⛔ durante l operazione il pulsante e SPENTO', async () => {
      const blocchi = new Subject<unknown>();
      connectionService.allineaDisponibilita.mockReturnValue(blocchi.asObservable());
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());
      blocchi.next(avanzamento());

      await waitFor(() => expect(pulsante()).toBeDisabled());

      blocchi.next(avanzamento({ esaminate: 300, completo: true }));
      blocchi.complete();
      await waitFor(() => expect(pulsante()).toBeEnabled());
    });

    it('⛔ se il controllo si INTERROMPE, non si dichiara completato', async () => {
      const blocchi = new Subject<unknown>();
      connectionService.allineaDisponibilita.mockReturnValue(blocchi.asObservable());
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());
      blocchi.next(avanzamento({ nonAllineate: [nonAllineata(1)] }));
      blocchi.error(new Error('rete caduta'));

      // ⛔ **«Controllo incompleto», e l'elenco e' dichiarato parziale.**
      expect(await screen.findByText(/Controllo incompleto/)).toBeVisible();
      expect(screen.getByText(/parziale/)).toBeVisible();
      expect(screen.queryByText(/Controllo completato/)).toBeNull();
      // ⭐ E quello che si era gia' raccolto NON sparisce.
      // ⚠️ **Due volte nel DOM, e non è un difetto** (`docs/26` A3): il motore
      //    rende la riga di tabella E la card, e sotto `lg` ne nasconde una. La
      //    card porta `aria-hidden`, quindi ai lettori di schermo il dato resta uno.
      expect(screen.getAllByText('Articolo 1').length).toBeGreaterThan(0);
    });

    it('⭐ l elenco porta TUTTE le anomalie, senza paginazione', async () => {
      const righe = Array.from({ length: 25 }, (_, i) => nonAllineata(i + 1));
      connectionService.allineaDisponibilita.mockReturnValue(
        of(avanzamento({ esaminate: 300, completo: true, nonAllineate: righe })),
      );
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());

      // ⭐ **Tutte e venticinque, insieme**: un elenco di anomalie che ne
      //    mostra una parte non e' verificabile, ed e' per guardarle insieme
      //    che esiste. A contenere l'ingombro pensa il riquadro, che scorre.
      expect((await screen.findAllByText('Articolo 1')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Articolo 20').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Articolo 25').length).toBeGreaterThan(0);
      // ⭐ E le venticinque sono RIGHE della tabella, non un testo qualunque.
      expect(
        screen.getAllByRole('row').filter((r) => r.classList.contains('data-table__row')),
      ).toHaveLength(25);
      expect(screen.getByText('25')).toBeVisible();
      // ⛔ E nessun comando di impaginazione: non c'e' niente da sfogliare.
      expect(screen.queryByRole('button', { name: /Successiva/i })).toBeNull();
    });

    it('⭐ ogni riga porta articolo, variante, sede e MOTIVO', async () => {
      connectionService.allineaDisponibilita.mockReturnValue(
        of(
          avanzamento({
            esaminate: 300,
            completo: true,
            nonAllineate: [nonAllineata(7, 'scrittura_esito_incerto')],
          }),
        ),
      );
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());

      expect((await screen.findAllByText('Articolo 7')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('M · Rosso').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Magazzino 1').length).toBeGreaterThan(0);
      // ⛔ «Scrittura con esito incerto» NON e' «errore di lettura»: sono due
      //    voci diverse, e chi legge deve poterle distinguere.
      expect(screen.getAllByText('Scrittura con esito incerto').length).toBeGreaterThan(0);
      // ⭐ E il dettaglio, che stava nel `title`, ora è una colonna leggibile.
      expect(screen.getAllByText('una frase lunga').length).toBeGreaterThan(0);
      // ⭐ Intestazioni del motore: Sede e Motivo sono colonne, quindi filtrabili.
      expect(screen.getByRole('columnheader', { name: /Sede/ })).toBeVisible();
      expect(screen.getByRole('columnheader', { name: /Motivo/ })).toBeVisible();
    });

    it('⭐ un clic NUOVO avvia un controllo nuovo, e riparte dal principio', async () => {
      connectionService.allineaDisponibilita.mockReturnValue(
        of(avanzamento({ esaminate: 300, completo: true, nonAllineate: [nonAllineata(1)] })),
      );
      await setup({ scheda: 'operazioni' });

      await userEvent.click(pulsante());
      expect((await screen.findAllByText('Articolo 1')).length).toBeGreaterThan(0);

      connectionService.allineaDisponibilita.mockReturnValue(
        of(avanzamento({ esaminate: 300, completo: true, nonAllineate: [] })),
      );
      await userEvent.click(pulsante());

      // ⭐ Il controllo e' NUOVO: l'elenco di prima non sopravvive.
      await waitFor(() => expect(screen.queryByText('Articolo 1')).toBeNull());
      expect(connectionService.allineaDisponibilita).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * ⭐ La PRIMA CONNESSIONE (`docs/27`): finché il percorso c’è e non è attivato, la
   *    sezione Sincronizzazione non compare — niente parte da un pulsante che
   *    scavalca le tre fasi. Senza percorso (connessione nata prima) tutto resta
   *    com’era.
   */
  describe('prima connessione', () => {
    const PERCORSO_IN_CORSO: ShopifySetupDto = {
      presente: true,
      status: 'sedi',
      direction: 'shopify_to_vestiflow',
      locations: [
        {
          shopifyLocationId: '11',
          name: 'Negozio centro',
          active: true,
          choice: null,
          locationId: null,
          locationName: null,
        },
      ],
      sediVestiFlow: [{ id: 'loc-1', name: 'Sede 1', code: 'S1', shopifyLocationId: null }],
      anteprima: null,
      esito: null,
      confirmedAt: null,
      activatedAt: null,
      blocchiAttivazione: [],
      irrisolti: [],
      trasferimentoInCorso: false,
      situazione: { calcolataAt: '2026-09-13T01:00:00.000Z', problemi: [] },
    };

    it('con un percorso non attivato si apre «Prima connessione» con le tre fasi; le operazioni sono chiuse; i rimedi stanno nella loro scheda', async () => {
      const { setupService } = await setup({}, TITOLARE, PERCORSO_IN_CORSO);

      expect(await screen.findByRole('heading', { name: 'Prima connessione' })).toBeVisible();
      expect(screen.getByRole('heading', { name: /1 · Scelte iniziali/ })).toBeVisible();
      expect(screen.getByRole('heading', { name: /2 · Sedi/ })).toBeVisible();
      expect(screen.getByRole('heading', { name: /3 · Controllo e conferma/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Importa catalogo/ })).toBeNull();
      // ⭐ Le fasi sono TRE, e la riga di stato lo dice così.
      expect(screen.getByText('fase 2 di 3 · Sedi')).toBeVisible();
      const schede = screen.getByRole('navigation', { name: 'Aree di Shopify' });
      expect(
        within(schede).getByRole('link', { name: 'Prima connessione in corso' }),
      ).toBeVisible();
      // Letto UNA volta a negozio collegato: è l’API a dire se il percorso esiste.
      expect(setupService.stato).toHaveBeenCalledTimes(1);
    });

    it('con un percorso non attivato la scheda Operazioni lo dice, e Connessione e sedi offre i rimedi', async () => {
      await setup({ scheda: 'operazioni' }, TITOLARE, PERCORSO_IN_CORSO);
      expect(await screen.findByText(/Si sbloccano con l'attivazione/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Allinea giacenze/ })).toBeNull();
    });

    it('con un percorso non attivato i rimedi per connessione e permessi restano raggiungibili', async () => {
      await setup({ scheda: 'connessione' }, TITOLARE, PERCORSO_IN_CORSO);
      expect(await screen.findByRole('heading', { name: 'Negozio' })).toBeVisible();
      expect(screen.getByRole('heading', { name: /Permessi su Shopify/ })).toBeVisible();
      expect(screen.getByRole('button', { name: /Disconnetti Shopify/ })).toBeVisible();
      // Le scelte sulle sedi stanno nella fase 2: qui si rimanda.
      expect(screen.getByText(/Le scelte sulle sedi si fanno nella fase 2/)).toBeVisible();
    });

    /**
     * ⭐ Gli aggiornamenti automatici dicono il LORO stato per flusso, con il perché e il
     *    rimando ai problemi; «Allinea» si ESEGUE in un posto solo, la riga di
     *    «Operazioni manuali»: i rimandi vanno là, non allineano (proprietario, 13/09/2026).
     */
    it('flussi automatici: le quantità sono «limitate» dai problemi, e il rimando NON esegue', async () => {
      const utente = userEvent.setup();
      const problema = (sovrascrivi: Record<string, unknown>) => ({
        tipo: 'coppia' as const,
        causa: 'coppia_lettura_fallita' as const,
        riferimento: 'v1:l1',
        nome: 'Articolo A',
        dettaglio: null,
        sede: 'Sede 1',
        conseguenza: 'Base non stabilita.',
        azione: {
          tipo: 'allinea' as const,
          etichetta: '«Allinea giacenze su Shopify» dopo aver risolto gli ordini senza sede',
          riferimento: null,
        },
        apri: null,
        rilevatoAt: null,
        ...sovrascrivi,
      });
      const conProblemi: ShopifySetupDto = {
        ...PERCORSO_ASSENTE,
        situazione: {
          calcolataAt: '2026-09-13T09:42:00.000Z',
          problemi: [
            problema({
              tipo: 'ordine',
              causa: 'ordine_location_non_collegata',
              riferimento: 'o1',
              nome: '#1010',
              sede: null,
              conseguenza: 'Nessun impegno per le sue righe.',
              azione: {
                tipo: 'sedi',
                etichetta: 'Collega la location Shopify assegnata a una sede VestiFlow, in Sedi',
                riferimento: 'gid://shopify/Location/9',
              },
              apri: { tipo: 'apri_ordine', etichetta: 'Apri l’ordine', riferimento: 'o1' },
            }),
            problema({ riferimento: 'v1:l1', nome: 'Articolo A' }),
            problema({ riferimento: 'v2:l1', nome: 'Articolo B' }),
            problema({
              causa: 'coppia_non_stoccata',
              riferimento: 'v3:l1',
              nome: 'Cintura',
              azione: {
                tipo: 'shopify',
                etichetta:
                  'Su Shopify: stocca l’articolo nella location; poi «Allinea giacenze» qui',
                riferimento: null,
              },
            }),
          ],
        },
      };
      connectionService.getConnection.mockReturnValue(
        of({ ...CONNECTED, autoSyncEnabled: true, webhookTopicsKnown: false, webhookTopics: [] }),
      );
      await setup({}, TITOLARE, conProblemi);

      // La scheda dice quanti problemi ci sono (pastiglia), e quella della sincronizzazione
      // che gli aggiornamenti sono LIMITATI: «attiva» non nasconde le limitazioni.
      const schede = screen.getByRole('navigation', { name: 'Aree di Shopify' });
      expect(within(schede).getByRole('link', { name: 'Problemi ed esiti 4' })).toBeVisible();
      expect(
        within(schede).getByRole('link', { name: 'Sincronizzazione automatica limitata' }),
      ).toBeVisible();
      // Quantità: limitata, col perché (l'ordine senza sede) e il rimando ai problemi.
      const flussi = screen.getAllByRole('listitem');
      const quantita = flussi.find((f) => f.textContent?.includes('Quantità'))!;
      expect(quantita).toHaveTextContent('limitato');
      expect(quantita).toHaveTextContent(
        "l'invio delle quantità è sospeso: 1 ordine aperto senza sede",
      );
      const ordini = flussi.find((f) => f.textContent?.startsWith('Ordini'))!;
      expect(ordini).toHaveTextContent('1 ordine aperto senza sede');
      await utente.click(within(quantita).getByRole('button', { name: 'Vedi i problemi ›' }));
      expect(connectionService.allineaDisponibilita).not.toHaveBeenCalled();
    });

    it('problemi: il rimando di un gruppo porta alle operazioni e NON allinea; «su Shopify» non è «nessuna azione»', async () => {
      const utente = userEvent.setup();
      const scorri = vi.fn();
      Element.prototype.scrollIntoView = scorri;
      const conProblemi: ShopifySetupDto = {
        ...PERCORSO_ASSENTE,
        situazione: {
          calcolataAt: '2026-09-13T09:42:00.000Z',
          problemi: [
            {
              tipo: 'coppia',
              causa: 'coppia_lettura_fallita',
              riferimento: 'v1:l1',
              nome: 'Articolo A',
              dettaglio: null,
              sede: 'Sede 1',
              conseguenza: 'Base non stabilita.',
              azione: {
                tipo: 'allinea',
                etichetta: '«Allinea giacenze su Shopify» dopo aver risolto gli ordini senza sede',
                riferimento: null,
              },
              apri: null,
              rilevatoAt: null,
            },
            {
              tipo: 'coppia',
              causa: 'coppia_non_stoccata',
              riferimento: 'v3:l1',
              nome: 'Cintura',
              dettaglio: null,
              sede: 'Sede 1',
              conseguenza: 'Su Shopify l’articolo non è stoccato in questa location.',
              azione: {
                tipo: 'shopify',
                etichetta:
                  'Su Shopify: stocca l’articolo nella location; poi «Allinea giacenze» qui',
                riferimento: null,
              },
              apri: null,
              rilevatoAt: null,
            },
          ],
        },
      };
      await setup({ scheda: 'problemi' }, TITOLARE, conProblemi);

      const problemi = await screen.findByRole('region', { name: /Problemi aperti/ });
      await utente.click(
        within(problemi).getAllByRole('button', {
          name: /Vai ad Allinea giacenze/,
        })[0]!,
      );
      expect(connectionService.allineaDisponibilita).not.toHaveBeenCalled();
      // «Da fare su Shopify» resta un problema aperto, distinto da «nessuna azione».
      expect(
        within(problemi).getAllByText('Su Shopify', { selector: '.problemi__dove' }).length,
      ).toBeGreaterThan(0);
      expect(within(problemi).queryByText('Nessuna azione')).toBeNull();
    });

    /**
     * ⛔ Misurato sul negozio vero il 13/09/2026: l'attivazione durava 24 s, il
     *    client rinunciava a 15 e scriveva «Operazione non riuscita» mentre il
     *    server aveva finito. Un timeout NON è un fallimento: si rilegge lo
     *    stato dal server finché non dice «attivato», senza invitare a ripetere.
     */
    it('attivazione oltre il timeout: nessun «non riuscita», si rilegge lo stato dal server fino ad «attivato»', async () => {
      const utente = userEvent.setup();
      const trasferito: ShopifySetupDto = {
        ...PERCORSO_IN_CORSO,
        status: 'trasferito',
        direction: 'shopify_to_vestiflow',
        confirmedAt: '2026-09-12T10:00:00.000Z',
        esito: {
          fase: 'concluso',
          startedAt: '2026-09-12T10:00:00.000Z',
          finishedAt: '2026-09-12T10:01:00.000Z',
          interruzione: null,
          catalogo: { imported: 1, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 0 },
          quantita: { coppie: 1, scritte: 1, invariate: 0, giaScritte: 0, nonDeterminabili: 0 },
          allinea: null,
          esclusi: [],
        },
      };
      const attivato: ShopifySetupDto = {
        ...trasferito,
        status: 'attivato',
        activatedAt: '2026-09-12T10:02:00.000Z',
      };
      const { setupService } = await setup({}, TITOLARE, trasferito);
      // Il comando scade; la rilettura successiva trova il percorso già attivato.
      (setupService as { attiva?: unknown }).attiva = vi
        .fn()
        .mockReturnValue(throwError(() => new TimeoutError()));
      setupService.stato.mockReturnValue(of(attivato));

      await utente.click(await screen.findByRole('button', { name: 'Attiva la sincronizzazione' }));

      expect(screen.queryByText(/Operazione non riuscita/)).toBeNull();
      // Attivata: la scheda lo dice, e si apre la sincronizzazione automatica.
      const schede = await screen.findByRole('navigation', { name: 'Aree di Shopify' });
      expect(
        await within(schede).findByRole('link', { name: 'Prima connessione conclusa' }),
      ).toBeVisible();
      expect(screen.queryByText(/rileggo lo stato/)).toBeNull();
    });

    it('senza percorso (connessione nata prima) le operazioni restano com’erano', async () => {
      await setup({ scheda: 'operazioni' });
      expect(
        await screen.findByRole('heading', { name: /Operazioni avviate manualmente/ }),
      ).toBeVisible();
    });

    it('senza percorso la scheda Prima connessione lo dice, senza fingere uno storico', async () => {
      await setup({ scheda: 'prima-connessione' });
      expect(await screen.findByText(/nata prima del percorso guidato/)).toBeVisible();
    });

    /**
     * ⭐ Le scelte sulle sedi FUORI dal percorso (12/09/2026): per una connessione
     *    nata prima — o dopo Disconnetti e riconnessione — la sezione Sedi offre
     *    collega / crea / lascia con lo stesso componente della fase 2, e il
     *    comando è quello dell’API del percorso. Mentre il percorso è in corso
     *    la scelta sta nella sua fase 2, non due volte.
     */
    it('senza percorso la sezione Sedi offre le scelte per location, e la scelta va all’API', async () => {
      const utente = userEvent.setup();
      const percorso: ShopifySetupDto = {
        ...PERCORSO_ASSENTE,
        locations: PERCORSO_IN_CORSO.locations,
        sediVestiFlow: PERCORSO_IN_CORSO.sediVestiFlow,
      };
      const { setupService, locationsChanged } = await setup(
        { scheda: 'connessione' },
        TITOLARE,
        percorso,
      );
      const scegliSede = vi.fn().mockReturnValue(of(percorso));
      (setupService as { scegliSede?: unknown }).scegliSede = scegliSede;

      expect(await screen.findByRole('heading', { name: /^Sedi/ })).toBeVisible();
      await utente.click(
        await screen.findByRole('button', { name: /Scelta per la location Negozio centro/ }),
      );
      await utente.click(screen.getByRole('option', { name: 'Collega alla sede «Sede 1»' }));
      expect(scegliSede).toHaveBeenCalledWith('11', { choice: 'collega', locationId: 'loc-1' });
      // La scelta cambia le sedi della pagina: chi ospita il pannello le rilegge
      // (lo stato «Sedi collegate» sopra la tabella viene da lì).
      await waitFor(() => expect(locationsChanged).toHaveBeenCalled());
    });

    it('con il percorso in corso le scelte stanno nella fase 2, non nella sezione Sedi', async () => {
      await setup({}, TITOLARE, PERCORSO_IN_CORSO);

      expect(await screen.findByRole('heading', { name: /2 · Sedi/ })).toBeVisible();
      expect(screen.getAllByRole('button', { name: /Scelta per la location/ })).toHaveLength(1);
    });

    it('con il percorso ATTIVATO e le sedi decise si apre la sincronizzazione; le operazioni tornano; la prima connessione resta consultabile, non sbiadita', async () => {
      const attivato: ShopifySetupDto = {
        ...PERCORSO_IN_CORSO,
        status: 'attivato',
        activatedAt: '2026-09-12T10:00:00.000Z',
        locations: [
          {
            ...PERCORSO_IN_CORSO.locations[0]!,
            choice: 'collega',
            locationId: 'loc-1',
            locationName: 'Sede 1',
          },
        ],
      };
      await setup({}, TITOLARE, attivato);
      expect(
        await screen.findByRole('heading', {
          name: /Aggiornamenti automatici tra Shopify e VestiFlow/,
        }),
      ).toBeVisible();
      const schede = screen.getByRole('navigation', { name: 'Aree di Shopify' });
      expect(
        within(schede).getByRole('link', { name: 'Prima connessione conclusa' }),
      ).toBeVisible();
    });

    /**
     * ⭐ La scheda che si apre segue lo STATO (14/09/2026, `docs/29` §6): con una
     *    location del negozio che attende una scelta — una aggiunta su Shopify
     *    dopo l'attivazione, o le sedi da riscegliere dopo una riconnessione — si
     *    apre «Connessione e sedi», con il conteggio. ⛔ Una location lasciata
     *    fuori APPOSTA non conta come «da decidere» (precisazione del proprietario).
     */
    it('con una location che attende una scelta si apre Connessione e sedi, col conteggio; una lasciata fuori non è «da decidere»', async () => {
      const attivato: ShopifySetupDto = {
        ...PERCORSO_IN_CORSO,
        status: 'attivato',
        activatedAt: '2026-09-12T10:00:00.000Z',
        locations: [
          PERCORSO_IN_CORSO.locations[0]!,
          {
            shopifyLocationId: '33',
            name: 'Deposito',
            active: true,
            choice: 'lascia',
            locationId: null,
            locationName: null,
          },
        ],
      };
      await setup({}, TITOLARE, attivato);
      expect(await screen.findByRole('heading', { name: /^Sedi/ })).toBeVisible();
      expect(screen.getByText('1 da decidere')).toBeVisible();
      expect(screen.getByText('1 lasciata fuori')).toBeVisible();
      // La spiegazione della «lasciata fuori» sta nel «?» accanto al badge (14/09/2026).
      expect(
        screen.getByRole('button', { name: 'Che cosa vuol dire lasciata fuori' }),
      ).toHaveAccessibleDescription(/per scelta: non è da configurare/);
      expect(
        screen.queryByRole('heading', { name: /Aggiornamenti automatici tra Shopify e VestiFlow/ }),
      ).toBeNull();
    });

    it('con la sola location lasciata fuori apposta si apre la sincronizzazione: niente da decidere', async () => {
      const attivato: ShopifySetupDto = {
        ...PERCORSO_IN_CORSO,
        status: 'attivato',
        activatedAt: '2026-09-12T10:00:00.000Z',
        locations: [{ ...PERCORSO_IN_CORSO.locations[0]!, choice: 'lascia' }],
      };
      await setup({}, TITOLARE, attivato);
      expect(
        await screen.findByRole('heading', {
          name: /Aggiornamenti automatici tra Shopify e VestiFlow/,
        }),
      ).toBeVisible();
    });

    it('con il percorso ATTIVATO la scheda Prima connessione mostra le tre fasi com’erano, coi comandi spenti e il motivo', async () => {
      await setup({ scheda: 'prima-connessione' }, TITOLARE, {
        ...PERCORSO_IN_CORSO,
        status: 'attivato',
        activatedAt: '2026-09-12T10:00:00.000Z',
      });
      expect(await screen.findByText(/conclusa il/)).toBeVisible();
      expect(screen.getByRole('heading', { name: /1 · Scelte iniziali/ })).toBeVisible();
      expect(screen.getByRole('heading', { name: /2 · Sedi/ })).toBeVisible();
      expect(screen.getByRole('heading', { name: /3 · Controllo e conferma/ })).toBeVisible();
      // ⭐ A percorso concluso la scelta si legge nel titolo: niente pulsanti di direzione,
      //    la spiegazione della SOLA direzione scelta sta in un dettaglio richiudibile
      //    (proprietario, 13/09/2026: «tenere visibili scelta, sedi ed esito»).
      expect(screen.queryByRole('button', { name: 'Shopify → VestiFlow' })).toBeNull();
      // Lo stepper: la scelta sulla riga della fase, i quattro fatti in testa.
      expect(screen.getAllByText('Shopify → VestiFlow').length).toBeGreaterThan(0);
      expect(screen.getByText('Direzione iniziale')).toBeVisible();
      expect(screen.getByText(/Che cosa ha fatto «Shopify → VestiFlow»/)).toBeVisible();
      expect(screen.getByText(/Ha importato il catalogo del negozio/)).toBeInTheDocument();
      expect(screen.queryByText(/Pubblica gli articoli del gestionale/)).toBeNull();
      // ⛔ A percorso concluso NESSUN comando: niente «Attiva la sincronizzazione» spento
      //    (proprietario, 14/09/2026: conclusa, non da rifare).
      expect(screen.queryByRole('button', { name: 'Attiva la sincronizzazione' })).toBeNull();
      expect(screen.getByText(/non si cambia da qui/)).toBeInTheDocument();
      // Le sedi di allora si leggono qui; quelle di oggi nell'altra scheda.
      expect(screen.getByRole('button', { name: 'Le fasi concluse' })).toHaveAccessibleDescription(
        /le sedi di oggi si consultano e si cambiano/,
      );
    });

    it('con il percorso ATTIVATO le scelte sulle sedi tornano in Connessione e sedi, una volta sola', async () => {
      await setup({ scheda: 'connessione' }, TITOLARE, {
        ...PERCORSO_IN_CORSO,
        status: 'attivato',
        activatedAt: '2026-09-12T10:00:00.000Z',
      });
      expect(await screen.findByRole('heading', { name: /^Sedi/ })).toBeVisible();
      expect(screen.getAllByRole('button', { name: /Scelta per la location/ })).toHaveLength(1);
    });
  });

  /**
   * ⭐ La leggibilità della pagina (14/09/2026, `docs/29` §6): il ritorno da
   *    Shopify dice lo stato VERO e i quattro rifiuti dell'OAuth hanno un testo;
   *    il comando che azzera gli errori dice che cosa fa davvero.
   */
  describe('ritorno da Shopify e comandi che dicono il vero', () => {
    /** Il banner dell'esito OAuth, con il suo tono (la classe del banner condiviso). */
    function bannerEsito(): { testo: string; tono: string } {
      const banner = document.querySelector('.inline-banner');
      const tono = [...(banner?.classList ?? [])]
        .find((c) => c.startsWith('inline-banner--'))
        ?.replace('inline-banner--', '');
      return {
        testo:
          banner?.querySelector('.inline-banner__text')?.textContent?.replace(/\s+/g, ' ').trim() ??
          '',
        tono: tono ?? '',
      };
    }

    async function ritorno(
      query: string,
      utente: object = TITOLARE,
      percorso: ShopifySetupDto = PERCORSO_ASSENTE,
      scheda: string | null = null,
    ) {
      const setupService = { stato: vi.fn().mockReturnValue(of(percorso)) };
      const { fixture } = await render(ShopifyIntegrationPanelComponent, {
        inputs: { locationSetupStatus: LOCATION_SETUP, scheda },
        initialRoute: `/app/settings/shopify?${query}`,
        providers: [
          provideRouter([{ path: '**', children: [] }]),
          COLONNE_FINTE,
          { provide: ShopifyConnectionService, useValue: connectionService },
          { provide: ShopifySetupService, useValue: setupService },
          { provide: AuthService, useValue: { currentUser: () => utente } },
        ],
      });
      return { router: fixture.debugElement.injector.get(Router) };
    }

    it('il negozio già di un’altra azienda: il testo lo dice col dominio, nulla è stato scritto, l’indirizzo si pulisce', async () => {
      const { router } = await ritorno('shopify=shop_owned_elsewhere&shop=altro.myshopify.com');
      await waitFor(() =>
        expect(bannerEsito().testo).toBe(
          'Collegamento rifiutato: il negozio altro.myshopify.com è già collegato a un’altra azienda e non può appartenere a due. Nulla è stato scritto.',
        ),
      );
      expect(bannerEsito().tono).toBe('error');
      await waitFor(() => expect(router.url).not.toMatch(/shopify=|shop=/));
      expect(connectionService.getConnection).toHaveBeenCalled();
    });

    it('il canale non previsto dal profilo: errore, con dove si abilita', async () => {
      await ritorno('shopify=channel_not_enabled&shop=demo.myshopify.com');
      await waitFor(() => expect(bannerEsito().testo).toMatch(/non prevede il canale Shopify/));
      expect(bannerEsito().testo).toMatch(/Nulla è stato scritto/);
      expect(bannerEsito().tono).toBe('error');
    });

    it('identità del negozio non ricevuta e collegamento concorrente: avvisi da ritentare', async () => {
      await ritorno('shopify=shop_identity_unavailable&shop=demo.myshopify.com');
      await waitFor(() =>
        expect(bannerEsito().testo).toMatch(
          /Shopify non ha risposto sull’identità del negozio demo\.myshopify\.com/,
        ),
      );
      expect(bannerEsito().testo).toMatch(/ripeti «Connetti Shopify»/);
      expect(bannerEsito().tono).toBe('warning');
    });

    it('collegamento concorrente: avviso da ritentare', async () => {
      await ritorno('shopify=connection_conflict');
      await waitFor(() =>
        expect(bannerEsito().testo).toMatch(
          /un altro collegamento dello stesso negozio era in corso/,
        ),
      );
      expect(bannerEsito().tono).toBe('warning');
    });

    it('collegato con gli aggiornamenti ATTIVI e una location da decidere: il banner dice questo, non «quando attivi»', async () => {
      connectionService.getConnection.mockReturnValue(of({ ...CONNECTED, autoSyncEnabled: true }));
      await ritorno('shopify=connected', TITOLARE, {
        ...PERCORSO_ASSENTE,
        locations: [
          {
            shopifyLocationId: '11',
            name: 'Negozio centro',
            active: true,
            choice: null,
            locationId: null,
            locationName: null,
          },
        ],
        sediVestiFlow: [{ id: 'loc-1', name: 'Sede 1', code: 'S1', shopifyLocationId: null }],
      });
      await waitFor(() =>
        expect(bannerEsito().testo).toBe(
          'Negozio collegato. Aggiornamenti automatici attivi. 1 location del negozio attende una scelta, nella tabella «Sedi».',
        ),
      );
      expect(bannerEsito().tono).toBe('success');
      expect(screen.queryByText(/quando attivi gli aggiornamenti automatici/)).toBeNull();
    });

    it('collegato con gli aggiornamenti SOSPESI: lo dice, e dice dove si riattivano', async () => {
      await ritorno('shopify=connected');
      await waitFor(() =>
        expect(bannerEsito().testo).toBe(
          'Negozio collegato. Aggiornamenti automatici sospesi: si riattivano in «Sincronizzazione automatica».',
        ),
      );
    });

    it('collegato con un avviso sulle notifiche: il testo dell’avviso e il rimando alla Sincronizzazione, dove sta la causa', async () => {
      const user = userEvent.setup();
      connectionService.getConnection.mockReturnValue(
        of({
          ...CONNECTED,
          autoSyncEnabled: true,
          lastError: {
            message: 'Registrazione delle notifiche non riuscita',
            code: 'webhook_registration_failed',
            occurredAt: '2026-09-14T10:00:00.000Z',
          },
          webhookTopicsKnown: true,
          webhookTopics: ['orders/create'],
          webhookMissingTopics: ['orders/cancelled'],
        }),
      );
      await ritorno('shopify=connected');
      await waitFor(() =>
        expect(bannerEsito().testo).toMatch(
          /Con un avviso: Registrazione delle notifiche non riuscita/,
        ),
      );
      expect(bannerEsito().tono).toBe('warning');
      expect(screen.queryByText('Vedi problemi')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Vedi le notifiche' }));
      expect(
        await screen.findByRole('heading', {
          name: /Aggiornamenti automatici tra Shopify e VestiFlow/,
        }),
      ).toBeVisible();
    });

    it('collegato con un avviso che non riguarda le notifiche: il rimando va ai Problemi', async () => {
      connectionService.getConnection.mockReturnValue(
        of({
          ...CONNECTED,
          autoSyncEnabled: true,
          lastError: {
            message: 'Permesso mancante',
            code: 'scope_missing',
            occurredAt: '2026-09-14T10:00:00.000Z',
          },
        }),
      );
      await ritorno('shopify=connected');
      await waitFor(() => expect(bannerEsito().testo).toMatch(/Con un avviso: Permesso mancante/));
      expect(screen.getByRole('button', { name: 'Vedi i problemi' })).toBeVisible();
    });

    /**
     * ⛔ Qui il comando si chiamava «Ripristina connessione» e l'esito diceva
     *    «Connessione Shopify ripristinata, N prodotti ripristinati». Verificato
     *    sull'API: azzera gli errori salvati e rimette «da allineare» prodotti e
     *    sedi in errore, che vengono ritentati; non corregge nessuna causa. Non è
     *    «segna come letto» — cambia lo stato del prossimo invio — e il testo lo
     *    dice prima e dopo (mandato del 14/09/2026).
     */
    it('«Azzera le segnalazioni di errore» dice i suoi effetti prima e dopo, senza «ripristinato»', async () => {
      const user = userEvent.setup();
      connectionService.getConnection.mockReturnValue(
        of({
          ...CONNECTED,
          lastError: {
            message: 'Permesso mancante',
            code: 'scope_missing',
            occurredAt: '2026-09-14T10:00:00.000Z',
          },
        }),
      );
      connectionService.clearErrors.mockReturnValue(
        of({ cleared: true as const, productsReset: 2, locationsReset: 1 }),
      );
      await setup({ scheda: 'connessione' });

      expect(screen.queryByRole('button', { name: /Ripristina connessione/ })).toBeNull();
      const comando = await screen.findByRole('button', {
        name: 'Azzera le segnalazioni di errore',
      });
      expect(
        screen.getByText(/riporta «da allineare» i prodotti e le sedi in errore/),
      ).toBeVisible();
      expect(screen.getByText(/Non corregge la causa/)).toBeVisible();

      await user.click(comando);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          'Segnalazioni di errore azzerate. 2 prodotti e 1 sede tornano «da allineare»: verranno ritentati al prossimo invio. Le cause non sono state corrette: se il problema c’è ancora, la segnalazione ricompare.',
        ),
      );
      expect(screen.getByRole('status')).not.toHaveTextContent(/ripristinat/);
    });

    /**
     * ⭐ Il mandato del 14/09/2026: il comando «non deve far apparire risolto un
     *    problema ancora presente». Azzerate le segnalazioni, le notifiche mancanti
     *    ci sono ancora — e il banner, che legge lo stato di ADESSO, continua a
     *    dirlo con il rimando alla Sincronizzazione.
     */
    it('dopo «Azzera» un problema ancora presente resta scritto: il banner avvisa delle notifiche mancanti', async () => {
      const user = userEvent.setup();
      const conErrore = {
        ...CONNECTED,
        autoSyncEnabled: true,
        lastError: {
          message: 'Registrazione delle notifiche non riuscita.',
          code: 'webhook_partial_registration',
          occurredAt: '2026-09-14T10:00:00.000Z',
        },
        webhookTopicsKnown: true,
        webhookTopics: ['orders/create'],
        webhookMissingTopics: [
          'fulfillment_orders/moved',
          'fulfillment_orders/order_routing_complete',
        ],
      };
      connectionService.getConnection.mockReturnValue(of(conErrore));
      connectionService.clearErrors.mockImplementation(() => {
        // L'API cancella l'errore salvato; le registrazioni mancanti restano quelle che sono.
        const { lastError: _tolto, ...senzaErrore } = conErrore;
        connectionService.getConnection.mockReturnValue(of(senzaErrore));
        return of({ cleared: true as const, productsReset: 0, locationsReset: 0 });
      });
      // La scheda aperta la dà la pagina dalla rotta: qui si parte già da Connessione e sedi.
      await ritorno('shopify=connected', TITOLARE, PERCORSO_ASSENTE, 'connessione');
      await waitFor(() =>
        expect(bannerEsito().testo).toBe(
          'Negozio collegato. Aggiornamenti automatici attivi. Con un avviso: Registrazione delle notifiche non riuscita. Vedi le notifiche',
        ),
      );

      await user.click(
        await screen.findByRole('button', { name: 'Azzera le segnalazioni di errore' }),
      );
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          'Segnalazioni di errore azzerate. Le cause non sono state corrette: se il problema c’è ancora, la segnalazione ricompare.',
        ),
      );
      // Il banner non dice «tutto a posto»: le due notifiche mancano ancora.
      await waitFor(() =>
        expect(bannerEsito().testo).toBe(
          'Negozio collegato. Aggiornamenti automatici attivi. Con un avviso: 2 notifiche non registrate su Shopify. Vedi le notifiche',
        ),
      );
      expect(bannerEsito().tono).toBe('warning');
      expect(screen.getByRole('button', { name: 'Vedi le notifiche' })).toBeVisible();
    });
  });
});
