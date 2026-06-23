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
      },
      stockMovement: { count: vi.fn() },
      $transaction: vi
        .fn()
        .mockImplementation((arg: unknown) =>
          typeof arg === 'function'
            ? arg({
                product: { update: vi.fn() },
                productVariant: {
                  findMany: vi.fn().mockResolvedValue([]),
                  findFirst: vi.fn(),
                  delete: vi.fn(),
                },
                inventoryLevel: { deleteMany: vi.fn() },
                stockMovement: { count: vi.fn().mockResolvedValue(0) },
              })
            : Promise.all(arg as Promise<unknown>[]),
        ),
    };
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

    const result = await service.list(tenantId, { page: 1, pageSize: 10 } as never);

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
      product: { id: 'prod-1', name: 'Giacca' },
    });

    await expect(service.findVariantByCode(tenantId, 'SKU-1')).resolves.toEqual({
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-1',
      barcode: null,
      productName: 'Giacca',
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
      service.update(tenantId, 'prod-1', { name: 'Nuovo nome' } as never),
    ).resolves.toMatchObject({ id: 'prod-1', name: 'Vecchio' });

    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith(tenantId, 'prod-1');
  });
});
