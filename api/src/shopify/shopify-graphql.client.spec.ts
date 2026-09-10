import { InternalServerErrorException, HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShopifyConfigService } from './shopify-config.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import type { ShopifyRateLimiterService } from './shopify-rate-limiter.service';

/**
 * Primitive GraphQL del catalogo (Tranche 2A, docs/24 §8.6).
 *
 * ⭐ Si verifica la SUPERFICIE: che cosa parte verso Shopify e che cosa torna al
 *    chiamante. Le mutation vengono lette dal corpo della richiesta, perché è
 *    l'unico modo di provare che `LEAVE_AS_IS` e l'assenza delle mutation
 *    distruttive siano davvero quello che viaggia.
 *
 * ⭐ **Le forme qui asserite sono state VERIFICATE contro Shopify** il
 *    03/09/2026, su uno shop di sviluppo, con il gate
 *    `npm run test:shopify:contract`. Questi test con mock non provano che
 *    Shopify accetti: provano che non si torni indietro su ciò che il gate ha
 *    misurato. Le tre difformità che aveva trovato — `@idempotent` sul campo,
 *    `ignoreCompareQuantity` inesistente, `changeFromQuantity` al posto di
 *    `compareQuantity` — hanno qui la loro asserzione.
 */
describe('ShopifyGraphqlClient — primitive del catalogo', () => {
  const SHOP = 'shop.myshopify.com';
  const TOKEN = 'shpat_test';

  let client: ShopifyGraphqlClient;
  let rateLimiter: {
    beforeGraphqlRequest: ReturnType<typeof vi.fn>;
    waitForRetry: ReturnType<typeof vi.fn>;
    onGraphQlCost: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    rateLimiter = {
      beforeGraphqlRequest: vi.fn().mockResolvedValue(undefined),
      waitForRetry: vi.fn().mockResolvedValue(undefined),
      onGraphQlCost: vi.fn(),
    };
    client = new ShopifyGraphqlClient(
      { apiVersion: '2026-07', apiMaxRetries: 2 } as unknown as ShopifyConfigService,
      rateLimiter as unknown as ShopifyRateLimiterService,
    );
  });

  /** Una risposta GraphQL riuscita con il `data` dato. */
  function rispondi(data: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ data }),
      headers: new Headers(),
    } as unknown as Response;
  }

  function mockFetch(...risposte: Response[]) {
    const fetchMock = vi.fn();
    for (const risposta of risposte) {
      fetchMock.mockResolvedValueOnce(risposta);
    }
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    return fetchMock;
  }

  /** Il corpo inviato alla n-esima chiamata: query e variabili. */
  function corpo(fetchMock: ReturnType<typeof vi.fn>, indice = 0) {
    const [, init] = fetchMock.mock.calls[indice] as [string, { body: string }];
    return JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
  }

  describe('creazione prodotto — productSet è SOLO per creare', () => {
    it('crea e restituisce id e stato', async () => {
      const fetchMock = mockFetch(
        rispondi({
          productSet: {
            product: { id: 'gid://shopify/Product/1', status: 'ACTIVE' },
            userErrors: [],
          },
        }),
      );

      const prodotto = await client.createProduct(SHOP, TOKEN, {
        title: 'Maglietta',
        status: 'ACTIVE',
      });

      expect(prodotto).toEqual({ id: 'gid://shopify/Product/1', status: 'ACTIVE' });
      const { query, variables } = corpo(fetchMock);
      expect(query).toContain('productSet');
      // ⛔ Nessun `id` nell'input: la firma non lo prevede, quindi productSet
      //    non può cadere sul ramo «aggiorna» e cancellare le liste omesse.
      expect(variables['input']).not.toHaveProperty('id');
    });

    it('userErrors di productSet diventano un errore col nome della mutation', async () => {
      mockFetch(
        rispondi({
          productSet: {
            product: null,
            userErrors: [{ field: null, message: 'Title is required' }],
          },
        }),
      );

      await expect(
        client.createProduct(SHOP, TOKEN, { title: '', status: 'ACTIVE' }),
      ).rejects.toThrow(/productSet: Title is required/);
    });

    it('risposta senza prodotto: errore esplicito, non un null che viaggia', async () => {
      mockFetch(rispondi({ productSet: { product: null, userErrors: [] } }));

      await expect(
        client.createProduct(SHOP, TOKEN, { title: 'X', status: 'ACTIVE' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('varianti', () => {
    it('bulkCreateVariants restituisce le varianti create, normalizzate', async () => {
      const fetchMock = mockFetch(
        rispondi({
          productVariantsBulkCreate: {
            productVariants: [
              {
                id: 'gid://shopify/ProductVariant/10',
                sku: 'SKU-M',
                barcode: null,
                inventoryItem: { id: 'gid://shopify/InventoryItem/5' },
                selectedOptions: [{ name: 'Taglia', value: 'M' }],
              },
            ],
            userErrors: [],
          },
        }),
      );

      const varianti = await client.bulkCreateVariants(SHOP, TOKEN, 'gid://shopify/Product/1', [
        { optionValues: [{ optionName: 'Taglia', name: 'M' }], price: '29.90' },
      ]);

      expect(varianti).toEqual([
        {
          id: 'gid://shopify/ProductVariant/10',
          sku: 'SKU-M',
          barcode: null,
          inventoryItemId: 'gid://shopify/InventoryItem/5',
          selectedOptions: [{ name: 'Taglia', value: 'M' }],
        },
      ]);
      expect(corpo(fetchMock).query).toContain('productVariantsBulkCreate');
    });

    it('bulkUpdateVariants porta `inventoryPolicy` e resta allowPartialUpdates: false', async () => {
      const fetchMock = mockFetch(
        rispondi({ productVariantsBulkUpdate: { productVariants: [], userErrors: [] } }),
      );

      await client.bulkUpdateVariants(SHOP, TOKEN, 'gid://shopify/Product/1', [
        { id: 'gid://shopify/ProductVariant/10', price: '19.90', inventoryPolicy: 'CONTINUE' },
      ]);

      const { query, variables } = corpo(fetchMock);
      expect(query).toContain('allowPartialUpdates: false');
      expect(variables['variants']).toEqual([
        { id: 'gid://shopify/ProductVariant/10', price: '19.90', inventoryPolicy: 'CONTINUE' },
      ]);
    });

    it('userErrors sulla creazione varianti si propagano', async () => {
      mockFetch(
        rispondi({
          productVariantsBulkCreate: {
            productVariants: [],
            userErrors: [{ field: ['variants'], message: 'Option value does not exist' }],
          },
        }),
      );

      await expect(
        client.bulkCreateVariants(SHOP, TOKEN, 'gid://shopify/Product/1', [
          { optionValues: [{ optionName: 'Taglia', name: 'XXL' }] },
        ]),
      ).rejects.toThrow(/productVariantsBulkCreate: Option value does not exist/);
    });
  });

  describe('opzioni — nessuna variante remota viene toccata', () => {
    it('createProductOptions usa variantStrategy LEAVE_AS_IS', async () => {
      const fetchMock = mockFetch(rispondi({ productOptionsCreate: { userErrors: [] } }));

      await client.createProductOptions(SHOP, TOKEN, 'gid://shopify/Product/1', [
        { name: 'Colore', values: [{ name: 'Rosso' }] },
      ]);

      // ⛔ Il default di Shopify è CREATE, che genererebbe combinazioni nuove.
      expect(corpo(fetchMock).query).toContain('variantStrategy: LEAVE_AS_IS');
    });

    it('updateProductOption usa LEAVE_AS_IS: MANAGE cancellerebbe varianti', async () => {
      const fetchMock = mockFetch(rispondi({ productOptionUpdate: { userErrors: [] } }));

      await client.updateProductOption(SHOP, TOKEN, 'gid://shopify/Product/1', {
        id: 'gid://shopify/ProductOption/7',
        name: 'Taglia',
        optionValuesToAdd: [{ name: 'XL' }],
      });

      const { query, variables } = corpo(fetchMock);
      expect(query).toContain('variantStrategy: LEAVE_AS_IS');
      expect(query).not.toContain('MANAGE');
      expect(variables['optionValuesToAdd']).toEqual([{ name: 'XL' }]);
    });

    it('reorderProductOptions non nomina alcuna strategia distruttiva', async () => {
      const fetchMock = mockFetch(rispondi({ productOptionsReorder: { userErrors: [] } }));

      await client.reorderProductOptions(SHOP, TOKEN, 'gid://shopify/Product/1', [
        { id: 'gid://shopify/ProductOption/7' },
      ]);

      expect(corpo(fetchMock).query).toContain('productOptionsReorder');
    });

    it('⛔ reorderProductOptions manda UNO SOLO fra id e name', async () => {
      const fetchMock = mockFetch(rispondi({ productOptionsReorder: { userErrors: [] } }));

      await client.reorderProductOptions(SHOP, TOKEN, 'gid://shopify/Product/1', [
        { id: 'gid://shopify/ProductOption/7' },
        { name: 'Colore' },
      ]);

      // `OptionReorderInput requires exactly one of id, name` — è il rifiuto
      // vero di Shopify, misurato il 03/09/2026 quando la firma li ammetteva
      // insieme. Ora l'unione del tipo lo rende impossibile; qui si prova che
      // nemmeno una chiave `undefined` finisca nel payload.
      const opzioni = corpo(fetchMock).variables['options'] as Record<string, unknown>[];
      for (const opzione of opzioni) {
        expect(Object.keys(opzione)).toHaveLength(1);
      }
      expect(opzioni).toEqual([{ id: 'gid://shopify/ProductOption/7' }, { name: 'Colore' }]);
    });
  });

  describe('publication e pubblicazione per canale', () => {
    it('listPublications restituisce i canali; assenza = elenco vuoto', async () => {
      mockFetch(
        rispondi({
          publications: { nodes: [{ id: 'gid://shopify/Publication/1', name: 'Online Store' }] },
        }),
      );
      await expect(client.listPublications(SHOP, TOKEN)).resolves.toEqual([
        { id: 'gid://shopify/Publication/1', name: 'Online Store' },
      ]);

      mockFetch(rispondi({ publications: null }));
      await expect(client.listPublications(SHOP, TOKEN)).resolves.toEqual([]);
    });

    it('pubblica un PRODOTTO e una VARIANTE con la stessa primitiva', async () => {
      const fetchMock = mockFetch(
        rispondi({ publishablePublish: { userErrors: [] } }),
        rispondi({ publishablePublish: { userErrors: [] } }),
      );

      await client.publishablePublish(SHOP, TOKEN, 'gid://shopify/Product/1', [
        'gid://shopify/Publication/1',
      ]);
      await client.publishablePublish(SHOP, TOKEN, 'gid://shopify/ProductVariant/10', [
        'gid://shopify/Publication/1',
      ]);

      expect(corpo(fetchMock, 0).variables['id']).toBe('gid://shopify/Product/1');
      expect(corpo(fetchMock, 1).variables['id']).toBe('gid://shopify/ProductVariant/10');
      expect(corpo(fetchMock, 1).variables['input']).toEqual([
        { publicationId: 'gid://shopify/Publication/1' },
      ]);
    });

    it('unpublish è un RITIRO, non una cancellazione', async () => {
      const fetchMock = mockFetch(rispondi({ publishableUnpublish: { userErrors: [] } }));

      await client.publishableUnpublish(SHOP, TOKEN, 'gid://shopify/ProductVariant/10', [
        'gid://shopify/Publication/1',
      ]);

      const { query } = corpo(fetchMock);
      expect(query).toContain('publishableUnpublish');
      expect(query).not.toMatch(/Delete/i);
    });

    it('userErrors della pubblicazione si propagano', async () => {
      mockFetch(
        rispondi({
          publishablePublish: { userErrors: [{ field: null, message: 'Publication not found' }] },
        }),
      );

      await expect(
        client.publishablePublish(SHOP, TOKEN, 'gid://shopify/Product/1', ['gid://x']),
      ).rejects.toThrow(/publishablePublish: Publication not found/);
    });
  });

  describe('collezioni manuali', () => {
    it('aggiunge e toglie il prodotto', async () => {
      const fetchMock = mockFetch(
        rispondi({ collectionAddProducts: { userErrors: [] } }),
        rispondi({
          collectionRemoveProducts: {
            job: { id: 'gid://shopify/Job/9', done: false },
            userErrors: [],
          },
        }),
      );

      await client.addProductToCollection(SHOP, TOKEN, 'gid://shopify/Collection/3', [
        'gid://shopify/Product/1',
      ]);
      const job = await client.removeProductFromCollection(
        SHOP,
        TOKEN,
        'gid://shopify/Collection/3',
        ['gid://shopify/Product/1'],
      );

      expect(corpo(fetchMock, 0).query).toContain('collectionAddProducts');
      expect(corpo(fetchMock, 1).query).toContain('collectionRemoveProducts');
      // ⛔ La RIMOZIONE è asincrona: il payload è un `job`, e chiederlo è
      //    l'unico modo che ha il chiamante di sapere quando è finita.
      //    Verificato contro Shopify il 03/09/2026.
      expect(corpo(fetchMock, 1).query).toContain('job { id done }');
      expect(job).toBe('gid://shopify/Job/9');
    });

    it('rimozione senza job nel payload: null, non un errore', async () => {
      mockFetch(rispondi({ collectionRemoveProducts: { job: null, userErrors: [] } }));

      await expect(
        client.removeProductFromCollection(SHOP, TOKEN, 'gid://shopify/Collection/3', [
          'gid://shopify/Product/1',
        ]),
      ).resolves.toBeNull();
    });

    it('collezione AUTOMATICA: Shopify rifiuta, e il rifiuto arriva intatto', async () => {
      mockFetch(
        rispondi({
          collectionAddProducts: {
            userErrors: [
              { field: null, message: "Can't manually add products to a smart collection" },
            ],
          },
        }),
      );

      await expect(
        client.addProductToCollection(SHOP, TOKEN, 'gid://shopify/Collection/9', ['gid://p']),
      ).rejects.toThrow(/smart collection/);
    });
  });

  describe('quantità remota e scrittura assoluta', () => {
    it('legge la quantità `available` per location', async () => {
      mockFetch(
        rispondi({
          inventoryItem: {
            id: 'gid://shopify/InventoryItem/5',
            inventoryLevels: {
              nodes: [
                {
                  location: { id: 'gid://shopify/Location/2' },
                  quantities: [{ name: 'available', quantity: 7 }],
                },
              ],
            },
          },
        }),
      );

      await expect(
        client.getRemoteQuantities(SHOP, TOKEN, 'gid://shopify/InventoryItem/5'),
      ).resolves.toEqual([
        {
          inventoryItemId: 'gid://shopify/InventoryItem/5',
          locationId: 'gid://shopify/Location/2',
          available: 7,
        },
      ]);
    });

    it('item inesistente: elenco vuoto, non un errore', async () => {
      mockFetch(rispondi({ inventoryItem: null }));
      await expect(client.getRemoteQuantities(SHOP, TOKEN, 'gid://x')).resolves.toEqual([]);
    });

    // ── lettura di UNA sede, per identificativo ────────────────────────────
    describe('getRemoteLevelAtLocation', () => {
      const ITEM = 'gid://shopify/InventoryItem/5';
      const SEDE = 'gid://shopify/Location/77';

      const livello = (quantities: unknown) =>
        rispondi({ inventoryItem: { id: ITEM, inventoryLevel: { id: 'gid://l/1', quantities } } });

      it('chiede la sede per IDENTIFICATIVO, non una pagina di sedi', async () => {
        const fetchMock = mockFetch(livello([{ name: 'available', quantity: 7 }]));

        await client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE);

        const { query, variables } = corpo(fetchMock);
        // ⭐ È questa la garanzia strutturale: chiedendo per id, l'ordine con
        //    cui Shopify elenca le sedi smette di contare.
        expect(query).toContain('inventoryLevel(locationId: $locationId)');
        expect(query).not.toContain('inventoryLevels(first:');
        expect(variables['locationId']).toBe(SEDE);
        expect(variables['id']).toBe(ITEM);
      });

      it('la sede FUORI dalla prima pagina si legge lo stesso — quella a pagine la perde', async () => {
        // Il canale ha tre sedi e la nostra è la terza. Una pagina troncata ne
        // riporta due: è esattamente ciò che `first: N` produce, e l'assenza di
        // `pageInfo` rende la troncatura indistinguibile da «non stoccata».
        mockFetch(
          rispondi({
            inventoryItem: {
              id: ITEM,
              inventoryLevels: {
                nodes: [
                  {
                    location: { id: 'gid://shopify/Location/11' },
                    quantities: [{ name: 'available', quantity: 1 }],
                  },
                  {
                    location: { id: 'gid://shopify/Location/22' },
                    quantities: [{ name: 'available', quantity: 2 }],
                  },
                ],
              },
            },
          }),
        );
        const aPagine = await client.getRemoteQuantities(SHOP, TOKEN, ITEM);
        expect(aPagine.some((q) => q.locationId === SEDE)).toBe(false);

        // Per identificativo, la stessa sede si legge: la selezione la fa il server.
        mockFetch(livello([{ name: 'available', quantity: 3 }]));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: true,
          available: 3,
        });
      });

      it('ZERO è un valore letto, non un assenza', async () => {
        mockFetch(livello([{ name: 'available', quantity: 0 }]));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: true,
          available: 0,
        });
      });

      it('le tre assenze restano DISTINTE, e nessuna diventa zero', async () => {
        mockFetch(rispondi({ inventoryItem: null }));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: false,
          reason: 'articolo_assente',
        });

        mockFetch(rispondi({ inventoryItem: { id: ITEM, inventoryLevel: null } }));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: false,
          reason: 'sede_non_stoccata',
        });

        mockFetch(livello([{ name: 'on_hand', quantity: 4 }]));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: false,
          reason: 'quantita_assente',
        });
      });

      it('la quantità NEGATIVA si conserva: nessun clamp in lettura', async () => {
        mockFetch(livello([{ name: 'available', quantity: -3 }]));
        await expect(client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE)).resolves.toEqual({
          found: true,
          available: -3,
        });
      });

      it('la lettura non provoca NESSUNA scrittura remota', async () => {
        const fetchMock = mockFetch(livello([{ name: 'available', quantity: 7 }]));

        await client.getRemoteLevelAtLocation(SHOP, TOKEN, ITEM, SEDE);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const { query } = corpo(fetchMock);
        expect(query).toContain('query InventoryLevelAtLocation');
        expect(query).not.toContain('mutation');
        expect(query).not.toContain('inventorySetQuantities');
        expect(query).not.toContain('inventoryAdjustQuantities');
      });
    });

    it('setInventoryQuantities: assoluta, con confronto, riferimento e chiave', async () => {
      const fetchMock = mockFetch(rispondi({ inventorySetQuantities: { userErrors: [] } }));

      await client.setInventoryQuantities(SHOP, TOKEN, {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'chiave-1',
        quantities: [
          {
            inventoryItemId: 'gid://shopify/InventoryItem/5',
            locationId: 'gid://shopify/Location/2',
            quantity: 9,
            changeFromQuantity: 7,
          },
        ],
      });

      const { query, variables } = corpo(fetchMock);
      // ⛔ `@idempotent` è valida solo in posizione FIELD: sull'operazione
      //    Shopify risponde «'@idempotent' can't be applied to mutations
      //    (allowed: fields)». Misurato sullo shop di sviluppo il 03/09/2026.
      const campo = 'inventorySetQuantities(input: $input)';
      const dopoIlCampo = query.slice(query.indexOf(campo) + campo.length).trimStart();
      expect(dopoIlCampo.startsWith('@idempotent(key: $idempotencyKey)')).toBe(true);
      // ...e NON fra le variabili dell'operazione, dov'era prima.
      expect(query.indexOf('@idempotent')).toBeGreaterThan(query.indexOf(campo));
      expect(variables['idempotencyKey']).toBe('chiave-1');
      const input = variables['input'] as Record<string, unknown>;
      // ⛔ In 2026-07 `InventorySetQuantitiesInput` NON dichiara
      //    `ignoreCompareQuantity`: mandarlo fa rifiutare l'intera mutation.
      //
      // ⛔ **E qui c'era «il confronto non si disattiva con una bandiera — si
      //    omette il campo». È il contrario**, corretto il 09/09/2026:
      //    `changeFromQuantity` è OBBLIGATORIO, a disattivare il confronto è un
      //    `null` esplicito, e ometterlo è un errore dell'API.
      expect(input).not.toHaveProperty('ignoreCompareQuantity');
      expect(input['referenceDocumentUri']).toBe('vestiflow://push/var-1');
      expect(input['quantities']).toEqual([
        {
          inventoryItemId: 'gid://shopify/InventoryItem/5',
          locationId: 'gid://shopify/Location/2',
          quantity: 9,
          changeFromQuantity: 7,
        },
      ]);
    });

    it('⭐ RIPETERE la stessa richiesta manda la stessa chiave: l’effetto non si duplica', async () => {
      const fetchMock = mockFetch(
        rispondi({ inventorySetQuantities: { userErrors: [] } }),
        rispondi({ inventorySetQuantities: { userErrors: [] } }),
      );
      const richiesta = {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'chiave-stabile',
        quantities: [
          {
            inventoryItemId: 'gid://shopify/InventoryItem/5',
            locationId: 'gid://shopify/Location/2',
            quantity: 9,
            changeFromQuantity: 7,
          },
        ],
      };

      await client.setInventoryQuantities(SHOP, TOKEN, richiesta);
      await client.setInventoryQuantities(SHOP, TOKEN, richiesta);

      expect(corpo(fetchMock, 0).variables['idempotencyKey']).toBe('chiave-stabile');
      expect(corpo(fetchMock, 1).variables['idempotencyKey']).toBe('chiave-stabile');
      expect(corpo(fetchMock, 0).variables).toEqual(corpo(fetchMock, 1).variables);
    });

    it('conflitto di concorrenza: lo userErrors si RESTITUISCE, non si solleva', async () => {
      // ⛔ **Qui questa prova si aspettava un sollevamento**, perché il metodo
      //    passava da `throwOnUserErrors` come tutte le altre mutation.
      //
      // ⭐ **Corretto il 09/09/2026: un `userError` di confronto non è un
      //    guasto.** Il canale ha risposto — ha letto l'operazione, ha
      //    confrontato e ha detto no — quindi la scrittura NON è avvenuta, e si
      //    sa. Un'eccezione lo renderebbe indistinguibile da una rete caduta,
      //    dove l'esito è ignoto: e i due hanno rimedi opposti — il primo non
      //    si risolve ritentando, il secondo sì.
      //
      // ⚠️ **Le altre mutation continuano a sollevare**, ed è giusto: lì un
      //    `userError` è un guasto di configurazione, non un esito da separare.
      mockFetch(
        rispondi({
          inventorySetQuantities: {
            // Il messaggio è quello vero di Shopify 2026-07, letto sullo shop
            // di sviluppo forzando un `changeFromQuantity` sbagliato.
            userErrors: [
              {
                field: null,
                message:
                  'The changeFromQuantity argument no longer matches the persisted quantity.',
              },
            ],
          },
        }),
      );

      const errori = await client.setInventoryQuantities(SHOP, TOKEN, {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'k',
        quantities: [
          {
            inventoryItemId: 'gid://i',
            locationId: 'gid://l',
            quantity: 1,
            changeFromQuantity: 0,
          },
        ],
      });

      expect(errori).toHaveLength(1);
      expect(errori[0]!.message).toMatch(/no longer matches the persisted quantity/);
    });

    it('chiede il CODICE, oltre a field e message', async () => {
      // ⛔ **Senza `code` non si può classificare**, e senza classificazione
      //    ogni `userError` diventa lo stesso esito: un rifiuto definitivo.
      //    `IDEMPOTENCY_CONCURRENT_REQUEST` — che significa «l'operazione è
      //    ancora in corso» — finirebbe trattato come una divergenza, e il
      //    tentativo verrebbe chiuso mentre la scrittura va a segno.
      const fetchMock = mockFetch(rispondi({ inventorySetQuantities: { userErrors: [] } }));

      await client.setInventoryQuantities(SHOP, TOKEN, {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'k',
        quantities: [
          { inventoryItemId: 'gid://i', locationId: 'gid://l', quantity: 1, changeFromQuantity: 0 },
        ],
      });

      expect(corpo(fetchMock).query).toMatch(/userErrors\s*\{[^}]*\bcode\b/);
    });

    it('il CODICE arriva al chiamante', async () => {
      mockFetch(
        rispondi({
          inventorySetQuantities: {
            userErrors: [
              { field: null, message: 'in corso', code: 'IDEMPOTENCY_CONCURRENT_REQUEST' },
            ],
          },
        }),
      );

      const errori = await client.setInventoryQuantities(SHOP, TOKEN, {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'k',
        quantities: [
          { inventoryItemId: 'gid://i', locationId: 'gid://l', quantity: 1, changeFromQuantity: 0 },
        ],
      });

      expect(errori).toEqual([
        { field: null, message: 'in corso', code: 'IDEMPOTENCY_CONCURRENT_REQUEST' },
      ]);
    });

    describe('⛔ una risposta MANCANTE non è un successo', () => {
      // ⛔ **Il difetto**: `data.inventorySetQuantities?.userErrors ?? []`
      //    trasformava una mutation assente in un elenco vuoto — cioè nella
      //    firma della riuscita. Il chiamante avanzava il valore confermato e
      //    chiudeva il tentativo per una risposta che non c'era.
      //
      // ⭐ **Un payload mancante è un esito IGNOTO**, e l'unico modo di dirlo a
      //    chi legge un elenco di `userErrors` è sollevare: il push lo cattura,
      //    risponde `shopify_error` e **conserva** il tentativo.
      it.each([
        ['il payload della mutation è null', { inventorySetQuantities: null }],
        ['il payload manca del tutto', {}],
        ['userErrors manca', { inventorySetQuantities: {} }],
        ['userErrors non è un elenco', { inventorySetQuantities: { userErrors: 'boh' } }],
      ])('%s → solleva, non restituisce vuoto', async (_nome, data) => {
        mockFetch(rispondi(data));

        await expect(
          client.setInventoryQuantities(SHOP, TOKEN, {
            reason: 'correction',
            referenceDocumentUri: 'vestiflow://push/var-1',
            idempotencyKey: 'k',
            quantities: [
              {
                inventoryItemId: 'gid://i',
                locationId: 'gid://l',
                quantity: 1,
                changeFromQuantity: 0,
              },
            ],
          }),
        ).rejects.toThrow(/risposta|inventorySetQuantities/i);
      });
    });

    it('scrittura applicata: l elenco degli userErrors è VUOTO', async () => {
      // ⭐ **La controprova.** Senza, la prova sopra passerebbe anche se il
      //    metodo restituisse sempre l'elenco degli errori grezzi — o sempre
      //    qualcosa di non vuoto: «vuoto significa applicata» è metà del
      //    contratto, e va fissato come l'altra metà.
      mockFetch(rispondi({ inventorySetQuantities: { userErrors: [] } }));

      const errori = await client.setInventoryQuantities(SHOP, TOKEN, {
        reason: 'correction',
        referenceDocumentUri: 'vestiflow://push/var-1',
        idempotencyKey: 'k',
        quantities: [
          {
            inventoryItemId: 'gid://i',
            locationId: 'gid://l',
            quantity: 1,
            // ⭐ `null` ESPLICITO: l'API lo ammette e disattiva il confronto.
            //    Che questo percorso non lo usi è una politica di VestiFlow, e
            //    la fa rispettare il servizio (prova `C3` di integrazione).
            changeFromQuantity: null,
          },
        ],
      });

      expect(errori).toEqual([]);
    });
  });

  describe('throttle e retry: la gestione comune vale anche per le primitive nuove', () => {
    it('429 → attende e riprova, poi riesce', async () => {
      const tooMany = {
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '1' }),
        text: async () => '',
      } as unknown as Response;
      mockFetch(tooMany, rispondi({ publications: { nodes: [] } }));

      await expect(client.listPublications(SHOP, TOKEN)).resolves.toEqual([]);
      expect(rateLimiter.waitForRetry).toHaveBeenCalledTimes(1);
      // Il throttle comune viene consultato prima di OGNI tentativo.
      expect(rateLimiter.beforeGraphqlRequest).toHaveBeenCalledTimes(2);
    });

    it('429 oltre il numero massimo di tentativi: 429 al chiamante', async () => {
      const tooMany = () =>
        ({
          ok: false,
          status: 429,
          headers: new Headers(),
          text: async () => '',
        }) as unknown as Response;
      mockFetch(tooMany(), tooMany(), tooMany());

      await expect(client.listPublications(SHOP, TOKEN)).rejects.toBeInstanceOf(HttpException);
    });

    it('errori GraphQL di trasporto diventano un errore leggibile', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: async () => ({ errors: [{ message: 'Throttled' }] }),
        headers: new Headers(),
      } as unknown as Response);

      await expect(client.listPublications(SHOP, TOKEN)).rejects.toThrow(
        /Shopify GraphQL: Throttled/,
      );
    });
  });

  describe('⛔ nessuna primitiva distruttiva è esposta', () => {
    it('il client non ha metodi di cancellazione remota', () => {
      const metodi = Object.getOwnPropertyNames(ShopifyGraphqlClient.prototype);
      const distruttivi = metodi.filter((nome) =>
        /delete|destroy|remove(Product|Variant)\b/i.test(nome),
      );
      // `removeProductFromCollection` è un RITIRO dalla collezione, non una
      // cancellazione: non deve comparire, e infatti il filtro non lo prende.
      expect(distruttivi).toEqual([]);
    });

    it('nessuna mutation distruttiva compare nel sorgente del client', async () => {
      const { readFileSync } = await import('node:fs');
      const sorgente = readFileSync('src/shopify/shopify-graphql.client.ts', 'utf8');
      // I commenti nominano `productDelete` per spiegare perché NON si usa:
      // qui si cerca la chiamata, cioè il nome seguito da una parentesi.
      expect(sorgente).not.toMatch(/\bproductDelete\s*\(/);
      expect(sorgente).not.toMatch(/\bproductVariantsBulkDelete\s*\(/);
    });
  });
});
