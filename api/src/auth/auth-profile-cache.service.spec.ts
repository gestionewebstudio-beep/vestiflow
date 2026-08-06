import { describe, expect, it, vi } from 'vitest';

import { AuthProfileCacheService } from './auth-profile-cache.service';

describe('AuthProfileCacheService', () => {
  it('memorizza e recupera profilo entro TTL', () => {
    const cache = new AuthProfileCacheService();
    const appUser = { displayName: 'Mario', role: 'admin' } as never;

    cache.set('auth-1', 'tenant-1', appUser);

    expect(cache.get('auth-1')).toMatchObject({
      tenantId: 'tenant-1',
      appUser,
    });
  });

  it('invalida entry scadute o rimosse', () => {
    vi.useFakeTimers();
    const cache = new AuthProfileCacheService();
    cache.set('auth-1', 'tenant-1', { displayName: 'Mario' } as never);

    vi.advanceTimersByTime(61_000);

    expect(cache.get('auth-1')).toBeNull();

    cache.set('auth-2', 'tenant-1', { displayName: 'Luigi' } as never);
    cache.invalidate('auth-2');

    expect(cache.get('auth-2')).toBeNull();
    vi.useRealTimers();
  });
});
