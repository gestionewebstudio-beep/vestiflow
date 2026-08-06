import { describe, expect, it, vi } from 'vitest';

import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import type { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import type { ShopifyProductPullService } from './shopify-product-pull.service';
import type { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import type { ShopifyShopChangeService } from './shopify-shop-change.service';
import { ShopifyController } from './shopify.controller';

describe('ShopifyController', () => {
  const tenantId = 'tenant-1';
  const shopifyConnection = {
    getForTenant: vi.fn(),
    clearErrors: vi.fn(),
  };
  const shopifyOAuth = {
    beginAuth: vi.fn(),
    handleCallback: vi.fn(),
    disconnect: vi.fn(),
    resyncLocations: vi.fn(),
    resyncWebhooks: vi.fn(),
    disableWebhooks: vi.fn(),
  };
  const shopifyConfig = { frontendUrl: 'http://localhost:4200' };
  const shopifyProductPull = { pullCatalog: vi.fn() };
  const shopifyInventoryPull = { pullInventory: vi.fn() };
  const shopifyCustomersPull = { pullCustomers: vi.fn() };
  const shopifyOrdersPull = { pullOrders: vi.fn() };
  const shopifyTaxonomy = {
    listCategories: vi.fn(),
    getCategoryAttributes: vi.fn(),
  };
  const shopifyShopChange = {
    preview: vi.fn(),
    purge: vi.fn(),
  };

  const controller = new ShopifyController(
    shopifyConnection as unknown as ShopifyConnectionService,
    shopifyOAuth as unknown as ShopifyOAuthService,
    shopifyConfig as unknown as ShopifyConfigService,
    shopifyProductPull as unknown as ShopifyProductPullService,
    shopifyInventoryPull as unknown as ShopifyInventoryPullService,
    shopifyCustomersPull as unknown as ShopifyCustomersPullService,
    shopifyOrdersPull as unknown as ShopifyOrdersPullService,
    shopifyTaxonomy as unknown as ShopifyTaxonomyService,
    shopifyShopChange as unknown as ShopifyShopChangeService,
    {} as never,
  );

  it('getConnection delega al service', async () => {
    shopifyConnection.getForTenant.mockResolvedValue({ connected: true });

    await expect(controller.getConnection(tenantId)).resolves.toEqual({ connected: true });
  });

  it('beginAuth delega a OAuth', async () => {
    shopifyOAuth.beginAuth.mockResolvedValue({ authorizeUrl: 'https://shop.myshopify.com/admin/oauth' });

    await expect(controller.beginAuth(tenantId, { shop: 'shop.myshopify.com' })).resolves
      .toMatchObject({ authorizeUrl: expect.stringContaining('shopify') });
  });

  it('disconnect delega a OAuth', async () => {
    shopifyOAuth.disconnect.mockResolvedValue(undefined);

    await expect(controller.disconnect(tenantId)).resolves.toEqual({ disconnected: true });
  });

  it('authCallback reindirizza in caso di successo', async () => {
    shopifyOAuth.handleCallback.mockResolvedValue('http://localhost:4200/app/settings?shopify=ok');
    const redirect = vi.fn();
    const response = { redirect } as never;

    await controller.authCallback({}, response);

    expect(redirect).toHaveBeenCalledWith('http://localhost:4200/app/settings?shopify=ok');
  });

  it('authCallback reindirizza alla pagina errore se OAuth fallisce', async () => {
    shopifyOAuth.handleCallback.mockRejectedValue(new Error('invalid hmac'));
    const redirect = vi.fn();
    const response = { redirect } as never;

    await controller.authCallback({}, response);

    expect(redirect).toHaveBeenCalledWith('http://localhost:4200/app/settings?shopify=error');
  });

  it('syncProducts restituisce synced true', async () => {
    shopifyProductPull.pullCatalog.mockResolvedValue({ imported: 3 });

    await expect(controller.syncProducts(tenantId)).resolves.toEqual({
      synced: true,
      imported: 3,
    });
  });

  it('listTaxonomyCategories incapsula items', async () => {
    shopifyTaxonomy.listCategories.mockResolvedValue([{ id: 'cat-1', name: 'Abbigliamento' }]);

    await expect(
      controller.listTaxonomyCategories(tenantId, { search: 'shirt' }),
    ).resolves.toEqual({ items: [{ id: 'cat-1', name: 'Abbigliamento' }] });
  });

  it('syncInventory e syncOrders propagano il risultato del pull', async () => {
    shopifyInventoryPull.pullInventory.mockResolvedValue({ updated: 4 });
    shopifyOrdersPull.pullOrders.mockResolvedValue({ imported: 2 });

    await expect(controller.syncInventory(tenantId)).resolves.toEqual({
      synced: true,
      updated: 4,
    });
    await expect(controller.syncOrders(tenantId)).resolves.toEqual({
      synced: true,
      imported: 2,
    });
  });

  it('clearErrors delega al connection service', async () => {
    shopifyConnection.clearErrors.mockResolvedValue({ cleared: 1 });

    await expect(controller.clearErrors(tenantId)).resolves.toEqual({ cleared: 1 });
  });

  it('previewShopChange delega al shop change service', async () => {
    shopifyShopChange.preview.mockResolvedValue({ currentShopDomain: 'a.myshopify.com' });

    await expect(controller.previewShopChange(tenantId)).resolves.toEqual({
      currentShopDomain: 'a.myshopify.com',
    });
  });

  it('purgeShopifyData delega al shop change service', async () => {
    shopifyShopChange.purge.mockResolvedValue({ purged: { products: 1 } });

    await expect(
      controller.purgeShopifyData(tenantId, {
        confirmShopDomain: 'a.myshopify.com',
        purgeCatalog: true,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    ).resolves.toEqual({ purged: { products: 1 } });
  });
});
