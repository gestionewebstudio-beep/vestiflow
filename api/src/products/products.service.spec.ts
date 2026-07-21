import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyProductPushService } from '../shopify/shopify-product-push.service';
import type { ShopifyTaxonomyLocalizationService } from '../shopify/shopify-taxonomy-localization.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const tenantId = 'tenant-1';

  // Utenti per i controlli sul costo d'acquisto (dato sensibile §permessi).
  const userWithCosts = {
    role: 'owner',
    permissions: [],
    supportSession: false,
  } as never;
  const userWithoutCosts = {
    role: 'staff',
    permissions: ['catalog.view'],
    supportSession: false,
  } as never;

  // Riga variante con costo valorizzato, per i test di visibilità.
  const variantRowWithCost = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-1',
    barcode: '8001234567890',
    optionValues: [{ name: 'Taglia', value: 'M' }],
    currency: 'EUR',
    sellingPriceMinor: 1990,
    purchasePriceMinor: 990,
    product: { name: 'Maglietta' },
  } as never;

  function createService() {
    const prisma = {
      product: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      productVariant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      stockMovement: { count: vi.fn() },
      $transaction: vi.fn(),
    };
    // La tx condivide le mock del client radice: create/duplicate ora creano
    // il prodotto DENTRO la transazione (generazione codice articolo atomica)
    // e i test osservano comunque prisma.product.create. $queryRaw copre
    // advisory lock + max progressivo (nessun codice esistente: parte da 00001).
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)({
            product: prisma.product,
            productVariant: {
              ...prisma.productVariant,
              findMany: vi.fn().mockResolvedValue([]),
              delete: vi.fn(),
            },
            inventoryLevel: { deleteMany: vi.fn() },
            stockMovement: { count: vi.fn().mockResolvedValue(0) },
            $queryRaw: vi.fn().mockResolvedValue([]),
          })
        : Promise.all(arg as Promise<unknown>[]),
    );
    const taxonomyLocalization = {
      prepareCategories: vi.fn().mockResolvedValue(undefined),
      prepareProductLocalization: vi.fn().mockResolvedValue(undefined),
      localizeProductForResponseSync: vi.fn((product: unknown) => product),
    };
    const channelSync = { enqueueProductPush: vi.fn() };
    const shopifyProductPush = {
      deleteProduct: vi.fn(),
      enqueuePush: vi.fn(),
    };

    const service = new ProductsService(
      prisma as unknown as PrismaService,
      shopifyProductPush as unknown as ShopifyProductPushService,
      channelSync as unknown as ChannelSyncFacade,
      taxonomyLocalization as unknown as ShopifyTaxonomyLocalizationService,
    );

    return { service, prisma, shopifyProductPush, channelSync };
  }

  it('list pagina prodotti con taxonomy preparata', async () => {
    const { service, prisma } = createService();
    const items = [{ id: 'prod-1', name: 'Maglietta', variants: [], images: [] }];
    prisma.product.findMany.mockResolvedValue(items);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'prod-1', name: 'Maglietta' });
    expect(result.total).toBe(1);
  });

  it('getById lancia NotFoundException se assente', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checkSkuAvailability segnala SKU libero o occupato', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'var-1' });

    await expect(service.checkSkuAvailability(tenantId, 'SKU-NEW')).resolves.toEqual({
      sku: 'SKU-NEW',
      available: true,
    });
    await expect(service.checkSkuAvailability(tenantId, 'SKU-TAKEN')).resolves.toEqual({
      sku: 'SKU-TAKEN',
      available: false,
    });
  });

  it('checkBarcodeAvailability segnala barcode libero o occupato', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'var-1' });

    await expect(service.checkBarcodeAvailability(tenantId, '8001234567890')).resolves.toEqual({
      barcode: '8001234567890',
      available: true,
    });
    await expect(service.checkBarcodeAvailability(tenantId, '8009999999999')).resolves.toEqual({
      barcode: '8009999999999',
      available: false,
    });
  });

  it('create rifiuta barcode duplicati nel payload', async () => {
    const { service } = createService();
    const variant = {
      sku: 'SKU-1',
      sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      optionValues: {},
      barcode: '8001234567890',
    };

    await expect(
      service.create(tenantId, {
        name: 'Prodotto',
        status: 'active',
        options: [],
        variants: [variant, { ...variant, sku: 'SKU-2' }],
      } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('findVariantByCode risolve per SKU', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue({
      id: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-1',
      barcode: null,
      product: { id: 'prod-1', name: 'Giacca', managesStock: true },
    });

    await expect(service.findVariantByCode(tenantId, 'SKU-1')).resolves.toEqual({
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-1',
      barcode: null,
      productName: 'Giacca',
      managesStock: true,
    });
  });

  it('delete rifiuta prodotto con movimenti di magazzino', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: null,
      catalogOrigin: 'vestiflow',
    });
    prisma.stockMovement.count.mockResolvedValue(2);

    await expect(service.delete(tenantId, 'prod-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('delete rifiuta prodotto importato da Shopify', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: '999',
      catalogOrigin: 'shopify',
    });

    await expect(service.delete(tenantId, 'prod-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.stockMovement.count).not.toHaveBeenCalled();
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('getById restituisce prodotto localizzato', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Giacca',
      description: 'Desc',
      variants: [],
      images: [],
    });

    await expect(service.getById(tenantId, 'prod-1')).resolves.toMatchObject({
      id: 'prod-1',
      name: 'Giacca',
    });
  });

  it('create rifiuta SKU duplicati nel payload', async () => {
    const { service } = createService();
    const variant = {
      sku: 'SKU-DUP',
      sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      optionValues: {},
    };

    await expect(
      service.create(tenantId, {
        name: 'Prodotto',
        status: 'active',
        options: [],
        variants: [variant, variant],
      } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('delete elimina prodotto senza movimenti', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', shopifyProductId: null });
    prisma.stockMovement.count.mockResolvedValue(0);
    prisma.product.delete.mockResolvedValue({});

    await service.delete(tenantId, 'prod-1');

    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
  });

  it('syncToShopify accoda push dopo verifica prodotto', async () => {
    const { service, prisma, shopifyProductPush } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Giacca',
      description: null,
      variants: [],
      images: [],
    });
    shopifyProductPush.enqueuePush.mockResolvedValue({ queued: true });

    await expect(service.syncToShopify(tenantId, 'prod-1')).resolves.toEqual({ queued: true });
    expect(shopifyProductPush.enqueuePush).toHaveBeenCalledWith(tenantId, 'prod-1');
  });

  it('create persiste prodotto con varianti', async () => {
    const { service, prisma, channelSync } = createService();
    const created = {
      id: 'prod-new',
      name: 'Maglietta',
      description: null,
      variants: [{ id: 'var-1', sku: 'SKU-NEW' }],
      images: [],
    };
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findFirst.mockResolvedValue(created);

    await expect(
      service.create(tenantId, {
        name: 'Maglietta',
        status: 'active',
        options: [],
        variants: [
          {
            sku: 'SKU-NEW',
            sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
            optionValues: { Taglia: 'M' },
          },
        ],
      } as never),
    ).resolves.toMatchObject({ id: 'prod-new', name: 'Maglietta' });

    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith(tenantId, 'prod-new');
  });

  it('create persiste prodotto senza SKU (creazione rapida: solo nome)', async () => {
    const { service, prisma } = createService();
    const created = {
      id: 'prod-new',
      name: 'Maglietta base',
      description: null,
      variants: [{ id: 'var-1', sku: null }],
      images: [],
    };
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findFirst.mockResolvedValue(created);

    await expect(
      service.create(tenantId, {
        name: 'Maglietta base',
        status: 'active',
        options: [],
        variants: [
          {
            sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
            optionValues: {},
          },
        ],
      } as never),
    ).resolves.toMatchObject({ id: 'prod-new', name: 'Maglietta base' });

    // Nessuna verifica di unicita' ne' errore per SKU assente: mai bloccante.
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    const createCall = prisma.product.create.mock.calls[0]?.[0];
    expect(createCall.data.variants.create[0].sku).toBeNull();
  });

  it('findVariantByCode rifiuta codice vuoto', async () => {
    const { service } = createService();

    await expect(service.findVariantByCode(tenantId, '   ')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('delete rifiuta se Shopify non connesso su prodotto sincronizzato', async () => {
    const { service, prisma, shopifyProductPush } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    shopifyProductPush.deleteProduct.mockResolvedValue({ reason: 'not_connected' });

    await expect(service.delete(tenantId, 'prod-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('delete rimuove prodotto sincronizzato dopo delete su Shopify', async () => {
    const { service, prisma, shopifyProductPush } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    shopifyProductPush.deleteProduct.mockResolvedValue({ deleted: true });
    prisma.product.delete.mockResolvedValue({});

    await service.delete(tenantId, 'prod-1');

    expect(shopifyProductPush.deleteProduct).toHaveBeenCalledWith(
      tenantId,
      'gid://shopify/Product/1',
    );
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
  });

  it('delete rifiuta se Shopify API fallisce su prodotto sincronizzato', async () => {
    const { service, prisma, shopifyProductPush } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    shopifyProductPush.deleteProduct.mockResolvedValue({ reason: 'shopify_error' });

    await expect(service.delete(tenantId, 'prod-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('create rifiuta SKU già presenti a catalogo', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([{ sku: 'SKU-TAKEN' }]);

    await expect(
      service.create(tenantId, {
        name: 'Prodotto',
        status: 'active',
        options: [],
        variants: [
          {
            sku: 'SKU-TAKEN',
            sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            optionValues: {},
          },
        ],
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update modifica nome prodotto', async () => {
    const { service, prisma, channelSync } = createService();
    const product = {
      id: 'prod-1',
      name: 'Vecchio',
      description: 'Desc',
      variants: [],
      images: [],
    };
    prisma.product.findFirst.mockResolvedValue(product);

    await expect(
      service.update(tenantId, 'prod-1', { name: 'Nuovo nome' }),
    ).resolves.toMatchObject({ id: 'prod-1', name: 'Vecchio' });

    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith(tenantId, 'prod-1');
  });

  it('getFacets restituisce valori distinti, trimmati e filtrati per tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany
      .mockResolvedValueOnce([{ category: ' Maglieria ' }, { category: 'Pantaloni' }])
      .mockResolvedValueOnce([{ brand: 'Acme' }])
      .mockResolvedValueOnce([{ season: 'FW26' }, { season: '' }]);

    const facets = await service.getFacets(tenantId);

    expect(facets.categories).toEqual(['Maglieria', 'Pantaloni']);
    expect(facets.brands).toEqual(['Acme']);
    expect(facets.seasons).toEqual(['FW26']);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(3);
    const firstCall = prisma.product.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string };
      distinct: string[];
    };
    expect(firstCall.where.tenantId).toBe(tenantId);
    expect(firstCall.distinct).toEqual(['category']);
  });

  it('listVariantSummaries pagina e mappa con prezzo in unità minori', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-1',
        barcode: '8001234567890',
        optionValues: [{ name: 'Taglia', value: 'M' }],
        currency: 'EUR',
        sellingPriceMinor: 1990,
        purchasePriceMinor: 990,
        product: { name: 'Maglietta' },
      },
    ]);
    prisma.productVariant.count.mockResolvedValue(1);

    const result = await service.listVariantSummaries(
      tenantId,
      { page: 1, pageSize: 20 } as never,
      userWithCosts,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      variantId: 'var-1',
      sku: 'SKU-1',
      productName: 'Maglietta',
      barcode: '8001234567890',
      sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
      purchasePrice: { amountMinor: 990, currencyCode: 'EUR' },
    });
    const where = (prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: { tenantId: string } })
      .where;
    expect(where.tenantId).toBe(tenantId);
  });

  // Costo d'acquisto = dato sensibile (§permessi). Il filtro deve stare qui,
  // lato server: nasconderlo solo nella UI lo lascerebbe leggibile nella
  // risposta HTTP a chiunque sappia aprire gli strumenti di rete.
  it('listVariantSummaries omette il costo per chi non ha il permesso costi', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([variantRowWithCost]);
    prisma.productVariant.count.mockResolvedValue(1);

    const result = await service.listVariantSummaries(
      tenantId,
      { page: 1, pageSize: 20 } as never,
      userWithoutCosts,
    );

    expect(result.items[0]?.purchasePrice).toBeNull();
    // Il resto della riga deve restare intatto: si nasconde il costo, non la variante.
    expect(result.items[0]).toMatchObject({
      variantId: 'var-1',
      sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
    });
  });

  it('listVariantSummaries omette il costo senza utente nel chiamante', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([variantRowWithCost]);
    prisma.productVariant.count.mockResolvedValue(1);

    const result = await service.listVariantSummaries(tenantId, {
      page: 1,
      pageSize: 20,
    } as never);

    expect(result.items[0]?.purchasePrice).toBeNull();
  });

  it('listVariantSummaries applica ricerca e filtro variantId', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.productVariant.count.mockResolvedValue(0);

    await service.listVariantSummaries(tenantId, {
      page: 1,
      pageSize: 10,
      search: 'mag',
      variantId: 'var-9',
    } as never);

    const where = (prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> })
      .where;
    expect(where.tenantId).toBe(tenantId);
    expect(where.id).toBe('var-9');
  });

  it('listVariantSummaries applica il filtro productId (deep-link Registra movimento)', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.productVariant.count.mockResolvedValue(0);

    await service.listVariantSummaries(tenantId, {
      page: 1,
      pageSize: 10,
      productId: 'prod-7',
    } as never);

    const where = (prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> })
      .where;
    expect(where.tenantId).toBe(tenantId);
    expect(where.productId).toBe('prod-7');
  });

  describe('duplicateProduct', () => {
    it('lancia NotFoundException se il prodotto originale non esiste', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValueOnce(null);

      await expect(service.duplicateProduct(tenantId, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it(
      'crea un nuovo prodotto con nome "(copia)", SKU con suffisso -COPIA, ' +
        'barcode vuoto e nessun collegamento canale ereditato',
      async () => {
        const { service, prisma, channelSync } = createService();
        const original = {
          id: 'prod-1',
          name: 'Maglietta Basic',
          description: 'Descrizione',
          brand: 'Brand X',
          category: 'T-shirt',
          shopifyTaxonomyCategoryId: null,
          shopifyTaxonomyCategoryFullName: null,
          shopifyCategoryMetafields: [],
          tiktokCategoryId: null,
          season: 'estate',
          tags: ['estate', 'donna'],
          seoTitle: null,
          seoDescription: null,
          status: 'active',
          unitOfMeasure: 'pz',
          defaultVatCodeId: null,
          inventoryTracking: 'standard',
          managesStock: true,
          options: [],
          shopifyProductId: 'gid://shopify/Product/1',
          variants: [
            {
              id: 'var-1',
              sku: 'SKU-1',
              optionValues: [],
              barcode: '8001234567890',
              currency: 'EUR',
              sellingPriceMinor: 1990,
              purchasePriceMinor: 990,
              compareAtPriceMinor: null,
            },
          ],
          images: [
            {
              id: 'img-1',
              url: 'https://cdn.example.com/img.jpg',
              storagePath: 'products/img.jpg',
              altText: 'Maglietta',
              sortOrder: 0,
              shopifyImageId: 'gid://shopify/Image/1',
            },
          ],
        };
        prisma.product.findFirst
          .mockResolvedValueOnce(original) // lookup originale in duplicateProduct
          .mockResolvedValueOnce({ ...original, id: 'prod-copy', name: 'Maglietta Basic (copia)' }); // getById finale

        prisma.productVariant.findFirst.mockResolvedValue(null); // "SKU-1-COPIA" libero
        prisma.product.create.mockResolvedValue({ id: 'prod-copy' });

        await service.duplicateProduct(tenantId, 'prod-1');

        const data = prisma.product.create.mock.calls[0]![0]!.data;
        expect(data.name).toBe('Maglietta Basic (copia)');
        expect(data.catalogOrigin).toBe('vestiflow');
        expect(data.shopifyProductId).toBeUndefined();
        expect(data.variants.create).toHaveLength(1);
        expect(data.variants.create[0].sku).toBe('SKU-1-COPIA');
        expect(data.variants.create[0].barcode).toBeNull();
        expect(data.variants.create[0].sellingPriceMinor).toBe(1990);
        expect(data.images.create).toHaveLength(1);
        expect(data.images.create[0]).toMatchObject({
          url: 'https://cdn.example.com/img.jpg',
          altText: 'Maglietta',
        });
        expect(data.images.create[0].shopifyImageId).toBeUndefined();
        // Nessun push automatico a Shopify dopo la duplicazione.
        expect(channelSync.enqueueProductPush).not.toHaveBeenCalled();
      },
    );

    it('incrementa il suffisso "-COPIA-n" se lo SKU è già occupato', async () => {
      const { service, prisma } = createService();
      const original = {
        id: 'prod-1',
        name: 'Pantalone',
        description: null,
        brand: null,
        category: null,
        shopifyTaxonomyCategoryId: null,
        shopifyTaxonomyCategoryFullName: null,
        shopifyCategoryMetafields: [],
        tiktokCategoryId: null,
        season: null,
        tags: [],
        seoTitle: null,
        seoDescription: null,
        status: 'draft',
        unitOfMeasure: 'pz',
        defaultVatCodeId: null,
        inventoryTracking: 'standard',
        managesStock: true,
        options: [],
        variants: [
          {
            id: 'var-1',
            sku: 'SKU-9',
            optionValues: [],
            barcode: null,
            currency: 'EUR',
            sellingPriceMinor: 2990,
            purchasePriceMinor: null,
            compareAtPriceMinor: null,
          },
        ],
        images: [],
      };
      prisma.product.findFirst
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce({ ...original, id: 'prod-copy' });

      // "SKU-9-COPIA" già occupato, "SKU-9-COPIA-2" libero.
      prisma.productVariant.findFirst
        .mockResolvedValueOnce({ id: 'other-variant' })
        .mockResolvedValueOnce(null);
      prisma.product.create.mockResolvedValue({ id: 'prod-copy' });

      await service.duplicateProduct(tenantId, 'prod-1');

      const data = prisma.product.create.mock.calls[0]![0]!.data;
      expect(data.variants.create[0].sku).toBe('SKU-9-COPIA-2');
    });
  });
});
