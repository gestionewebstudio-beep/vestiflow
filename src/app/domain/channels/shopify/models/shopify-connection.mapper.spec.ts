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
});
