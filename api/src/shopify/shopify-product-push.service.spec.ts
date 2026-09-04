import { ProductStatus, ShopifyConnectionStatus, ShopifySyncStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { SYNC_DISABLE_FAILED_MESSAGE } from './shopify-user-error.util';
import { ShopifyProductPushService } from './shopify-product-push.service';

/**
 * Punto di USCITA verso Shopify (§sei decimali): il prezzo memorizzato può
 * portare la coda decimale di uno scorporo IVA, il payload no. Qui si verifica
 * quello che parte davvero, non la funzione di conversione — quella ha il suo
 * test in `shopify-money.util.spec.ts`.
 */
describe('ShopifyProductPushService — prezzo nel payload', () => {
  function createService(
    shopifyPriceMinor: number,
    overrides: Record<string, unknown> = {},
    graphqlOverrides: Record<string, unknown> = {},
  ) {
    const product = {
      id: 'prod-1',
      tenantId: 'tenant-1',
      name: 'Maglietta',
      description: null,
      status: ProductStatus.active,
      shopifySyncEnabled: true,
      shopifyProductId: null,
      brand: null,
      category: null,
      tags: [],
      options: [],
      compareAtPriceMinor: null,
      shopifyTaxonomyCategoryId: null,
      season: null,
      variants: [
        {
          id: 'var-1',
          sku: 'SKU-1',
          barcode: null,
          optionValues: [],
          shopifyPriceMinor,
          purchasePriceMinor: null,
          shopifyVariantId: null,
          shopifyInventoryItemId: null,
        },
      ],
      images: [],
      ...overrides,
    };

    const prisma = {
      shopifyConnection: {
        findUnique: vi.fn().mockResolvedValue({
          status: ShopifyConnectionStatus.connected,
          scopes: ['write_products'],
        }),
      },
      shopifyCredential: { findUnique: vi.fn().mockResolvedValue({ scopes: ['write_products'] }) },
      product: {
        findFirst: vi.fn().mockResolvedValue(product),
        findUnique: vi.fn().mockResolvedValue({ shopifySyncStatus: ShopifySyncStatus.synced }),
        update: vi.fn().mockResolvedValue(product),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      productImage: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (ops: readonly Promise<unknown>[]) => Promise.all(ops)),
    };

    const shopifyGraphql = {
      updateProductCatalog: vi
        .fn()
        .mockResolvedValue({ id: 'gid://shopify/Product/111', status: 'ACTIVE' }),
      setProductStatus: vi.fn(),
      getProductTitle: vi.fn().mockResolvedValue('Titolo scritto su Shopify'),
      listProductVariants: vi.fn().mockResolvedValue([]),
      bulkUpdateVariants: vi.fn(),
      listProductMedia: vi.fn().mockResolvedValue([]),
      addProductMedia: vi.fn().mockResolvedValue([]),
      ...graphqlOverrides,
    };

    const shopifyAdmin = {
      createProduct: vi.fn().mockResolvedValue({ id: 111, variants: [], images: [] }),
      listProductMetafields: vi.fn().mockResolvedValue([]),
      upsertProductMetafield: vi.fn(),
      updateInventoryItemCost: vi.fn(),
      createProductImage: vi.fn(),
    };

    const service = new ShopifyProductPushService(
      prisma as unknown as PrismaService,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'shop.myshopify.com', accessToken: 'shpat_test' }),
      } as unknown as ShopifyOAuthService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      {
        markSynced: vi.fn(),
        markError: vi.fn(),
        touchSync: vi.fn(),
      } as unknown as ShopifyConnectionService,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as unknown as ShopifyTaxonomyService,
      {
        buildMetafields: vi.fn().mockResolvedValue([]),
      } as unknown as ShopifyCategoryMetafieldsService,
      shopifyGraphql as unknown as ShopifyGraphqlClient,
    );

    return { service, shopifyAdmin, shopifyGraphql, prisma };
  }

  function pushedPrice(payload: unknown): unknown {
    const product = (payload as { product?: Record<string, unknown> }).product ?? payload;
    const variants = (product as { variants?: Record<string, unknown>[] }).variants ?? [];
    return variants[0]?.['price'];
  }

  it('pubblica due decimali quando il netto porta la coda decimale', async () => {
    // 123,97 ivati al 22% valgono 10161,4754 centesimi netti.
    const { service, shopifyAdmin } = createService(10161.4754);

    await service.pushProduct('tenant-1', 'prod-1');

    const payload = shopifyAdmin.createProduct.mock.calls[0]?.[2];
    expect(pushedPrice(payload)).toBe('101.61');
  });

  it('un prezzo intero resta quello che era', async () => {
    const { service, shopifyAdmin } = createService(2990);

    await service.pushProduct('tenant-1', 'prod-1');

    const payload = shopifyAdmin.createProduct.mock.calls[0]?.[2];
    expect(pushedPrice(payload)).toBe('29.90');
  });

  /**
   * Il push di un prodotto GIÀ COLLEGATO passa da GraphQL (docs/24 §1.6, primo
   * pezzo della Tranche 2). Qui si misura che passi di lì, che un errore resti
   * visibile senza toccare il dato locale, e che le varianti senza id vengano
   * abbinate solo se univoche — mai saltate, mai create.
   */
  describe('ShopifyProductPushService — prodotto collegato via GraphQL', () => {
    const collegato = {
      shopifyProductId: '111',
      name: 'Maglia cotone',
      // Il caso normale: il «Nome Shopify» è già stato inizializzato, e coincide
      // col nome interno finché nessuno dei due viene cambiato.
      shopifyTitle: 'Maglia cotone',
      description: 'Descrizione',
      variants: [
        {
          id: 'var-1',
          sku: 'SKU-1',
          barcode: '8001',
          optionValues: [],
          shopifyPriceMinor: 2990,
          purchasePriceMinor: null,
          shopifyVariantId: '501',
          shopifyInventoryItemId: '601',
        },
      ],
    };

    it('⭐ la modifica va su GraphQL — productUpdate e productVariantsBulkUpdate — e NON sul REST', async () => {
      const { service, shopifyAdmin, shopifyGraphql } = createService(2990, collegato);

      await service.pushProduct('tenant-1', 'prod-1');

      expect(shopifyGraphql.updateProductCatalog).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'shpat_test',
        expect.objectContaining({
          id: 'gid://shopify/Product/111',
          title: 'Maglia cotone',
          status: 'ACTIVE',
        }),
      );
      expect(shopifyGraphql.bulkUpdateVariants).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'shpat_test',
        'gid://shopify/Product/111',
        [
          expect.objectContaining({
            id: 'gid://shopify/ProductVariant/501',
            price: '29.90',
            barcode: '8001',
            inventoryItem: { sku: 'SKU-1' },
          }),
        ],
      );
      // ⛔ Nessun fallback e nessuna scrittura REST di catalogo.
      expect(shopifyAdmin.createProduct).not.toHaveBeenCalled();
    });

    it('⭐ lo stato Shopify segue il ProductStatus locale: è il riallineamento alla riaccensione', async () => {
      const { service, shopifyGraphql } = createService(2990, {
        ...collegato,
        status: ProductStatus.draft,
      });

      await service.pushProduct('tenant-1', 'prod-1');

      expect(shopifyGraphql.updateProductCatalog).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: 'DRAFT' }),
      );
    });

    /*
      ⛔ Un errore remoto lascia il dato locale salvato e uno stato di errore
      VISIBILE: qui il push non rilancia, marca. Su un prodotto collegato il
      servizio distingue «out_of_sync» (esiste, va riallineato) da «error».
    */
    it('⛔ un errore GraphQL non rilancia: lascia uno stato visibile con il messaggio', async () => {
      const { service, prisma } = createService(2990, collegato, {
        updateProductCatalog: vi
          .fn()
          .mockRejectedValue(new Error('Shopify productUpdate: title troppo lungo')),
      });

      await service.pushProduct('tenant-1', 'prod-1');

      // Il push non rilancia e non torna indietro: l'esito è sul prodotto.
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopifyLastError: expect.stringContaining('title troppo lungo'),
          }),
        }),
      );
    });

    it('⭐ una variante senza id viene abbinata SOLO se univoca, e poi aggiornata', async () => {
      const orfana = {
        ...collegato,
        variants: [
          { ...collegato.variants[0], shopifyVariantId: null, shopifyInventoryItemId: null },
        ],
      };
      const { service, shopifyGraphql, prisma } = createService(2990, orfana, {
        listProductVariants: vi
          .fn()
          .mockResolvedValue([
            {
              id: 'gid://shopify/ProductVariant/777',
              sku: 'SKU-1',
              barcode: null,
              inventoryItemId: 'gid://shopify/InventoryItem/888',
              selectedOptions: [],
            },
          ]),
      });

      await service.pushProduct('tenant-1', 'prod-1');

      // L'id si salva NUMERICO, come quelli già presenti.
      expect(prisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { shopifyVariantId: '777', shopifyInventoryItemId: '888' },
        }),
      );
      expect(shopifyGraphql.bulkUpdateVariants).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [expect.objectContaining({ id: 'gid://shopify/ProductVariant/777' })],
      );
    });

    it('⛔ con due candidate il push si FERMA con un errore che nomina la variante: niente salti, niente creazioni', async () => {
      const orfana = {
        ...collegato,
        variants: [
          { ...collegato.variants[0], shopifyVariantId: null, shopifyInventoryItemId: null },
        ],
      };
      const { service, shopifyGraphql, prisma } = createService(2990, orfana, {
        listProductVariants: vi.fn().mockResolvedValue([
          {
            id: 'gid://shopify/ProductVariant/1',
            sku: 'SKU-1',
            barcode: null,
            inventoryItemId: null,
            selectedOptions: [],
          },
          {
            id: 'gid://shopify/ProductVariant/2',
            sku: 'SKU-1',
            barcode: null,
            inventoryItemId: null,
            selectedOptions: [],
          },
        ]),
      });

      await service.pushProduct('tenant-1', 'prod-1');

      expect(shopifyGraphql.bulkUpdateVariants).not.toHaveBeenCalled();
      expect(shopifyGraphql.updateProductCatalog).not.toHaveBeenCalled();
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shopifyLastError: expect.stringContaining('SKU-1') }),
        }),
      );
    });

    // ⛔ Qui c'era una prova che diceva «un'immagine già su Shopify si riconosce
    //    dallo stesso URL d'origine e non si ricarica». Sullo shop di sviluppo
    //    quel caso NON SI VERIFICA MAI: `originalSource.url` è un URL firmato che
    //    Shopify genera da sé e che cambia a ogni lettura (misurato il 03/09/2026).
    //    La prova era verde con un mock che nessuna risposta reale produce.
    it("⭐ l'immagine caricata prende l'id del media NUOVO, riconosciuto per differenza", async () => {
      const { service, shopifyGraphql, prisma } = createService(2990, collegato, {
        // Il prodotto ha già un media suo; la mutation li restituisce TUTTI.
        listProductMedia: vi.fn().mockResolvedValue([{ id: 'gid://shopify/MediaImage/1' }]),
        addProductMedia: vi
          .fn()
          .mockResolvedValue([
            { id: 'gid://shopify/MediaImage/1' },
            { id: 'gid://shopify/MediaImage/9' },
          ]),
      });
      prisma.productImage.findMany.mockResolvedValue([
        { id: 'img-1', url: 'https://locale/x.jpg', altText: null, sortOrder: 0 },
      ]);

      await service.pushProduct('tenant-1', 'prod-1');

      expect(shopifyGraphql.addProductMedia).toHaveBeenCalledOnce();
      // Il legame che impedisce il duplicato al salvataggio dopo.
      expect(prisma.productImage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'img-1' },
          data: { shopifyImageId: 'gid://shopify/MediaImage/9' },
        }),
      );
    });

    it('⛔ si cercano SOLO le immagini senza legame, e se non ce ne sono non si carica niente', async () => {
      const { service, shopifyGraphql, prisma } = createService(2990, collegato);

      await service.pushProduct('tenant-1', 'prod-1');

      // Il filtro È la protezione dal duplicato: senza, un'immagine già caricata
      // tornerebbe pendente a ogni salvataggio.
      expect(prisma.productImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId: 'prod-1', shopifyImageId: null }),
        }),
      );
      expect(shopifyGraphql.addProductMedia).not.toHaveBeenCalled();
    });

    it('⛔ «Sincronizza con Shopify» spento su un collegato → ARCHIVED, senza toccare il mapping', async () => {
      const { service, shopifyGraphql, prisma } = createService(2990, {
        ...collegato,
        shopifySyncEnabled: false,
      });

      const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

      expect(result).toEqual({ pushed: true });
      expect(shopifyGraphql.setProductStatus).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'shpat_test',
        'gid://shopify/Product/111',
        'ARCHIVED',
      );
      // Mapping intatto: nessun update azzera gli id.
      const azzeramenti = prisma.product.update.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as { data?: Record<string, unknown> }).data?.['shopifyProductId'] === null,
      );
      expect(azzeramenti).toHaveLength(0);
    });

    it('un prodotto non collegato non ha niente da archiviare', async () => {
      const { service, shopifyGraphql } = createService(2990, { shopifySyncEnabled: false });

      const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

      expect(result).toEqual({ pushed: false, reason: 'not_linked' });
      expect(shopifyGraphql.setProductStatus).not.toHaveBeenCalled();
    });

    // ⭐ «Nome Shopify»: il titolo con cui il prodotto si vende, separato dal nome
    //    interno con cui lo si cerca in magazzino (docs/24 §1.9).
    describe('il nome interno non parte per Shopify', () => {
      it('⛔ collegato SENZA nome Shopify: si LEGGE quello remoto — il nome di magazzino non parte', async () => {
        const { service, shopifyGraphql, prisma } = createService(2990, {
          ...collegato,
          name: 'MAGL-COT-BLU',
          shopifyTitle: null,
        });

        await service.pushProduct('tenant-1', 'prod-1');
        await vi.waitFor(() => expect(shopifyGraphql.updateProductCatalog).toHaveBeenCalled());

        // Il danno da evitare: rimandare su Shopify il nome corto di magazzino.
        const [[, , input]] = shopifyGraphql.updateProductCatalog.mock.calls as [
          [string, string, { title: string }],
        ];
        expect(input.title).toBe('Titolo scritto su Shopify');
        expect(input.title).not.toBe('MAGL-COT-BLU');
        // E si salva UNA volta: il filtro `shopifyTitle: null` è la garanzia.
        expect(prisma.product.updateMany).toHaveBeenCalledWith({
          where: { id: 'prod-1', shopifyTitle: null },
          data: { shopifyTitle: 'Titolo scritto su Shopify' },
        });
      });

      it('⭐ collegato CON nome Shopify: parte quello, e Shopify non viene interrogato', async () => {
        const { service, shopifyGraphql } = createService(2990, {
          ...collegato,
          name: 'MAGL-COT-BLU',
          shopifyTitle: 'Maglia in cotone blu — collezione estate',
        });

        await service.pushProduct('tenant-1', 'prod-1');
        await vi.waitFor(() => expect(shopifyGraphql.updateProductCatalog).toHaveBeenCalled());

        const [[, , input]] = shopifyGraphql.updateProductCatalog.mock.calls as [
          [string, string, { title: string }],
        ];
        expect(input.title).toBe('Maglia in cotone blu — collezione estate');
        // Già inizializzato: nessuna lettura, nessuna riscrittura.
        expect(shopifyGraphql.getProductTitle).not.toHaveBeenCalled();
      });
    });

    // ⛔ Spegnere è un'operazione sola: flag locale + prodotto archiviato. Se la
    //    seconda metà non arriva, la prima si annulla — altrimenti il prodotto
    //    resta in vendita con le giacenze ferme.
    describe('la disattivazione non si spezza a metà', () => {
      it('⭐ archiviazione CONFERMATA: il flag resta spento e i push restano fermi', async () => {
        const { service, prisma } = createService(2990, {
          ...collegato,
          shopifySyncEnabled: false,
        });

        const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        expect(result).toEqual({ pushed: true });
        // Nessun annullamento: il flag NON viene riacceso.
        expect(prisma.product.updateMany).not.toHaveBeenCalled();
      });

      it('⛔ Shopify RIFIUTA: il flag torna acceso, e il messaggio dice che il prodotto può essere in vendita', async () => {
        const { service, prisma } = createService(
          2990,
          { ...collegato, shopifySyncEnabled: false },
          {
            setProductStatus: vi
              .fn()
              .mockRejectedValue(new Error('Shopify productUpdate: Product cannot be archived')),
          },
        );

        const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
        const [chiamata] = prisma.product.updateMany.mock.calls as [
          [{ where: Record<string, unknown>; data: Record<string, unknown> }],
        ];
        expect(chiamata[0].data).toMatchObject({
          // Le giacenze ricominciano a viaggiare: è la metà che NON si può lasciare a metà.
          shopifySyncEnabled: true,
          shopifySyncStatus: 'out_of_sync',
        });
        // La conseguenza prima della causa: «rifiutato» non dice che cosa si rischia.
        expect(chiamata[0].data['shopifyLastError']).toContain(SYNC_DISABLE_FAILED_MESSAGE);
        expect(chiamata[0].data['shopifyLastError']).toContain('cannot be archived');
      });

      it('⛔ Shopify NON RISPONDE: stesso contratto — la rete che cade non è un caso diverso', async () => {
        const { service, prisma } = createService(
          2990,
          { ...collegato, shopifySyncEnabled: false },
          { setProductStatus: vi.fn().mockRejectedValue(new Error('connect ETIMEDOUT')) },
        );

        const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
        const [chiamata] = prisma.product.updateMany.mock.calls as [
          [{ data: Record<string, unknown> }],
        ];
        expect(chiamata[0].data).toMatchObject({ shopifySyncEnabled: true });
        expect(chiamata[0].data['shopifyLastError']).toContain(SYNC_DISABLE_FAILED_MESSAGE);
      });

      it('⭐ ripetere non duplica: l\'annullamento tocca SOLO chi è ancora spento', async () => {
        const { service, prisma } = createService(
          2990,
          { ...collegato, shopifySyncEnabled: false },
          { setProductStatus: vi.fn().mockRejectedValue(new Error('rate limit')) },
        );

        await service.archiveOnSyncDisabled('tenant-1', 'prod-1');
        await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        // Il filtro è la garanzia: chi ha già il flag acceso non viene toccato,
        // e una seconda passata non sovrascrive una decisione più recente.
        for (const [arg] of prisma.product.updateMany.mock.calls as [
          [{ where: Record<string, unknown> }],
        ][]) {
          expect(arg.where).toMatchObject({
            id: 'prod-1',
            tenantId: 'tenant-1',
            shopifySyncEnabled: false,
          });
        }
      });

      it('⛔ guasto PRIMA di Shopify: annulla lo stesso, e non solleva', async () => {
        const { service, prisma, shopifyGraphql } = createService(2990, {
          ...collegato,
          shopifySyncEnabled: false,
        });
        // La lettura del prodotto stava fuori dal try: un guasto qui lasciava il
        // flag spento senza aver mai archiviato — la metà pericolosa.
        prisma.product.findFirst.mockRejectedValue(new Error('connessione al database persa'));

        const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        expect(result).toEqual({ pushed: false, reason: 'shopify_error' });
        expect(shopifyGraphql.setProductStatus).not.toHaveBeenCalled();
        const [chiamata] = prisma.product.updateMany.mock.calls as [
          [{ data: Record<string, unknown> }],
        ];
        expect(chiamata[0].data).toMatchObject({ shopifySyncEnabled: true });
      });

      it('⭐ mai collegato: nessuna chiamata, e lo spegnimento NON si annulla', async () => {
        const { service, prisma, shopifyGraphql } = createService(2990, {
          shopifySyncEnabled: false,
        });

        const result = await service.archiveOnSyncDisabled('tenant-1', 'prod-1');

        expect(result).toEqual({ pushed: false, reason: 'not_linked' });
        expect(shopifyGraphql.setProductStatus).not.toHaveBeenCalled();
        // Il flag resta spento: non c'è niente in vendita da cui proteggersi.
        expect(prisma.product.updateMany).not.toHaveBeenCalled();
      });
    });
  });
});
