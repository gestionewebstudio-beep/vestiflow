import { describe, expect, it } from 'vitest';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

import { shopifyConnectionFromDto } from './shopify-connection.mapper';
import type { ShopifyConnectionDto } from './shopify-connection.dto';

const baseDto: ShopifyConnectionDto = {
  id: 'conn-1',
  tenantId: 'tenant-1',
  status: ShopifyConnectionStatus.Connected,
  shopDomain: 'mystore.myshopify.com',
  displayName: 'My Store',
  apiVersion: '2025-01',
  scopes: ['read_products', 'write_products'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('shopifyConnectionFromDto', () => {
  it('mappa connessione completa con diagnostica scope', () => {
    const dto: ShopifyConnectionDto = {
      ...baseDto,
      scopeDiagnostics: {
        requested: ['read_products'],
        granted: ['read_products'],
        missingFromGrant: [],
        missingForCatalogImport: [],
        catalogImportBlockedReason: 'none',
        missingForPublications: [],
        publicationsBlockedReason: 'none',
      },
      lastError: {
        message: 'Errore sync',
        occurredAt: '2026-06-01T12:00:00.000Z',
        code: 'sync_failed',
      },
      webhooksActiveCount: 5,
      autoSyncEnabled: true,
    };

    const connection = shopifyConnectionFromDto(dto);
    expect(connection.shopDomain).toBe('mystore.myshopify.com');
    expect(connection.scopeDiagnostics?.catalogImportBlockedReason).toBe('none');
    expect(connection.lastError?.code).toBe('sync_failed');
    expect(connection.webhooksActiveCount).toBe(5);
  });

  it('omette campi opzionali assenti', () => {
    const connection = shopifyConnectionFromDto(baseDto);
    expect(connection.scopeDiagnostics).toBeUndefined();
    expect(connection.lastError).toBeUndefined();
  });

  it('porta lo stato dei webhook senza reinterpretarlo', () => {
    const connection = shopifyConnectionFromDto({
      ...baseDto,
      webhookAddress: 'https://vestiflow.example/api/v1/shopify/webhooks',
      webhookAddressMatchesConfigured: false,
      webhookTopics: ['inventory_levels/update', 'orders/create'],
      webhookTopicsKnown: true,
      webhookMissingTopics: ['orders/cancelled'],
      webhookUnexpectedTopics: [],
      webhooksCheckedAt: '2026-08-08T10:00:00.000Z',
      lastWebhookEventAt: '2026-08-08T16:30:00.000Z',
    });

    expect(connection.lastWebhookEventAt).toBe('2026-08-08T16:30:00.000Z');
    expect(connection.webhookAddress).toBe('https://vestiflow.example/api/v1/shopify/webhooks');
    expect(connection.webhookAddressMatchesConfigured).toBe(false);
    expect(connection.webhookTopics).toEqual(['inventory_levels/update', 'orders/create']);
    expect(connection.webhookTopicsKnown).toBe(true);
    expect(connection.webhookMissingTopics).toEqual(['orders/cancelled']);
    expect(connection.webhooksCheckedAt).toBe('2026-08-08T10:00:00.000Z');
  });

  it('«non lo sappiamo» arriva come null e NON diventa false', () => {
    const connection = shopifyConnectionFromDto({
      ...baseDto,
      webhookAddress: null,
      webhookAddressMatchesConfigured: null,
      webhookTopics: [],
      webhookTopicsKnown: false,
      webhookMissingTopics: [],
      webhooksCheckedAt: null,
    });

    // Sono tre cose diverse e devono restare tali fino alla schermata: nessun indirizzo
    // osservato, nessun confronto possibile, nessun elenco — non «indirizzo sbagliato».
    expect(connection.webhookAddress).toBeNull();
    expect(connection.webhookAddressMatchesConfigured).toBeNull();
    expect(connection.webhookAddressMatchesConfigured).not.toBe(false);
    expect(connection.webhookTopicsKnown).toBe(false);
    expect(connection.webhookMissingTopics).toEqual([]);
  });
});
