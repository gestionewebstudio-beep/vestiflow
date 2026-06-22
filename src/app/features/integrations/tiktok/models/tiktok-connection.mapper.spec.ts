import { describe, expect, it } from 'vitest';

import { TikTokConnectionStatus } from '@core/models/tiktok-connection.model';

import { tiktokConnectionFromDto } from './tiktok-connection.mapper';
import type { TikTokConnectionDto } from './tiktok-connection.dto';

describe('tiktokConnectionFromDto', () => {
  it('mappa connessione con campi opzionali', () => {
    const dto: TikTokConnectionDto = {
      id: 'tt-1',
      tenantId: 'tenant-1',
      status: TikTokConnectionStatus.Connected,
      shopId: 'shop-123',
      shopCipher: 'cipher-abc',
      displayName: 'TikTok Shop IT',
      region: 'IT',
      scopes: ['product.read'],
      lastConnectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncAt: '2026-06-01T00:00:00.000Z',
      lastError: {
        message: 'Sync fallita',
        occurredAt: '2026-06-02T00:00:00.000Z',
        code: 'tiktok_error',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    };

    const connection = tiktokConnectionFromDto(dto);
    expect(connection.shopId).toBe('shop-123');
    expect(connection.region).toBe('IT');
    expect(connection.lastError?.message).toBe('Sync fallita');
  });

  it('normalizza null in undefined', () => {
    const dto: TikTokConnectionDto = {
      id: 'tt-2',
      tenantId: 'tenant-1',
      status: TikTokConnectionStatus.NotConnected,
      shopId: null,
      shopCipher: null,
      displayName: null,
      region: null,
      lastConnectedAt: null,
      lastSyncAt: null,
      lastError: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const connection = tiktokConnectionFromDto(dto);
    expect(connection.shopId).toBeUndefined();
    expect(connection.lastError).toBeUndefined();
  });
});
