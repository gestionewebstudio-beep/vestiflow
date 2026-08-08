import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TenantChannelProfile } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyCryptoService } from './shopify-crypto.service';
import type { ShopifyLocationSyncService } from './shopify-location-sync.service';
import { ShopifyOAuthService } from './shopify-oauth.service';

describe('ShopifyOAuthService', () => {
  function createService(overrides: {
    cryptoConfigured?: boolean;
    tenantProfile?: TenantChannelProfile;
  } = {}) {
    const { cryptoConfigured = true, tenantProfile = TenantChannelProfile.shopify } = overrides;

    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ channelProfile: tenantProfile }),
      },
      shopifyOAuthState: {
        create: vi.fn().mockResolvedValue({}),
      },
      shopifyConnection: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      shopifyCredential: {
        findUnique: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      location: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // Spie sul magazzino: la disconnessione non deve toccarle mai.
      inventoryLevel: { deleteMany: vi.fn() },
      stockMovement: { deleteMany: vi.fn() },
      inventoryCountSession: { deleteMany: vi.fn() },
      supplierOrder: { deleteMany: vi.fn() },
      $transaction: vi.fn().mockImplementation((ops: unknown) => Promise.resolve(ops)),
    };

    const shopifyConfig = {
      normalizeShopDomain: vi.fn((input: string) =>
        input.endsWith('.myshopify.com') ? input : `${input}.myshopify.com`,
      ),
      apiKey: 'test-api-key',
      scopes: 'read_products',
      callbackUrl: 'https://api.test/callback',
      frontendUrl: 'http://localhost:4200',
      apiVersion: '2024-10',
      webhookUrl: null,
    };

    const shopifyCrypto = {
      isConfigured: vi.fn().mockReturnValue(cryptoConfigured),
      decrypt: vi.fn().mockReturnValue('plain-token'),
    };

    const shopifyAdmin = {
      assertConfigured: vi.fn(),
    };

    const shopifyConnection = {
      clearSetupStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ShopifyOAuthService(
      prisma as unknown as PrismaService,
      shopifyConfig as unknown as ShopifyConfigService,
      shopifyCrypto as unknown as ShopifyCryptoService,
      shopifyAdmin as unknown as ShopifyAdminClient,
      shopifyConnection as unknown as ShopifyConnectionService,
      {} as ShopifyLocationSyncService,
    );

    return { service, prisma, shopifyConfig, shopifyCrypto, shopifyAdmin, shopifyConnection };
  }

  // Registro difetti 1.3: disconnettere sospende, non cancella. Prima dell'
  // 08/08/2026 questo percorso cancellava sessioni di conteggio, giacenze,
  // movimenti e ordini fornitore chiusi delle sedi Shopify — e riusciva in
  // silenzio. Il test fallisce se qualcuno rimette una pulizia qui dentro.
  it('disconnect non cancella giacenze, movimenti, conteggi né ordini fornitore', async () => {
    const { service, prisma, shopifyConnection } = createService();

    await service.disconnect('tenant-1');

    expect(prisma.inventoryLevel.deleteMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.deleteMany).not.toHaveBeenCalled();
    expect(prisma.inventoryCountSession.deleteMany).not.toHaveBeenCalled();
    expect(prisma.supplierOrder.deleteMany).not.toHaveBeenCalled();

    // Quello che deve fare invece: revocare, scollegare, conservare.
    expect(shopifyConnection.clearSetupStatus).toHaveBeenCalledWith('tenant-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.shopifyCredential.deleteMany).toHaveBeenCalled();
    expect(prisma.location.updateMany).toHaveBeenCalled();
  });

  it('beginAuth genera authorizeUrl e salva stato OAuth', async () => {
    const { service, prisma, shopifyConfig } = createService();

    const result = await service.beginAuth('tenant-1', 'my-shop');

    expect(shopifyConfig.normalizeShopDomain).toHaveBeenCalledWith('my-shop');
    expect(prisma.shopifyOAuthState.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          shopDomain: 'my-shop.myshopify.com',
        }),
      }),
    );
    expect(result.authorizeUrl).toContain('https://my-shop.myshopify.com/admin/oauth/authorize');
    expect(result.authorizeUrl).toContain('client_id=test-api-key');
  });

  it('beginAuth blocca connessione a shop diverso se già connesso', async () => {
    const { service, prisma } = createService();
    prisma.shopifyCredential.findUnique.mockResolvedValue({
      shopDomain: 'old-shop.myshopify.com',
    });

    await expect(service.beginAuth('tenant-1', 'new-shop.myshopify.com')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('beginAuth fallisce se encryption key mancante', async () => {
    const { service } = createService({ cryptoConfigured: false });

    await expect(service.beginAuth('tenant-1', 'my-shop')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('resolveTenantByShopDomain restituisce tenantId', async () => {
    const { service, prisma, shopifyConfig } = createService();
    prisma.shopifyConnection.findFirst.mockResolvedValue({ tenantId: 'tenant-42' });

    await expect(service.resolveTenantByShopDomain('my-shop')).resolves.toBe('tenant-42');
    expect(shopifyConfig.normalizeShopDomain).toHaveBeenCalledWith('my-shop');
  });

  it('resolveTenantByShopDomain fallisce se shop non collegato', async () => {
    const { service, prisma } = createService();
    prisma.shopifyConnection.findFirst.mockResolvedValue(null);

    await expect(service.resolveTenantByShopDomain('unknown-shop')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getAccessToken fallisce se credenziali assenti', async () => {
    const { service, prisma } = createService();
    prisma.shopifyCredential.findUnique.mockResolvedValue(null);

    await expect(service.getAccessToken('tenant-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getAccessToken restituisce token decriptato', async () => {
    const { service, prisma, shopifyCrypto } = createService();
    prisma.shopifyCredential.findUnique.mockResolvedValue({
      shopDomain: 'shop.myshopify.com',
      accessTokenEnc: 'enc:payload',
    });

    await expect(service.getAccessToken('tenant-1')).resolves.toEqual({
      shopDomain: 'shop.myshopify.com',
      accessToken: 'plain-token',
    });
    expect(shopifyCrypto.decrypt).toHaveBeenCalledWith('enc:payload');
  });
});
