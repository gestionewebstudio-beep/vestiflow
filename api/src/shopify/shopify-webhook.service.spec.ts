import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifySyncService } from './shopify-sync.service';
import { ShopifyWebhookService } from './shopify-webhook.service';

describe('ShopifyWebhookService', () => {
  function createService() {
    const shopifyConfig = { apiSecret: 'test-secret' };
    const shopifyOAuth = { resolveTenantByShopDomain: vi.fn() };
    const shopifySync = { handleWebhook: vi.fn() };
    const shopifyConnection = {
      isAutoSyncEnabled: vi.fn(),
      recordSetupWarning: vi.fn(),
    };
    const prisma = { product: { updateMany: vi.fn() } };

    const service = new ShopifyWebhookService(
      shopifyConfig as unknown as ShopifyConfigService,
      shopifyOAuth as unknown as ShopifyOAuthService,
      shopifySync as unknown as ShopifySyncService,
      shopifyConnection as unknown as ShopifyConnectionService,
      prisma as unknown as PrismaService,
    );

    return { service, shopifyOAuth, shopifySync, shopifyConnection, prisma };
  }

  it('verifyHmac accetta firma valida', () => {
    const { service } = createService();
    const rawBody = Buffer.from('{"id":1}');
    const hmac = createHmac('sha256', 'test-secret').update(rawBody).digest('base64');

    expect(() => service.verifyHmac(rawBody, hmac)).not.toThrow();
  });

  it('verifyHmac rifiuta firma non valida', () => {
    const { service } = createService();
    const rawBody = Buffer.from('{"id":1}');

    expect(() => service.verifyHmac(rawBody, 'invalid')).toThrow(UnauthorizedException);
  });

  it('process ignora webhook se auto-sync disattivato', async () => {
    const { service, shopifyOAuth, shopifyConnection, shopifySync } = createService();
    shopifyOAuth.resolveTenantByShopDomain.mockResolvedValue('tenant-1');
    shopifyConnection.isAutoSyncEnabled.mockResolvedValue(false);

    await service.process('shop.myshopify.com', 'products/update', { id: 1 });

    expect(shopifySync.handleWebhook).not.toHaveBeenCalled();
  });

  it('process delega a sync se auto-sync attivo', async () => {
    const { service, shopifyOAuth, shopifyConnection, shopifySync } = createService();
    shopifyOAuth.resolveTenantByShopDomain.mockResolvedValue('tenant-1');
    shopifyConnection.isAutoSyncEnabled.mockResolvedValue(true);
    shopifySync.handleWebhook.mockResolvedValue(undefined);

    await service.process('shop.myshopify.com', 'inventory_levels/update', { id: 1 });

    expect(shopifySync.handleWebhook).toHaveBeenCalledWith('tenant-1', 'inventory_levels/update', {
      id: 1,
    });
  });

  it('process registra errore su webhook prodotti fallito', async () => {
    const { service, shopifyOAuth, shopifyConnection, shopifySync, prisma } = createService();
    shopifyOAuth.resolveTenantByShopDomain.mockResolvedValue('tenant-1');
    shopifyConnection.isAutoSyncEnabled.mockResolvedValue(true);
    shopifySync.handleWebhook.mockRejectedValue(new Error('sync failed'));
    prisma.product.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.process('shop.myshopify.com', 'products/update', { id: 999 }),
    ).rejects.toThrow('sync failed');

    expect(prisma.product.updateMany).toHaveBeenCalled();
  });
});
