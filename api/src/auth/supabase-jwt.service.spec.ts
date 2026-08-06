import { describe, expect, it } from 'vitest';

import { SupabaseJwtService } from './supabase-jwt.service';

describe('SupabaseJwtService', () => {
  function createService(values: Record<string, string | undefined>) {
    return new SupabaseJwtService({
      get: (key: string) => values[key],
    } as never);
  }

  it('isConfigured false senza variabili Supabase', () => {
    expect(createService({}).isConfigured()).toBe(false);
  });

  it('isConfigured true con URL e JWT secret', () => {
    const service = createService({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_SECRET: 'test-jwt-secret',
    });

    expect(service.isConfigured()).toBe(true);
  });

  it('verifyAccessToken rifiuta token malformato', async () => {
    const service = createService({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_SECRET: 'test-jwt-secret',
    });

    await expect(service.verifyAccessToken('not-a-jwt')).resolves.toBeNull();
  });
});
