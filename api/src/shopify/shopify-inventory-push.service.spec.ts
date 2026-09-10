import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

/** Nessun tentativo aperto: è lo stato normale di una riga. */
const TENTATIVO_ASSENTE = {
  pendingKey: null,
  pendingAvailable: null,
  pendingBase: null,
  pendingShopDomain: null,
  pendingItemId: null,
  pendingLocationRef: null,
  pendingAt: null,
} as const;

describe('ShopifyInventoryPushService', () => {
  function createService(
    options: {
      /** La presa del tentativo va a un altro esecutore. */
      prenotazionePersa?: boolean;
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
    } = {},
  ) {
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
        // ⚠️ La riga finta porta gli STESSI campi che il servizio seleziona,
        //    TENTATIVO compreso: un finto più povero dell'originale farebbe
        //    passare un recupero che l'originale non supererebbe.
        findUnique: vi.fn().mockResolvedValue(
          options.statoSync !== undefined
            ? options.statoSync === null
              ? null
              : { ...TENTATIVO_ASSENTE, ...options.statoSync }
            : lastPushed == null
              ? null
              : {
                  ...TENTATIVO_ASSENTE,
                  lastPushedAvailable: lastPushed,
                  lastObservedShopifyAvailable: null,
                  mismatchDetected: false,
                },
        ),
        // La riga si crea se manca, e la presa del tentativo riesce — salvo che
        // la prova dichiari di volerla perdere, che è il caso concorrente.
        upsert: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: options.prenotazionePersa ? 0 : 1 }),
      },
      /**
       * ⭐ **La lettura COERENTE**, che dal 10/09/2026 prende Disponibile e
       *    stato in una sola istruzione. Il doppio la costruisce **dagli stessi
       *    finti** che le prove configurano già: così una prova che imposta
       *    `level` e `lastPushed` continua a dire la stessa cosa, e non c'è un
       *    secondo posto dove dichiarare lo stato.
       */
      $queryRaw: vi.fn(async () => {
        const livello = (await prisma.inventoryLevel.findUnique()) as {
          available: number;
          onHand: number;
          committed: number;
        } | null;
        if (!livello) {
          return [];
        }
        const stato = (await prisma.shopifyInventorySyncState.findUnique()) as Record<
          string,
          unknown
        > | null;
        return [
          {
            available: livello.available,
            on_hand: livello.onHand,
            committed: livello.committed,
            ha_stato: stato !== null,
            last_pushed_available: stato?.lastPushedAvailable ?? null,
            last_observed_shopify_available: stato?.lastObservedShopifyAvailable ?? null,
            last_pushed_at: stato?.lastPushedAt ?? null,
            last_observed_at: stato?.lastObservedAt ?? null,
            mismatch_detected: stato?.mismatchDetected ?? false,
            pending_key: stato?.pendingKey ?? null,
            pending_available: stato?.pendingAvailable ?? null,
            pending_base: stato?.pendingBase ?? null,
            pending_shop_domain: stato?.pendingShopDomain ?? null,
            pending_item_id: stato?.pendingItemId ?? null,
            pending_location_ref: stato?.pendingLocationRef ?? null,
            pending_at: stato?.pendingAt ?? null,
          },
        ];
      }),
      /**
       * La PRESA condizionata: `1` se riesce, `0` se un altro esecutore l'ha
       * già presa — che è ciò che `prenotazionePersa` dichiara.
       *
       * ⚠️ **Il doppio non può verificare le condizioni** (base e Disponibile
       *    invariati): quelle vivono nell'SQL, e chi le misura sono le prove di
       *    integrazione `P9`, `P9-bis` e `P9-ter`. Qui si dichiara solo l'esito.
       */
      $executeRaw: vi.fn().mockResolvedValue(options.prenotazionePersa ? 0 : 1),
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

    // ⭐ Dal 09/09/2026 la quantità la scrive GraphQL, con confronto e chiave
    //    (`docs/24` §8.7, migrazione già decisa). Il client REST resta per la
    //    lettura della variante.
    const shopifyGraphql = {
      // ⭐ **L'elenco VUOTO significa «applicata».** Il metodo restituisce gli
      //    `userErrors` invece di sollevarli, perché un rifiuto di confronto è
      //    un esito noto e non un guasto: `undefined` qui farebbe credere
      //    applicata ogni scrittura, cioè il contrario del contratto.
      setInventoryQuantities: vi.fn().mockResolvedValue([]),
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
      shopifyGraphql as never,
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
      shopifyGraphql,
      shopifyConnection,
      reconciliation,
      storico,
      registro,
    };
  }

  it('pushLevel salta se Shopify non connesso', async () => {
    const { service, shopifyGraphql } = createService({ connection: null });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'not_connected' });
    expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
  });

  it('pushLevel salta se manca scope write_inventory', async () => {
    const { service, shopifyGraphql } = createService({
      connection: {
        status: ShopifyConnectionStatus.connected,
        scopes: ['read_inventory'],
      },
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'missing_write_inventory_scope' });
    expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
  });

  it('pushLevel invia il Disponibile del gestionale, con il solo clamp a zero', async () => {
    const { service, shopifyGraphql, prisma, reconciliation } = createService({ lastPushed: 99 });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: true, publishableAvailable: 7 });
    expect(shopifyGraphql.setInventoryQuantities).toHaveBeenCalledWith(
      'shop.myshopify.com',
      'shpat_test',
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        quantities: [
          {
            inventoryItemId: 'gid://shopify/InventoryItem/1',
            locationId: 'gid://shopify/Location/1',
            quantity: 7,
            // ⭐ La base c'è — l'ultimo confermato — quindi il confronto viaggia.
            changeFromQuantity: 99,
          },
        ],
      }),
    );
    // ⭐ **La conferma è UNA scrittura condizionata alla chiave**, non più
    //    `recordSuccessfulPush`: fra quell'upsert non condizionato e la chiusura
    //    del tentativo ci sarebbe una finestra in cui il confermato è avanzato e
    //    il tentativo è ancora aperto.
    // ⭐ **La conferma è UNA sola istruzione**, e dal 10/09/2026 è un
    //    `$executeRaw`: nella stessa `UPDATE` avanza il confermato, chiude il
    //    tentativo e SCARICA i contatori. ⛔ In due scritture ci sarebbe una
    //    finestra in cui i contatori sono già scaricati e il tentativo aperto:
    //    alla ripresa verrebbe ripetuto, scaricando due volte.
    const sqlConferma = (prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock
      .calls.map((c) => (Array.isArray(c[0]) ? (c[0] as string[]).join('?') : String(c[0])))
      .join(' | ');
    expect(sqlConferma).toContain('UPDATE shopify_inventory_sync_states');
    expect(sqlConferma).toContain('pending_key');
    expect(sqlConferma).toContain('local_pending_delta');
    expect(reconciliation.recordSuccessfulPush).not.toHaveBeenCalled();
  });

  it('pushLevel invia 0 quando Disponibile interna è negativa', async () => {
    const { service, shopifyGraphql } = createService({
      level: { onHand: 5, committed: 7, available: -2 },
      lastPushed: 99,
    });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result.publishableAvailable).toBe(0);
    expect(shopifyGraphql.setInventoryQuantities).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        quantities: [expect.objectContaining({ quantity: 0 })],
      }),
    );
  });

  it('pushLevel salta se valore pubblicabile invariato', async () => {
    const { service, shopifyGraphql } = createService({ lastPushed: 7 });

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
    expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
  });

  it('pushLevel restituisce shopify_error se Admin API fallisce', async () => {
    const { service, shopifyGraphql } = createService({ lastPushed: 99 });
    shopifyGraphql.setInventoryQuantities.mockRejectedValue(new Error('429 rate limit'));

    const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

    expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
  });
  /*
    ⛔ «Sincronizza con Shopify» spento ferma TUTTI i flussi, inventario
    compreso (docs/24 §1.8). Prima il flag non veniva letto qui: il catalogo
    si congelava e lo stock continuava a partire.
  */
  it('pushLevel NON parte se «Sincronizza con Shopify» è spento sul prodotto', async () => {
    const { service, shopifyGraphql } = createService({
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
    expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
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
      const { service, shopifyGraphql, prisma } = createService({
        statoSync: disallineata,
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: true, publishableAvailable: 7 });
      expect(shopifyGraphql.setInventoryQuantities).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'shpat_test',
        expect.objectContaining({
          quantities: [
            {
              inventoryItemId: 'gid://shopify/InventoryItem/1',
              locationId: 'gid://shopify/Location/1',
              quantity: 7,
              // ⭐ Qui la base c'è — l'ultimo confermato — quindi il confronto
              //    viaggia: il recupero non scrive alla cieca.
              changeFromQuantity: 7,
            },
          ],
        }),
      );
      // ⭐ La conferma è una scrittura sola, condizionata alla chiave.
      const sql = (prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .map((c) => (Array.isArray(c[0]) ? (c[0] as string[]).join('?') : String(c[0])))
        .join(' | ');
      expect(sql).toContain('UPDATE shopify_inventory_sync_states');
      expect(sql).toContain('pending_key');
    });

    /**
     * ⛔ **È il vincolo del mandato, ed è l'unica prova che lo ancora**: «superare
     *    il confronto soltanto nel percorso interno di recupero». Sullo STESSO
     *    stato, la porta ordinaria non deve mandare niente — altrimenti il
     *    sorpasso sarebbe diventato la regola per tutti i chiamanti.
     */
    it('⛔ la porta ORDINARIA, sullo stesso stato, non invia niente', async () => {
      const { service, shopifyGraphql } = createService({ statoSync: disallineata });

      const result = await service.pushLevel('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
    });

    it('marcatore SPENTO: non c è niente da recuperare, e non parte niente', async () => {
      const { service, shopifyGraphql } = createService({
        statoSync: { ...disallineata, mismatchDetected: false },
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
    });

    it('Shopify porta GIÀ quel numero: nessuna ripubblicazione inutile', async () => {
      const { service, shopifyGraphql } = createService({
        statoSync: { ...disallineata, lastObservedShopifyAvailable: 7 },
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 7 });
      expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
    });

    it('⛔ un RINVIO in corso non viene scavalcato, e la domanda va alla riconciliazione', async () => {
      const { service, shopifyGraphql, reconciliation } = createService({
        statoSync: disallineata,
        rinvioAttivo: true,
      });

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'rinvio_attivo', publishableAvailable: 7 });
      expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
      // ⭐ Con l'osservato e il pubblicabile: la regola resta della riconciliazione.
      expect(reconciliation.rinvioAttivo).toHaveBeenCalledWith('tenant-1', 'var-1', 'loc-1', 3, 7);
    });

    it('⛔ «Sincronizza con Shopify» spento: il recupero non lo scavalca', async () => {
      const { service, shopifyGraphql, reconciliation } = createService({
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
      expect(shopifyGraphql.setInventoryQuantities).not.toHaveBeenCalled();
      // ⭐ Si è fermato PRIMA: la riconciliazione non è stata nemmeno interrogata.
      expect(reconciliation.rinvioAttivo).not.toHaveBeenCalled();
    });

    it('guasto del canale sulla riga recuperata: nessuna falsa riuscita', async () => {
      const { service, shopifyGraphql, reconciliation } = createService({
        statoSync: disallineata,
      });
      shopifyGraphql.setInventoryQuantities.mockRejectedValue(new Error('429 rate limit'));

      const result = await service.ripubblicaDisallineamento('tenant-1', 'var-1', 'loc-1');

      expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
      expect(reconciliation.recordSuccessfulPush).not.toHaveBeenCalled();
    });
  });
});
