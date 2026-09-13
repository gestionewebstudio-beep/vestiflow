import { ShopifySyncStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { RIFERIMENTI_SEDE, type RiferimentoSede } from './location-delete-safety.util';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyLocationLinkService } from './shopify-location-link.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';

/**
 * I delegati Prisma delle relazioni che una sede si porterebbe via.
 *
 * ⚠️ **Generati DALL'ELENCO, non scritti a mano.** Una voce aggiunta domani a
 *    `RIFERIMENTI_SEDE` deve comparire qui da sola: un mock
 *    scritto a mano non esporrebbe quel modello, e `verificaSedeCancellabile`
 *    fallirebbe con un errore che sembra un problema del test invece che una
 *    protezione mancante.
 *
 * ⭐ **Il `count` guarda il CAMPO, non solo il modello.** `stockMovement`
 *    compare due volte con significati opposti — `locationId` e' inventario
 *    (`Restrict`, si difende da solo) e `targetLocationId` e' un riferimento
 *    che si azzera in silenzio. Un mock che rispondesse per modello non
 *    saprebbe distinguerli, e la prova per relazione non proverebbe niente.
 *
 * ⚠️ **`delete` e `deleteMany` sono spie che devono restare mute**: servono a
 *    dimostrare la seconda meta' del contratto — la sede non si cancella E
 *    l'entita' collegata resta dov'e'.
 */
function creaDelegatiRiferimento(presenti: Readonly<Record<string, number>> = {}) {
  const campiPerModello = new Map<string, Record<string, number>>();
  for (const riferimento of RIFERIMENTI_SEDE) {
    const campi = campiPerModello.get(riferimento.modello) ?? {};
    campi[riferimento.campo] = presenti[`${riferimento.modello}.${riferimento.campo}`] ?? 0;
    campiPerModello.set(riferimento.modello, campi);
  }

  const delegati: Record<
    string,
    {
      count: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    }
  > = {};

  for (const [modello, campi] of campiPerModello) {
    delegati[modello] = {
      count: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        for (const [campo, quante] of Object.entries(campi)) {
          if (campo in where) {
            return Promise.resolve(quante);
          }
        }
        return Promise.resolve(0);
      }),
      delete: vi.fn().mockRejectedValue(new Error('nessun percorso deve cancellare questa entita')),
      deleteMany: vi
        .fn()
        .mockRejectedValue(new Error('nessun percorso deve cancellare questa entita')),
    };
  }

  return delegati;
}

describe('ShopifyLocationSyncService', () => {
  const tenantId = 'tenant-1';
  const shopDomain = 'store.myshopify.com';
  const accessToken = 'token';

  function createService(options?: {
    shopifyLocations?: Array<{
      id: string | number;
      name: string;
      active?: boolean;
      address1?: string;
      city?: string;
      country_code?: string;
    }>;
    tenantLocations?: Array<Record<string, unknown>>;
    defaultStore?: { id: string } | null;
    /** Quanti riferimenti esistono, per chiave `modello.campo`. */
    riferimenti?: Readonly<Record<string, number>>;
    /** Le coppie con periodo ATTIVO (B7), come le risponde `sediCollegate`. */
    coppie?: ReadonlyArray<{ locationId: string; shopifyLocationId: string; gid: string }>;
  }) {
    const coppie = options?.coppie;
    const shopifyLocations = options?.shopifyLocations ?? [
      {
        id: '1001',
        name: 'Negozio Napoli',
        active: true,
        address1: 'Via Roma 1',
        city: 'Napoli',
        country_code: 'IT',
      },
    ];
    const tenantLocations = options?.tenantLocations ?? [];
    const defaultStore = options?.defaultStore ?? { id: 'store-1' };
    const allLocations = [...tenantLocations];

    const locationUpdate = vi.fn().mockResolvedValue({});
    const locationCreate = vi.fn().mockResolvedValue({});
    const locationDelete = vi.fn().mockResolvedValue({});
    const locationFindMany = vi
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.code === 'LOC-01') {
          return Promise.resolve(
            allLocations.filter((loc) => loc.code === 'LOC-01' && loc.shopifyLocationId == null),
          );
        }
        if (
          typeof where.shopifyLocationId === 'object' &&
          where.shopifyLocationId !== null &&
          'not' in where.shopifyLocationId
        ) {
          return Promise.resolve(allLocations.filter((loc) => loc.shopifyLocationId != null));
        }
        return Promise.resolve(allLocations);
      });

    const delegatiRiferimento = creaDelegatiRiferimento(options?.riferimenti);

    const prisma = {
      location: {
        findMany: locationFindMany,
        update: locationUpdate,
        create: locationCreate,
        delete: locationDelete,
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(defaultStore),
      },
      inventoryLevel: { count: vi.fn().mockResolvedValue(0) },
      inventoryCountSession: {
        count: vi.fn().mockResolvedValue(0),
      },
      /*
        ⚠️ `stockMovement` e `supplierOrder` non sono piu' dichiarati qui: li
           porta `creaDelegatiRiferimento`, che risponde per campo. Dichiarati
           due volte, l'ultimo vincerebbe e la prova per relazione tornerebbe 0
           su un riferimento che invece esiste.
      */
      ...delegatiRiferimento,
      // La scrittura del collegamento per id sta in una transazione: qui la
      // transazione è il prisma stesso.
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };

    const shopifyAdmin = {
      listLocations: vi.fn().mockResolvedValue(shopifyLocations),
    };

    // ⭐ B7: coppia e periodo li scrive il servizio di collegamento esplicito.
    const collega = vi
      .fn()
      .mockResolvedValue({ tipo: 'registrato', pairId: 'pair-1', linkId: 'link-1' });
    // Le coppie attive (B7): qui nessuna — chi le vuole le passa con `coppie`.
    const sediCollegate = vi.fn().mockResolvedValue(coppie ?? []);
    const service = new ShopifyLocationSyncService(
      prisma as unknown as PrismaService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      { collega, sediCollegate } as unknown as ShopifyLocationLinkService,
    );

    return {
      service,
      prisma,
      shopifyAdmin,
      locationUpdate,
      locationCreate,
      locationDelete,
      delegatiRiferimento,
      collega,
    };
  }

  it('collega location esistente per shopifyLocationId e aggiorna il nome', async () => {
    const { service, prisma, locationUpdate, locationCreate, collega } = createService({
      tenantLocations: [
        {
          id: 'loc-1',
          tenantId,
          code: 'LOC-01',
          name: 'Nome onboarding errato',
          shopifyLocationId: '1001',
        },
      ],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result).toEqual({ matchedCount: 1, importedCount: 0, totalCount: 1, unlinked: [] });
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-1' },
        data: expect.objectContaining({
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
          shopifySyncStatus: ShopifySyncStatus.synced,
        }),
      }),
    );
    expect(locationCreate).not.toHaveBeenCalled();
    // ⭐ La coppia e il periodo (B7) li scrive il collegamento esplicito.
    expect(collega).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ tenantId, locationId: 'loc-1', shopifyLocationId: '1001' }),
    );
  });

  /**
   * ⛔ Qui c’era «importa nuova location Shopify con codice LOC progressivo»:
   *    la sincronizzazione CREAVA la sede. Tolto l’11/09/2026 (B7, docs/24
   *    §1.13.1): creare è una delle tre scelte dell’operatore, non un effetto.
   */
  it('una location sconosciuta NON diventa una sede: viene riportata', async () => {
    const { service, locationCreate, collega } = createService({
      tenantLocations: [{ id: 'loc-1', code: 'LOC-03', shopifyLocationId: null, name: 'Locale' }],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result.importedCount).toBe(0);
    expect(result.matchedCount).toBe(0);
    expect(result.unlinked).toEqual([
      { shopifyLocationId: '1001', name: 'Negozio Napoli', active: true },
    ]);
    expect(locationCreate).not.toHaveBeenCalled();
    expect(collega).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Qui c’era «collega per nome quando shopifyLocationId manca lato VF».
   *    Tolto l’11/09/2026 (B7): lo stesso nome non è un collegamento, e con
   *    tre sedi e tre location faceva sei sedi (registro difetti 3.14).
   */
  it('lo stesso NOME non collega: la location resta riportata, la sede intatta', async () => {
    const { service, locationUpdate, collega } = createService({
      tenantLocations: [
        {
          id: 'loc-local',
          // Un codice NON di import (`LOC-xx`): è una sede del gestionale con lo stesso nome.
          code: 'NAP-1',
          name: 'Negozio Napoli',
          shopifyLocationId: null,
        },
      ],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result.unlinked.map((u) => u.shopifyLocationId)).toEqual(['1001']);
    expect(locationUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loc-local' } }),
    );
    expect(collega).not.toHaveBeenCalled();
  });

  /**
   * ⭐ Dopo «Disconnetti» la colonna-cache è azzerata ma il periodo della coppia
   *    — mai chiuso: disconnettere sospende — resta attivo. Alla riconnessione
   *    allo stesso negozio la sede si riconosce dalla COPPIA (la fonte, B7), e
   *    `collega` rimette la cache. Non è un abbinamento: è un id già dichiarato.
   */
  it('cache azzerata ma coppia ATTIVA: la sede si riconosce dalla coppia, non finisce fra le non collegate', async () => {
    const { service, locationUpdate, collega } = createService({
      tenantLocations: [
        { id: 'loc-sospesa', code: 'NAP-1', name: 'Altro nome', shopifyLocationId: null },
      ],
      coppie: [
        { locationId: 'loc-sospesa', shopifyLocationId: '1001', gid: 'gid://shopify/Location/1001' },
      ],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result.matchedCount).toBe(1);
    expect(result.unlinked).toEqual([]);
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-sospesa' },
        data: expect.objectContaining({ shopifyLocationId: '1001' }),
      }),
    );
    expect(collega).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: 'loc-sospesa', shopifyLocationId: '1001' }),
    );
  });

  it('non collega automaticamente LOC-01 onboarding al primo match Shopify', async () => {
    const { service, locationCreate } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
      ],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // ⛔ Prima qui si aspettava `locationCreate`: la sede nasceva da sola (B7).
    expect(locationCreate).not.toHaveBeenCalled();
    expect(result.unlinked.map((u) => u.shopifyLocationId)).toEqual(['1001']);
  });

  it('NON rimuove LOC-01 onboarding, nemmeno vuota', async () => {
    const { service, locationDelete } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
        {
          id: 'loc-linked',
          code: 'LOC-02',
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // ⛔ docs/24 §1.13.4: nessuna sincronizzazione elimina una sede, neppure vuota.
    expect(locationDelete).not.toHaveBeenCalled();
  });

  it('NON elimina i residui import non collegati: li archivia', async () => {
    const { service, locationDelete } = createService({
      tenantLocations: [
        {
          id: 'loc-local',
          code: 'LOC-01',
          name: 'Negozio',
          shopifyLocationId: null,
          isActive: true,
        },
        {
          id: 'loc-residual',
          code: 'LOC-02',
          name: 'My Custom Location',
          shopifyLocationId: null,
          addressLine1: '123 Main St',
          isActive: true,
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // ⛔ docs/24 §1.13.4: nessuna sincronizzazione elimina una sede, neppure vuota.
    expect(locationDelete).not.toHaveBeenCalled();
  });

  it('NON elimina una location Shopify stale, nemmeno senza dati operativi', async () => {
    const { service, locationDelete } = createService({
      shopifyLocations: [{ id: '1001', name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-05',
          name: 'Magazzino chiuso',
          shopifyLocationId: '9999',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // ⛔ docs/24 §1.13.4: nessuna sincronizzazione elimina una sede, neppure vuota.
    expect(locationDelete).not.toHaveBeenCalled();
  });

  it('NON scollega ne disattiva una location stale ancora in uso: segnala', async () => {
    const { service, locationUpdate, locationDelete, prisma } = createService({
      shopifyLocations: [{ id: '1001', name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-busy',
          code: 'LOC-06',
          name: 'Negozio attivo',
          shopifyLocationId: '8888',
        },
      ],
    });

    vi.mocked(prisma.inventoryLevel.count).mockResolvedValue(3);

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    /*
      ⛔ **Il titolo diceva «scollega», ed e' proprio cio' che non deve fare.**
         Una sede ancora in uso, sparita dal catalogo remoto, conserva
         identificativo e operativita': cambia solo lo STATO del collegamento,
         che diventa un segnale per l'operatore (docs/24 §1.13.3).
    */
    expect(locationDelete).not.toHaveBeenCalled();
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-busy' },
        data: expect.objectContaining({ shopifySyncStatus: ShopifySyncStatus.error }),
      }),
    );
    const scritte = locationUpdate.mock.calls.flatMap((c) =>
      Object.keys((c[0] as { data?: Record<string, unknown> }).data ?? {}),
    );
    expect(scritte, 'la sede e stata disattivata').not.toContain('isActive');
    expect(scritte, 'il collegamento e stato azzerato').not.toContain('shopifyLocationId');
  });

  it('NON elimina le location collegate quando Shopify non ne restituisce nessuna', async () => {
    const { service, locationDelete } = createService({
      shopifyLocations: [],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-03',
          name: 'Snow City Warehouse',
          shopifyLocationId: '7777',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // ⛔ docs/24 §1.13.4: nessuna sincronizzazione elimina una sede, neppure vuota.
    expect(locationDelete).not.toHaveBeenCalled();
  });

  it('normalizza GID Shopify nel confronto stale, e non elimina', async () => {
    const { service, locationDelete, locationUpdate } = createService({
      shopifyLocations: [{ id: 1001, name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-05',
          name: 'Snow City Warehouse',
          shopifyLocationId: 'gid://shopify/Location/9999',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    // Il confronto per GID normalizzato riconosce la sede come stale…
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loc-stale' } }),
    );
    // ⛔ docs/24 §1.13.4: nessuna sincronizzazione elimina una sede, neppure vuota.
    expect(locationDelete).not.toHaveBeenCalled();
  });

  it('disattiva location VF quando Shopify la segna come non attiva', async () => {
    const { service, locationUpdate, locationCreate } = createService({
      shopifyLocations: [{ id: '2002', name: 'Snow City Warehouse', active: false }],
      tenantLocations: [
        {
          id: 'loc-snow',
          code: 'LOC-03',
          name: 'Snow City Warehouse',
          shopifyLocationId: '2002',
          isActive: true,
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-snow' },
        data: expect.objectContaining({
          name: 'Snow City Warehouse',
          isActive: false,
          shopifyLocationId: '2002',
        }),
      }),
    );
    expect(locationCreate).not.toHaveBeenCalled();
  });

  it('non elimina LOC-01 onboarding con inventario attivo', async () => {
    const { service, locationDelete, prisma } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
        {
          id: 'loc-linked',
          code: 'LOC-02',
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
        },
      ],
    });

    vi.mocked(prisma.inventoryLevel.count).mockResolvedValue(1);
    vi.mocked(prisma.inventoryCountSession.count).mockResolvedValue(0);

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).not.toHaveBeenCalledWith({ where: { id: 'loc-onboarding' } });
  });

  /*
    ⛔ **Una prova per OGNI relazione, e le prove le genera l'ELENCO.**
       Scritte a mano sarebbero undici blocchi copiati, e una relazione aggiunta
       domani resterebbe senza prova: `check:cascate-sede` direbbe che e'
       dichiarata, e nessuno verificherebbe che e' davvero protettiva.

    ⭐ Le due guardie si tengono a vicenda: la statica garantisce che l'elenco
       sia COMPLETO rispetto allo schema, queste prove che ogni voce dell'elenco
       TRATTENGA davvero la sede.

    ⚠️ Il percorso provato e' `cleanupStaleShopifyLocations`: e' quello che ha
       prodotto il guasto — una sede collegata che sparisce dal catalogo Shopify
       e che il sync decide di rimuovere.
  */
  describe.each(RIFERIMENTI_SEDE as readonly RiferimentoSede[])(
    'sede trattenuta da $modello.$campo',
    ({ modello, campo, effetto }: RiferimentoSede) => {
      it(`non viene cancellata: l'entita collegata ${effetto === 'cancellata' ? 'sparirebbe' : 'perderebbe la sede'}`, async () => {
        const { service, locationDelete, locationUpdate, delegatiRiferimento } = createService({
          shopifyLocations: [{ id: 1001, name: 'Negozio attivo', active: true }],
          tenantLocations: [
            {
              id: 'loc-stale',
              code: 'LOC-05',
              name: 'Sede sparita da Shopify',
              shopifyLocationId: '9999',
            },
          ],
          riferimenti: { [`${modello}.${campo}`]: 3 },
        });

        await service.syncFromShopify(tenantId, shopDomain, accessToken);

        // 1 · la sede non si cancella
        expect(locationDelete).not.toHaveBeenCalled();

        /*
          2 · resta operativa e collegata, e il collegamento non verificabile
              viene SEGNALATO — docs/24 §1.13.3.

          ⛔ Qui si asseriva `isActive: false, shopifyLocationId: null`. Entrambi
             sono ora vietati: la sincronizzazione non disattiva, e azzerare
             l'identificativo cancella l'unica traccia del collegamento finche'
             `shopify_location_links` non esiste.
        */
        expect(locationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'loc-stale' },
            data: expect.objectContaining({ shopifySyncStatus: 'error' }),
          }),
        );
        const scritte = locationUpdate.mock.calls.flatMap((c) =>
          Object.keys((c[0] as { data?: Record<string, unknown> }).data ?? {}),
        );
        expect(scritte, 'la sede e stata disattivata').not.toContain('isActive');
        expect(scritte, 'il collegamento e stato azzerato').not.toContain('shopifyLocationId');

        // 3 · l'entita collegata resta intatta
        const delegato = delegatiRiferimento[modello];
        if (!delegato) {
          throw new Error(
            `il mock non espone «${modello}»: creaDelegatiRiferimento non lo genera piu'.`,
          );
        }
        expect(delegato.delete).not.toHaveBeenCalled();
        expect(delegato.deleteMany).not.toHaveBeenCalled();
      });
    },
  );

  /*
    ⭐ **Il rovescio della prova sopra, ed e' deliberato**: senza NESSUN
       riferimento la sede si cancella ancora. E' il comportamento voluto — una
       sede importata per errore e mai usata non deve restare per sempre nel
       selettore — e va provato esplicitamente, o la protezione potrebbe essere
       diventata un blocco totale senza che nessuno se ne accorga.

    ⚠️ Questa prova e' anche il controllo di sanita' delle undici sopra: se
       fallisse insieme a loro, il mock impedirebbe la cancellazione sempre, e
       quelle undici non proverebbero piu' niente.
  */
  /*
    ⛔ **Questa prova asseriva l'ELIMINAZIONE di una sede senza riferimenti**, e
       fotografava una decisione allora aperta. Ora e' presa: l'eliminazione di
       una sede vuota e non collegata appartiene esclusivamente alla funzione
       VestiFlow dedicata (`docs/24` §1.13.4), e una sincronizzazione di canale
       non e' quella funzione.

    ⭐ **Il contratto delle ventidue relazioni resta verificato**, dalle prove
       generate qui sopra: quelle esercitano `RIFERIMENTI_SEDE` una voce per
       volta, ed e' li' che l'elenco deve dimostrarsi completo.
  */
  it('NON cancella una sede priva di riferimenti: la archivia e la scollega', async () => {
    const { service, locationDelete, locationUpdate } = createService({
      shopifyLocations: [{ id: 1001, name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-mai-usata',
          code: 'LOC-05',
          name: 'Importata per errore',
          shopifyLocationId: '9999',
        },
      ],
      riferimenti: {},
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).not.toHaveBeenCalled();
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loc-mai-usata' } }),
    );
  });
});
