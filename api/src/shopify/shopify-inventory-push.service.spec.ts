import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

describe('ShopifyInventoryPushService', () => {
  function createService(options: {
    connection?: { status: ShopifyConnectionStatus; scopes: string[] } | null;
    variant?: Record<string, unknown> | null;
    location?: Record<string, unknown> | null;
    level?: { onHand: number; committed: number; available: number } | null;
    lastPushed?: number | null;
    /**
     * Lo stato sync COMPLETO, come lo legge il servizio: serve al percorso di
     * recupero, che oltre all'ultimo inviato guarda il marcatore e l'ultima
     * osservazione. `lastPushed` resta la scorciatoia delle prove ordinarie.
     */
    statoSync?: {
      lastPushedAvailable: number | null;
      lastObservedShopifyAvailable: number | null;
      mismatchDetected: boolean;
    } | null;
    /** La risposta della riconciliazione alla domanda «è rinviata?» (Caso C). */
    rinvioAttivo?: boolean;
  } = {}) {
    const {
      connection = {
        status: ShopifyConnectionStatus.connected,
        scopes: ['read_inventory', 'write_inventory'],
      },
      variant = {
        id: 'var-1',
        sku: 'SKU-1',
        shopifyInventoryItemId: 'gid://shopify/InventoryItem/1',
        shopifyVariantId: 'gid://shopify/ProductVariant/1',
        product: { shopifySyncEnabled: true },
      },
      location = { shopifyLocationId: 'gid://shopify/Location/1', name: 'Napoli' },
      // ⭐ La riga di livello porta il Disponibile del gestionale, che è
      //    quello che il push legge dal 09/09/2026. Giacenza e impegnata
      //    restano perché il servizio le scrive nel log.
      level = { onHand: 10, committed: 3, available: 7 },
      lastPushed = null,
    } = options;

    const prisma = {
      shopifyConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(variant),
        update: vi.fn(),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue(location),
      },
      inventoryLevel: {
        findUnique: vi.fn().mockResolvedValue(level),
      },
      shopifyInventorySyncState: {
        // ⚠️ La riga finta porta gli STESSI tre campi che il servizio seleziona:
        //    un finto più povero dell'originale farebbe passare un recupero che
        //    l'originale non supererebbe.
        findUnique: vi.fn().mockResolvedValue(
          options.statoSync !== undefined
            ? options.statoSync
            : lastPushed == null
              ? null
              : {
                  lastPushedAvailable: lastPushed,
                  lastObservedShopifyAvailable: null,
                  mismatchDetected: false,
                },
        ),
      },
    };

    const shopifyOAuth = {
      getAccessToken: vi.fn().mockResolvedValue({
        shopDomain: 'shop.myshopify.com',
        accessToken: 'shpat_test',
      }),
    };

    const shopifyAdmin = {
      setInventoryAvailable: vi.fn().mockResolvedValue(undefined),
      getVariant: vi.fn(),
    };

    const shopifyConnection = {
      touchSync: vi.fn().mockResolvedValue(undefined),
    };

    const reconciliation = {
      recordSuccessfulPush: vi.fn().mockResolvedValue(undefined),
      // ⭐ La regola del rinvio (Caso C) vive nella riconciliazione, e il
      //    recupero gliela CHIEDE invece di riscriverla.
      rinvioAttivo: vi.fn().mockResolvedValue(options.rinvioAttivo ?? false),
    };

    // ⚠️ 26.8 · **tenant senza negozio identificato**: la guardia dello storico
    //    non parte, e queste prove conservano il significato che avevano. È il
    //    ramo «connessione non migrata», che deve restare quello di prima; il
    //    ramo protetto si prova sul database vero (`collegamento-escluso` E14).
    const storico = { negozioDelTenant: vi.fn().mockResolvedValue(null) };
    const registro = { registraRifiuto: vi.fn() };

    const service = new ShopifyInventoryPushService(
      prisma as unknown as PrismaService,
      shopifyOAuth as unknown as ShopifyOAuthService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      shopifyConnection as unknown as ShopifyConnectionService,
      reconciliation as unknown as ShopifyInventoryReconciliationService,
      storico as never,
      registro as never,
    );

    return {
      service,
      prisma,
      shopifyOAuth,
      shopifyAdmin,
      shopifyConnection,
      reconciliation,
      storico,
      registro,
    };
  }

  it('pushLevel salta se Shopify non connesso', async () => {
    const { service, shopifyAdmin } = createService({ connection: null });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'not_connected' });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel salta se manca scope write_inventory', async () => {
    const { service, shopifyAdmin } = createService({
      connection: {
        status: ShopifyConnectionStatus.connected,
        scopes: ['read_inventory'],
      },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'missing_write_inventory_scope' });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel invia il Disponibile del gestionale, con il solo clamp a zero', async () => {
    const { service, shopifyAdmin, reconciliation } = createService();

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: true, publishableAvailable: 7 });
    expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
      'shop.myshopify.com',
      'shpat_test',
      'gid://shopify/InventoryItem/1',
      'gid://shopify/Location/1',
      7,
    );
    expect(reconciliation.recordSuccessfulPush).toHaveBeenCalledWith(
      'tenant-1',
      'var-1',
      'loc-1',
      7,
    );
  });

  it('pushLevel invia 0 quando Disponibile interna è negativa', async () => {
    const { service, shopifyAdmin } = createService({
      level: { onHand: 5, committed: 7, available: -2 },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result.publishableAvailable).toBe(0);
    expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      0,
    );
  });

  it('pushLevel salta se valore pubblicabile invariato', async () => {
    const { service, shopifyAdmin } = createService({ lastPushed: 7 });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  it('pushLevel restituisce shopify_error se Admin API fallisce', async () => {
    const { service, shopifyAdmin } = createService();
    shopifyAdmin.setInventoryAvailable.mockRejectedValue(new Error('429 rate limit'));

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
  });
  /*
    ⛔ «Sincronizza con Shopify» spento ferma TUTTI i flussi, inventario
    compreso (docs/24 §1.8). Prima il flag non veniva letto qui: il catalogo
    si congelava e lo stock continuava a partire.
  */
  it('pushLevel NON parte se «Sincronizza con Shopify» è spento sul prodotto', async () => {
    const { service, shopifyAdmin } = createService({
      variant: {
        id: 'var-1',
        sku: 'SKU-1',
        shopifyInventoryItemId: 'gid://shopify/InventoryItem/1',
        shopifyVariantId: 'gid://shopify/ProductVariant/1',
        product: { shopifySyncEnabled: false },
      },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'sync_disabled' });
    expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
  });

  /**
   * Il percorso INTERNO di recupero del disallineamento.
   *
   * ⚠️ **Queste prove stanno QUI, e non solo in integrazione, per una ragione
   *    misurata**: la suite di integrazione **non gira** in `test:everything`
   *    né nell'hook `pre-push` — che eseguono copertura, componenti, API
   *    unitaria e guardie. Le prove `V1..V15` dimostrano il comportamento sul
   *    database vero, ma non farebbero da guardia a nessuno.
   */
  describe('ripubblicaDisallineamento — il percorso interno di recupero', () => {
    /** Il caso canonico: ultimo inviato uguale al pubblicabile, Shopify diverso. */
    const disallineata = {
      lastPushedAvailable: 7,
      lastObservedShopifyAvailable: 3,
      mismatchDetected: true,
    };

    it('supera la scorciatoia dell «invariata» e invia il valore attuale', async () => {
      const { service, shopifyAdmin, reconciliation } = createService({
        statoSync: disallineata,
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: true, publishableAvailable: 7 });
      expect(shopifyAdmin.setInventoryAvailable).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'shpat_test',
        'gid://shopify/InventoryItem/1',
        'gid://shopify/Location/1',
        7,
      );
      expect(reconciliation.recordSuccessfulPush).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-1', 7);
    });

    /**
     * ⛔ **È il vincolo del mandato, ed è l'unica prova che lo ancora**: «superare
     *    il confronto soltanto nel percorso interno di recupero». Sullo STESSO
     *    stato, la porta ordinaria non deve mandare niente — altrimenti il
     *    sorpasso sarebbe diventato la regola per tutti i chiamanti.
     */
    it('⛔ la porta ORDINARIA, sullo stesso stato, non invia niente', async () => {
      const { service, shopifyAdmin } = createService({ statoSync: disallineata });

      const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
    });

    it('marcatore SPENTO: non c è niente da recuperare, e non parte niente', async () => {
      const { service, shopifyAdmin } = createService({
        statoSync: { ...disallineata, mismatchDetected: false },
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
    });

    it('Shopify porta GIÀ quel numero: nessuna ripubblicazione inutile', async () => {
      const { service, shopifyAdmin } = createService({
        statoSync: { ...disallineata, lastObservedShopifyAvailable: 7 },
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
    });

    it('⛔ un RINVIO in corso non viene scavalcato, e la domanda va alla riconciliazione', async () => {
      const { service, shopifyAdmin, reconciliation } = createService({
        statoSync: disallineata,
        rinvioAttivo: true,
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'rinvio_attivo', publishableAvailable: 7 });
      expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
      // ⭐ Con l'osservato e il pubblicabile: la regola resta della riconciliazione.
      expect(reconciliation.rinvioAttivo).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-1', 3, 7);
    });

    it('⛔ «Sincronizza con Shopify» spento: il recupero non lo scavalca', async () => {
      const { service, shopifyAdmin, reconciliation } = createService({
        statoSync: disallineata,
        variant: {
          id: 'var-1',
          sku: 'SKU-1',
          shopifyInventoryItemId: 'gid://shopify/InventoryItem/1',
          shopifyVariantId: 'gid://shopify/ProductVariant/1',
          product: { shopifySyncEnabled: false },
        },
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'sync_disabled' });
      expect(shopifyAdmin.setInventoryAvailable).not.toHaveBeenCalled();
      // ⭐ Si è fermato PRIMA: la riconciliazione non è stata nemmeno interrogata.
      expect(reconciliation.rinvioAttivo).not.toHaveBeenCalled();
    });

    it('guasto del canale sulla riga recuperata: nessuna falsa riuscita', async () => {
      const { service, shopifyAdmin, reconciliation } = createService({
        statoSync: disallineata,
      });
      shopifyAdmin.setInventoryAvailable.mockRejectedValue(new Error('429 rate limit'));

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
      expect(reconciliation.recordSuccessfulPush).not.toHaveBeenCalled();
    });
  });
});
