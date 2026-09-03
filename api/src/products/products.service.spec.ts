import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyTaxonomyLocalizationService } from '../shopify/shopify-taxonomy-localization.service';
import { SYNC_DISABLE_FAILED_MESSAGE } from '../shopify/shopify-user-error.util';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
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
              updateMany: vi.fn(),
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
    // Il push verso i canali passa solo dal facade (porta unica): il service
    // di dominio non conosce più Shopify/TikTok direttamente.
    const channelSync = {
      enqueueProductPush: vi.fn(),
      pushProductNow: vi.fn(),
      deleteProduct: vi.fn(),
      archiveProductOnSyncDisabled: vi.fn().mockResolvedValue({ pushed: true }),
    };

    const service = new ProductsService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
      taxonomyLocalization as unknown as ShopifyTaxonomyLocalizationService,
    );

    return { service, prisma, channelSync };
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

  it('list espone il costo d’acquisto solo a chi ha il permesso', async () => {
    const { service, prisma } = createService();
    const rows = [
      {
        id: 'prod-1',
        name: 'Maglietta',
        purchasePriceMinor: 990,
        variants: [{ id: 'var-1', purchasePriceMinor: 990 }],
        images: [],
      },
    ];
    prisma.product.findMany.mockResolvedValue(rows);
    prisma.product.count.mockResolvedValue(1);

    const visible = await service.list(tenantId, { page: 1, pageSize: 10 }, userWithCosts);
    expect(visible.items[0]).toMatchObject({ purchasePriceMinor: 990 });

    prisma.product.findMany.mockResolvedValue(rows);
    const masked = await service.list(tenantId, { page: 1, pageSize: 10 }, userWithoutCosts);
    expect(masked.items[0]).toMatchObject({ purchasePriceMinor: null });
    expect(
      (masked.items[0] as { variants: readonly { purchasePriceMinor: unknown }[] }).variants[0],
    ).toMatchObject({ purchasePriceMinor: null });
  });

  // ── Write-guard sui costi ────────────────────────────────────────────
  // Chi non vede il costo non lo scrive: senza questo, il form di un
  // operatore col costo mascherato rimanderebbe indietro un valore assente e
  // AZZEREREBBE il costo a database salvando l'articolo.

  it('update di chi NON vede i costi non tocca il costo a database', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      sellingPriceMinor: 1990,
      purchasePriceMinor: 990,
      variants: [],
      images: [],
    });

    // Il ramo prezzi interroga il canale del tenant: senza, update non arriva.
    (prisma as unknown as { tenant: { findUnique: ReturnType<typeof vi.fn> } }).tenant = {
      findUnique: vi.fn().mockResolvedValue({ channelProfile: 'gestionale' }),
    };

    await service.update(
      tenantId,
      'prod-1',
      { sellingPrice: { amountMinor: 2490, currencyCode: 'EUR' } } as never,
      userWithoutCosts,
    );

    const data = prisma.product.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toMatchObject({ sellingPriceMinor: 2490 });
    // La chiave non compare proprio: il valore a database resta il suo.
    expect(data).not.toHaveProperty('purchasePriceMinor');
  });

  // ⛔ L'atteso era `null`. Chi vede i costi e non ne manda uno lo AZZERA: zero
  // è il costo di un articolo senza costo (`regole-gestionale`).
  it('update di chi vede i costi continua a scriverli (anche per azzerarli)', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      sellingPriceMinor: 1990,
      purchasePriceMinor: 990,
      variants: [],
      images: [],
    });

    // Il ramo prezzi interroga il canale del tenant: senza, update non arriva.
    (prisma as unknown as { tenant: { findUnique: ReturnType<typeof vi.fn> } }).tenant = {
      findUnique: vi.fn().mockResolvedValue({ channelProfile: 'gestionale' }),
    };

    await service.update(
      tenantId,
      'prod-1',
      { sellingPrice: { amountMinor: 2490, currencyCode: 'EUR' } } as never,
      userWithCosts,
    );

    const data = prisma.product.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toHaveProperty('purchasePriceMinor', 0);
  });

  it('create di chi NON vede i costi nasce senza costo, non col costo inviato', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockResolvedValue({ id: 'prod-new' });
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-new',
      name: 'Nuovo',
      variants: [],
      images: [],
    });

    await service.create(
      tenantId,
      {
        name: 'Nuovo',
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
        purchasePrice: { amountMinor: 700, currencyCode: 'EUR' },
        options: [],
        variants: [],
      } as never,
      userWithoutCosts,
    );

    const data = prisma.product.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // Senza permesso il costo non si scrive: l'articolo nasce a zero, non a null.
    expect(data).toMatchObject({ purchasePriceMinor: 0 });
  });

  it('getById maschera il costo a chi non lo può vedere', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      purchasePriceMinor: 990,
      variants: [{ id: 'var-1', purchasePriceMinor: 990 }],
      images: [],
    });

    const masked = await service.getById(tenantId, 'prod-1', userWithoutCosts);
    expect(masked).toMatchObject({ purchasePriceMinor: null });
    expect(masked.variants[0]).toMatchObject({ purchasePriceMinor: null });

    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      purchasePriceMinor: 990,
      variants: [{ id: 'var-1', purchasePriceMinor: 990 }],
      images: [],
    });
    const visible = await service.getById(tenantId, 'prod-1', userWithCosts);
    expect(visible).toMatchObject({ purchasePriceMinor: 990 });
  });

  it('list senza utente (chiamate interne) non espone il costo: default prudente', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', name: 'Maglietta', purchasePriceMinor: 990, variants: [], images: [] },
    ]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items[0]).toMatchObject({ purchasePriceMinor: null });
  });

  it('list con search cerca anche su barcode variante (scanner alla mano)', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.list(tenantId, { page: 1, pageSize: 10, search: '8001234567890' });

    const where = (prisma.product.findMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } })
      .where;
    expect(where.OR).toContainEqual({
      variants: { some: { barcode: { contains: '8001234567890', mode: 'insensitive' } } },
    });
    expect(where.OR).toContainEqual({
      variants: { some: { sku: { contains: '8001234567890', mode: 'insensitive' } } },
    });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checkSkuAvailability segnala SKU libero o occupato', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'var-1' });

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
    prisma.productVariant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'var-1' });

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

  // Il fornitore manda il suo listino con i SUOI codici: quello è il codice che
  // si ha sotto gli occhi mentre si compila l'ordine, quindi è una chiave di
  // ricerca come SKU ed EAN, non un dato da sola lettura.
  it('findVariantByCode risolve per codice fornitore', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue(null);
    prisma.productVariant.findMany
      // Codice articolo: nessun riscontro.
      .mockResolvedValueOnce([])
      // Codice fornitore: uno solo, quindi non è ambiguo.
      .mockResolvedValueOnce([
        {
          id: 'var-9',
          productId: 'prod-9',
          sku: 'SKU-9',
          barcode: null,
          product: { id: 'prod-9', name: 'Camicia', managesStock: true },
        },
      ]);

    await expect(service.findVariantByCode(tenantId, 'FORN-123')).resolves.toMatchObject({
      variantId: 'var-9',
      productName: 'Camicia',
    });
  });

  // Fornitori diversi possono usare lo stesso codice per articoli diversi:
  // meglio nessun richiamo che il richiamo sbagliato.
  it('findVariantByCode non sceglie se il codice fornitore è ambiguo', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue(null);
    prisma.productVariant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'var-a' }, { id: 'var-b' }]);

    await expect(service.findVariantByCode(tenantId, 'FORN-123')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
    const { service, prisma, channelSync } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Giacca',
      description: null,
      variants: [],
      images: [],
    });
    channelSync.pushProductNow.mockResolvedValue({ queued: true });

    await expect(service.syncToShopify(tenantId, 'prod-1')).resolves.toEqual({ queued: true });
    expect(channelSync.pushProductNow).toHaveBeenCalledWith(tenantId, 'prod-1');
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
        sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
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
        sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
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
    const { service, prisma, channelSync } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    channelSync.deleteProduct.mockResolvedValue({ reason: 'not_connected' });

    await expect(service.delete(tenantId, 'prod-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('delete rimuove prodotto sincronizzato dopo delete su Shopify', async () => {
    const { service, prisma, channelSync } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    channelSync.deleteProduct.mockResolvedValue({ deleted: true });
    prisma.product.delete.mockResolvedValue({});

    await service.delete(tenantId, 'prod-1');

    expect(channelSync.deleteProduct).toHaveBeenCalledWith(tenantId, 'gid://shopify/Product/1');
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
  });

  it('delete rifiuta se Shopify API fallisce su prodotto sincronizzato', async () => {
    const { service, prisma, channelSync } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      shopifyProductId: 'gid://shopify/Product/1',
    });
    prisma.stockMovement.count.mockResolvedValue(0);
    channelSync.deleteProduct.mockResolvedValue({ reason: 'shopify_error' });

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

  // ⛔ Spegnere «Sincronizza con Shopify» è UN'OPERAZIONE SOLA (docs/24 §1.10):
  //    la risposta al salvataggio non parte prima che Shopify abbia confermato,
  //    altrimenti la scheda dichiara «spenta» una sync che si riaccende da sé.
  describe('lo spegnimento della sincronizzazione aspetta Shopify', () => {
    const collegato = {
      id: 'prod-1',
      name: 'Maglietta',
      description: null,
      shopifySyncEnabled: true,
      shopifyProductId: '111',
      variants: [],
      images: [],
    };

    it("non risponde finché l'archiviazione è in volo", async () => {
      const { service, prisma, channelSync } = createService();
      prisma.product.findFirst.mockResolvedValue(collegato);
      let concludi: (esito: unknown) => void = () => {};
      channelSync.archiveProductOnSyncDisabled.mockReturnValue(
        new Promise((resolve) => {
          concludi = resolve;
        }),
      );

      let risposta = false;
      const salvataggio = service
        .update(tenantId, 'prod-1', { shopifySyncEnabled: false } as never)
        .then((prodotto) => {
          risposta = true;
          return prodotto;
        });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(risposta).toBe(false);

      concludi({ pushed: true });
      await salvataggio;
      expect(risposta).toBe(true);
      // Lo spegnimento non passa dal push ordinario: a flag spento non parte.
      expect(channelSync.enqueueProductPush).not.toHaveBeenCalled();
    });

    it('⭐ Shopify CONFERMA: il flag resta spento e la risposta lo dice', async () => {
      const { service, prisma, channelSync } = createService();
      prisma.product.findFirst
        .mockResolvedValueOnce(collegato)
        .mockResolvedValue({ ...collegato, shopifySyncEnabled: false });

      const prodotto = await service.update(tenantId, 'prod-1', {
        name: 'Nome nuovo',
        shopifySyncEnabled: false,
      } as never);

      expect(channelSync.archiveProductOnSyncDisabled).toHaveBeenCalledWith(tenantId, 'prod-1');
      expect(prodotto).toMatchObject({ shopifySyncEnabled: false });
    });

    it('⛔ Shopify RIFIUTA: la risposta porta lo stato EFFETTIVO, e il salvataggio riesce', async () => {
      const { service, prisma, channelSync } = createService();
      channelSync.archiveProductOnSyncDisabled.mockResolvedValue({
        pushed: false,
        reason: 'shopify_error',
      });
      // Dopo l'annullamento il prodotto è di nuovo acceso, con il messaggio: è
      // quello che `getById` rilegge, ed è quello che la scheda deve mostrare.
      prisma.product.findFirst.mockResolvedValueOnce(collegato).mockResolvedValue({
        ...collegato,
        name: 'Nome nuovo',
        shopifySyncEnabled: true,
        shopifySyncStatus: 'out_of_sync',
        shopifyLastError: `${SYNC_DISABLE_FAILED_MESSAGE}: Shopify productUpdate rifiutato`,
      });

      // ⛔ Non solleva: le altre modifiche della scheda sono salvate, e un 500
      //    direbbe «salvataggio fallito» di un salvataggio riuscito.
      const prodotto = await service.update(tenantId, 'prod-1', {
        name: 'Nome nuovo',
        shopifySyncEnabled: false,
      } as never);

      expect(prodotto).toMatchObject({
        name: 'Nome nuovo',
        shopifySyncEnabled: true,
        shopifySyncStatus: 'out_of_sync',
      });
      expect(prodotto.shopifyLastError).toContain(SYNC_DISABLE_FAILED_MESSAGE);
    });

    it('⭐ prodotto MAI COLLEGATO: si spegne in locale, senza chiamare Shopify', async () => {
      const { service, prisma, channelSync } = createService();
      const mai = { ...collegato, shopifyProductId: null };
      channelSync.archiveProductOnSyncDisabled.mockResolvedValue({
        pushed: false,
        reason: 'not_linked',
      });
      prisma.product.findFirst
        .mockResolvedValueOnce(mai)
        .mockResolvedValue({ ...mai, shopifySyncEnabled: false });

      const prodotto = await service.update(tenantId, 'prod-1', {
        shopifySyncEnabled: false,
      } as never);

      // La chiamata parte lo stesso: è la facade a sapere se c'è un canale.
      // Quello che conta è che lo spegnimento REGGA.
      expect(prodotto).toMatchObject({ shopifySyncEnabled: false });
    });

    it('già spento: nessuna transizione, quindi nessuna archiviazione', async () => {
      const { service, prisma, channelSync } = createService();
      prisma.product.findFirst.mockResolvedValue({ ...collegato, shopifySyncEnabled: false });

      await service.update(tenantId, 'prod-1', { shopifySyncEnabled: false } as never);

      expect(channelSync.archiveProductOnSyncDisabled).not.toHaveBeenCalled();
      expect(channelSync.enqueueProductPush).toHaveBeenCalledWith(tenantId, 'prod-1');
    });
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

    await expect(service.update(tenantId, 'prod-1', { name: 'Nuovo nome' })).resolves.toMatchObject(
      { id: 'prod-1', name: 'Vecchio' },
    );

    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith(tenantId, 'prod-1');
  });

  // Listini (§B): il gate è per campo. Non esiste più un flag "la sezione è
  // stata inviata": la modalità netto/ivato è una preferenza dell'operatore e
  // non viaggia con l'articolo.
  it('update valorizza, azzera e lascia stare i listini campo per campo', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      variants: [],
      images: [],
    });

    await service.update(tenantId, 'prod-1', {
      // valorizzato → scritto; null → azzerato; assente → non toccato.
      listino1Price: { amountMinor: 2500, currency: 'EUR' },
      listino2Price: null,
    });

    const data = prisma.product.update.mock.calls[0]![0].data;
    expect(data.listino1PriceMinor).toBe(2500);
    expect(data.listino2PriceMinor).toBeNull();
    expect(data).not.toHaveProperty('listino3PriceMinor');
  });

  it('update senza campi listino non li tocca (patch parziale)', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta',
      variants: [],
      images: [],
    });

    await service.update(tenantId, 'prod-1', { name: 'Nuovo nome' });

    const data = prisma.product.update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('listino1PriceMinor');
    expect(data).not.toHaveProperty('listino2PriceMinor');
    expect(data).not.toHaveProperty('listino3PriceMinor');
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
    const where = (
      prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: { tenantId: string } }
    ).where;
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

  /**
   * ⚠️ **Qui c’era «omette il costo SENZA UTENTE nel chiamante»**, e la sua
   * premessa non esiste più: dal 28/08/2026 `user` non è più opzionale, quindi
   * una chiamata senza utente non compila. Il commento del servizio diceva
   * «opzionale per non rompere i chiamanti interni» — di chiamanti interni non
   * ce n’erano: l’unico è la rotta, e l’utente lo passa.
   *
   * ⭐ Al suo posto la controprova che mancava: chi il permesso CE L’HA il costo
   * lo vede. Senza, l’unica prova sul costo sarebbe negativa, e una regola che
   * nasconde sempre passerebbe verde.
   */
  it('listVariantSummaries espone il costo a chi ha il permesso costi', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findMany.mockResolvedValue([variantRowWithCost]);
    prisma.productVariant.count.mockResolvedValue(1);

    const result = await service.listVariantSummaries(
      tenantId,
      { page: 1, pageSize: 20 } as never,
      testOwnerUser(),
    );

    expect(result.items[0]?.purchasePrice).not.toBeNull();
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
    } as never, testOwnerUser());

    const where = (
      prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where;
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
    } as never, testOwnerUser());

    const where = (
      prisma.productVariant.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where;
    expect(where.tenantId).toBe(tenantId);
    expect(where.productId).toBe('prod-7');
  });

  // Il riepilogo varianti serve la ricerca articolo delle maschere documento:
  // il `locationId` della query decide DI QUALE sede si leggono giacenza e
  // disponibilità, e la rotta chiede solo la sezione «Prodotti». Il confine di
  // sede va quindi verificato qui, nel servizio dove il dato arriva.
  describe('listVariantSummaries — la sede segue l’utente, non la query', () => {
    const NAPOLI = '11111111-1111-4111-8111-111111111111';
    const MILANO = '22222222-2222-4222-8222-222222222222';

    it('nega la sede fuori ambito e non legge nulla', async () => {
      const { service, prisma } = createService();
      // La lettura è pronta a riuscire: senza la guardia questa chiamata
      // tornerebbe la giacenza di Napoli invece di fallire.
      prisma.productVariant.findMany.mockResolvedValue([
        {
          ...(variantRowWithCost as object),
          inventoryLevels: [{ onHand: 9, available: 9, minThreshold: 0 }],
        },
      ] as never);
      prisma.productVariant.count.mockResolvedValue(1);
      // Commesso con una sola sede assegnata: Napoli non è sua.
      const clerk = testClerkUser({ assignedLocationIds: [MILANO] });

      await expect(
        service.listVariantSummaries(
          tenantId,
          { page: 1, pageSize: 20, locationId: NAPOLI } as never,
          clerk,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Nessun effetto: la giacenza della sede negata non viene nemmeno letta.
      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
      expect(prisma.productVariant.count).not.toHaveBeenCalled();
    });

    it('lascia passare la sede assegnata e filtra la giacenza su quella', async () => {
      const { service, prisma } = createService();
      prisma.productVariant.findMany.mockResolvedValue([]);
      prisma.productVariant.count.mockResolvedValue(0);
      const clerk = testClerkUser({ assignedLocationIds: [MILANO] });

      await service.listVariantSummaries(
        tenantId,
        { page: 1, pageSize: 20, locationId: MILANO } as never,
        clerk,
      );

      const select = (
        prisma.productVariant.findMany.mock.calls[0]?.[0] as {
          select: { inventoryLevels: { where?: { locationId?: string } } };
        }
      ).select;
      expect(select.inventoryLevels.where?.locationId).toBe(MILANO);
    });

    it('il titolare con array permessi vuoto vede qualunque sede', async () => {
      const { service, prisma } = createService();
      prisma.productVariant.findMany.mockResolvedValue([]);
      prisma.productVariant.count.mockResolvedValue(0);
      // Titolare senza sedi assegnate e senza permessi elencati: passa comunque.
      const owner = testOwnerUser({ assignedLocationIds: [], permissions: [] });

      await expect(
        service.listVariantSummaries(
          tenantId,
          { page: 1, pageSize: 20, locationId: NAPOLI } as never,
          owner,
        ),
      ).resolves.toMatchObject({ total: 0 });
      expect(prisma.productVariant.findMany).toHaveBeenCalled();
    });

    it('chi ha «vedi tutte le sedi» continua a vedere qualunque sede', async () => {
      const { service, prisma } = createService();
      prisma.productVariant.findMany.mockResolvedValue([]);
      prisma.productVariant.count.mockResolvedValue(0);
      const clerk = testClerkUser({
        assignedLocationIds: [MILANO],
        permissions: [TenantPermission.SectionProducts, TenantPermission.InventoryViewAllLocations],
      });

      await expect(
        service.listVariantSummaries(
          tenantId,
          { page: 1, pageSize: 20, locationId: NAPOLI } as never,
          clerk,
        ),
      ).resolves.toMatchObject({ total: 0 });
    });

    // Senza `locationId` la ricerca articolo delle maschere documento non
    // cambia: totale multi-sede, anche per chi non ha sedi assegnate. Stringere
    // anche qui azzererebbe la giacenza mostrata in mezza applicazione.
    it('senza locationId non filtra e non nega, anche senza sedi assegnate', async () => {
      const { service, prisma } = createService();
      prisma.productVariant.findMany.mockResolvedValue([
        {
          ...(variantRowWithCost as object),
          inventoryLevels: [
            { onHand: 3, available: 2, minThreshold: 1 },
            { onHand: 4, available: 4, minThreshold: 0 },
          ],
        },
      ] as never);
      prisma.productVariant.count.mockResolvedValue(1);
      const clerk = testClerkUser({ assignedLocationIds: [] });

      const result = await service.listVariantSummaries(
        tenantId,
        { page: 1, pageSize: 20 } as never,
        clerk,
      );

      const select = (
        prisma.productVariant.findMany.mock.calls[0]?.[0] as {
          select: { inventoryLevels: { where?: unknown } };
        }
      ).select;
      expect(select.inventoryLevels.where).toBeUndefined();
      expect(result.items[0]).toMatchObject({ stockOnHand: 7, stockAvailable: 6 });
    });
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
          sellingPriceMinor: 1990,
          compareAtPriceMinor: null,
          purchasePriceMinor: 990,
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
        sellingPriceMinor: 2990,
        compareAtPriceMinor: null,
        purchasePriceMinor: null,
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
