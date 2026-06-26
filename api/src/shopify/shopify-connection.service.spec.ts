import { UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';

describe('ShopifyConnectionService', () => {
  function createService(connection: Record<string, unknown> | null = null) {
    const prisma = {
      shopifyConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      shopifyCredential: {
        findUnique: vi.fn().mockResolvedValue(connection ? { tenantId: 'tenant-1' } : null),
      },
      product: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      location: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const shopifyConfig = {
      requestedScopes: ['read_products', 'write_inventory'],
    };

    const service = new ShopifyConnectionService(
      prisma as unknown as PrismaService,
      shopifyConfig as unknown as ShopifyConfigService,
    );

    return { service, prisma };
  }

  const connectedRow = {
    id: 'conn-1',
    tenantId: 'tenant-1',
    status: ShopifyConnectionStatus.connected,
    shopDomain: 'shop.myshopify.com',
    displayName: 'Shop',
    apiVersion: '2025-01',
    scopes: ['read_products'],
    lastConnectedAt: new Date('2026-01-01'),
    lastSyncAt: null,
    webhooksActivatedAt: null,
    webhooksActiveCount: null,
    autoSyncEnabled: true,
    lastErrorMessage: null,
    lastErrorCode: null,
    lastErrorAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('isAutoSyncEnabled true quando connessione attiva', async () => {
    const { service, prisma } = createService({ autoSyncEnabled: true });
    prisma.shopifyConnection.findUnique.mockResolvedValue({ autoSyncEnabled: true });

    await expect(service.isAutoSyncEnabled('tenant-1')).resolves.toBe(true);
  });

  it('isAutoSyncEnabled false se connessione assente', async () => {
    const { service, prisma } = createService(null);
    prisma.shopifyConnection.findUnique.mockResolvedValue(null);

    await expect(service.isAutoSyncEnabled('tenant-1')).resolves.toBe(false);
  });

  it('getForTenant restituisce not_connected se record assente', async () => {
    const { service } = createService(null);

    const dto = await service.getForTenant('tenant-1');

    expect(dto.status).toBe(ShopifyConnectionStatus.not_connected);
    expect(dto.tenantId).toBe('tenant-1');
    expect(dto.shopDomain).toBeNull();
    expect(dto.autoSyncEnabled).toBe(false);
  });

  it('getForTenant restituisce DTO not_connected senza 404', async () => {
    const { service } = createService({
      ...connectedRow,
      status: ShopifyConnectionStatus.not_connected,
      shopDomain: null,
      displayName: null,
      scopes: [],
      lastErrorMessage: 'Errore legacy',
      lastErrorCode: 'product_sync_failed',
      lastSyncAt: new Date('2026-01-01'),
    });

    const dto = await service.getForTenant('tenant-1');

    expect(dto.status).toBe(ShopifyConnectionStatus.not_connected);
    expect(dto.shopDomain).toBeNull();
    expect(dto.lastError).toBeNull();
    expect(dto.lastSyncAt).toBeNull();
    expect(dto.autoSyncEnabled).toBe(false);
  });

  it('getForTenant restituisce DTO connessione', async () => {
    const { service } = createService(connectedRow);

    const dto = await service.getForTenant('tenant-1');

    expect(dto.tenantId).toBe('tenant-1');
    expect(dto.shopDomain).toBe('shop.myshopify.com');
    expect(dto.autoSyncEnabled).toBe(true);
  });

  it('recordError imposta stato error sulla connessione', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordError('tenant-1', 'Token revocato', 'token_revoked');

    expect(prisma.shopifyConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        data: expect.objectContaining({
          status: 'error',
          lastErrorMessage: 'Token revocato',
          lastErrorCode: 'token_revoked',
        }),
      }),
    );
  });

  it('recordApiFailure imposta reauth_required su 401', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordApiFailure('tenant-1', new Error('Shopify Admin API error (401): Unauthorized'));

    expect(prisma.shopifyConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'reauth_required',
          lastErrorCode: 'token_expired',
        }),
      }),
    );
  });

  it('touchSync aggiorna lastSyncAt e pulisce errori', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.touchSync('tenant-1');

    expect(prisma.shopifyConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastErrorMessage: null,
          lastErrorCode: null,
        }),
      }),
    );
  });

  it('clearErrors ripristina prodotti e location in errore', async () => {
    const { service, prisma } = createService(connectedRow);
    prisma.product.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.location.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const result = await service.clearErrors('tenant-1');

    expect(result.cleared).toBe(true);
    expect(result.productsReset).toBe(1);
    expect(result.locationsReset).toBe(1);
  });

  it('clearErrors fallisce se OAuth non più presente', async () => {
    const { service, prisma } = createService(connectedRow);
    prisma.shopifyCredential.findUnique.mockResolvedValue(null);

    await expect(service.clearErrors('tenant-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('recordWebhooksActivated abilita auto-sync', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordWebhooksActivated('tenant-1', 3);

    expect(prisma.shopifyConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoSyncEnabled: true,
          webhooksActiveCount: 3,
        }),
      }),
    );
  });
});
