import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from './supabase.service';

function createConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('SupabaseService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isConfigured false senza credenziali', () => {
    const service = new SupabaseService(createConfig({}));

    expect(service.isConfigured()).toBe(false);
    expect(service.getStorageClient()).toBeNull();
  });

  it('isConfigured true con URL e service role', () => {
    const service = new SupabaseService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    );

    expect(service.isConfigured()).toBe(true);
    expect(service.getStorageClient()).not.toBeNull();
  });

  it('getUserFromAccessToken restituisce null se non configurato', async () => {
    const service = new SupabaseService(createConfig({}));

    await expect(service.getUserFromAccessToken('token')).resolves.toBeNull();
  });

  it('createAuthUser fallisce se Supabase non configurato', async () => {
    const service = new SupabaseService(createConfig({}));

    await expect(service.createAuthUser('a@b.com', 'password123')).rejects.toThrow(
      'Supabase non configurato',
    );
  });

  it('userHasVerifiedTotpFactor true con fattore TOTP verificato', async () => {
    const service = new SupabaseService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    );

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ factor_type: 'totp', status: 'verified', id: 'factor-1' }],
    } as Response);

    await expect(service.userHasVerifiedTotpFactor('user-1')).resolves.toBe(true);
  });

  it('cleanupUnverifiedTotpFactors elimina fattori TOTP non verificati', async () => {
    const service = new SupabaseService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    );

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'DELETE') {
        return { ok: true } as Response;
      }
      if (url.includes('/factors')) {
        return {
          ok: true,
          json: async () => [
            { factor_type: 'totp', status: 'unverified', id: 'factor-pending' },
            { factor_type: 'totp', status: 'verified', id: 'factor-verified' },
          ],
        } as Response;
      }
      return { ok: false } as Response;
    });

    await expect(service.cleanupUnverifiedTotpFactors('user-1')).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/factors/factor-pending'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
