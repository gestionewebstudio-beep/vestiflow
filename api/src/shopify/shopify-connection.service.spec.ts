import { UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';

describe('ShopifyConnectionService', () => {
  const CONFIGURED_WEBHOOK_URL = 'https://vestiflow.example/api/v1/shopify/webhooks';

  function createService(
    connection: Record<string, unknown> | null = null,
    configOverrides: Record<string, unknown> = {},
  ) {
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
      webhookUrl: CONFIGURED_WEBHOOK_URL,
      ...configOverrides,
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
    webhookAddress: null,
    webhookTopics: [],
    webhooksCheckedAt: null,
    lastWebhookEventAt: null,
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

  it('recordWebhooksActivated salva QUALI topic e VERSO DOVE, e il conteggio e derivato', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordWebhooksActivated('tenant-1', {
      topics: ['orders/create', 'inventory_levels/update'],
      address: CONFIGURED_WEBHOOK_URL,
    });

    const data = prisma.shopifyConnection.updateMany.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(data.autoSyncEnabled).toBe(true);
    expect(data.webhookTopics).toEqual(['inventory_levels/update', 'orders/create']);
    expect(data.webhookAddress).toBe(CONFIGURED_WEBHOOK_URL);
    expect(data.webhooksActiveCount).toBe(2);
    expect(data.webhooksCheckedAt).toBeInstanceOf(Date);
  });

  it('recordWebhooksActivated deduplica: l elenco salvato e un insieme', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordWebhooksActivated('tenant-1', {
      topics: ['orders/create', 'orders/create'],
      address: CONFIGURED_WEBHOOK_URL,
    });

    const data = prisma.shopifyConnection.updateMany.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(data.webhookTopics).toEqual(['orders/create']);
    expect(data.webhooksActiveCount).toBe(1);
  });

  it('recordWebhooksActivated non scrive niente se non e attivo nessun topic', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordWebhooksActivated('tenant-1', {
      topics: [],
      address: CONFIGURED_WEBHOOK_URL,
    });

    expect(prisma.shopifyConnection.updateMany).not.toHaveBeenCalled();
  });

  it('recordAutoSyncDisabled azzera l osservazione ma NON l ultimo evento ricevuto', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordAutoSyncDisabled('tenant-1');

    const data = prisma.shopifyConnection.updateMany.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(data.autoSyncEnabled).toBe(false);
    expect(data.webhookTopics).toEqual([]);
    expect(data.webhookAddress).toBeNull();
    expect(data.webhooksCheckedAt).toBeNull();
    // Che un evento sia arrivato resta vero anche a sincronizzazione spenta.
    expect(data).not.toHaveProperty('lastWebhookEventAt');
  });

  it('recordWebhookEventReceived scrive solo se la data e vecchia: la riga e calda', async () => {
    const { service, prisma } = createService(connectedRow);

    await service.recordWebhookEventReceived('tenant-1');

    const call = prisma.shopifyConnection.updateMany.mock.calls[0]?.[0] as {
      where: { OR: { lastWebhookEventAt: unknown }[] };
      data: { lastWebhookEventAt: Date };
    };
    // La condizione sta nella query: nessuna lettura in piu' e nessuna corsa fra due eventi
    // della stessa raffica di giacenze.
    expect(call.where.OR).toHaveLength(2);
    expect(call.where.OR[0]).toEqual({ lastWebhookEventAt: null });
    expect(call.data.lastWebhookEventAt).toBeInstanceOf(Date);
  });

  it('la data dell ultimo evento arriva nel DTO, distinta da lastSyncAt', async () => {
    const { service } = createService({
      ...connectedRow,
      lastSyncAt: new Date('2026-08-01T09:00:00Z'),
      lastWebhookEventAt: new Date('2026-08-08T16:30:00Z'),
    });

    const dto = await service.getForTenant('tenant-1');

    expect(dto.lastWebhookEventAt).toBe('2026-08-08T16:30:00.000Z');
    expect(dto.lastSyncAt).toBe('2026-08-01T09:00:00.000Z');
  });

  // ── Il DTO: «non lo sappiamo» non deve diventare «zero attivi» ───────────────────
  describe('verita sullo stato dei webhook nel DTO', () => {
    it('senza osservazione: topicsKnown false e NESSUN mancante, non «mancano tutti»', async () => {
      const { service } = createService(connectedRow);

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookTopicsKnown).toBe(false);
      expect(dto.webhookTopics).toEqual([]);
      expect(dto.webhookMissingTopics).toEqual([]);
      expect(dto.webhooksCheckedAt).toBeNull();
    });

    it('con osservazione incompleta: il mancante viene nominato', async () => {
      const { service } = createService({
        ...connectedRow,
        webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
        webhookTopics: [
          'inventory_levels/update',
          'orders/create',
          'orders/updated',
          'customers/create',
          'customers/update',
          'products/create',
          'products/update',
        ],
      });

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookTopicsKnown).toBe(true);
      expect(dto.webhookMissingTopics).toEqual(['orders/cancelled']);
      expect(dto.webhookUnexpectedTopics).toEqual([]);
    });

    it('indirizzo diverso da quello configurato: consegne altrove, ed e un fatto', async () => {
      const { service } = createService({
        ...connectedRow,
        webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
        webhookAddress: 'http://localhost:3000/api/v1/shopify/webhooks',
      });

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddress).toBe('http://localhost:3000/api/v1/shopify/webhooks');
      expect(dto.webhookAddressMatchesConfigured).toBe(false);
    });

    it('indirizzo uguale a quello configurato: nessun allarme', async () => {
      const { service } = createService({
        ...connectedRow,
        webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
        webhookAddress: CONFIGURED_WEBHOOK_URL,
      });

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddressMatchesConfigured).toBe(true);
    });

    it('indirizzo mai osservato: null, MAI false — non si segnala per ignoranza', async () => {
      const { service } = createService(connectedRow);

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddress).toBeNull();
      expect(dto.webhookAddressMatchesConfigured).toBeNull();
    });

    it('da un ambiente locale il confronto si spegne, e lo dichiara', async () => {
      const { service } = createService(
        {
          ...connectedRow,
          webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
          webhookAddress: 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks',
        },
        { webhookUrl: 'http://localhost:3000/api/v1/shopify/webhooks' },
      );

      const dto = await service.getForTenant('tenant-1');

      // Le sottoscrizioni sono giuste: e' il termine di paragone locale a non esserlo.
      // Segnalarle come sbagliate sarebbe un allarme prodotto da dove gira il codice.
      expect(dto.webhookAddressComparable).toBe(false);
      expect(dto.webhookAddressMatchesConfigured).toBeNull();
    });

    it('dall ambiente pubblicato il confronto resta acceso e dice verde', async () => {
      const published = 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks';
      const { service } = createService(
        {
          ...connectedRow,
          webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
          webhookAddress: published,
        },
        { webhookUrl: published },
      );

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddressComparable).toBe(true);
      expect(dto.webhookAddressMatchesConfigured).toBe(true);
    });

    it('dall ambiente pubblicato un indirizzo estraneo resta un rosso vero', async () => {
      const { service } = createService(
        {
          ...connectedRow,
          webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
          webhookAddress: 'https://vecchio-dominio.example/api/v1/shopify/webhooks',
        },
        { webhookUrl: 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks' },
      );

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddressComparable).toBe(true);
      expect(dto.webhookAddressMatchesConfigured).toBe(false);
    });

    it('indirizzo non configurato sul server: non confrontabile, non sbagliato', async () => {
      const { service } = createService(
        {
          ...connectedRow,
          webhooksCheckedAt: new Date('2026-08-08T10:00:00Z'),
          webhookAddress: CONFIGURED_WEBHOOK_URL,
        },
        { webhookUrl: undefined },
      );

      const dto = await service.getForTenant('tenant-1');

      expect(dto.webhookAddressMatchesConfigured).toBeNull();
    });
  });
});
