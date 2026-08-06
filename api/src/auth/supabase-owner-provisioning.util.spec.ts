import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { isSupabaseOwnerEmailInviteEnabled } from './supabase-owner-provisioning.util';

function createConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('isSupabaseOwnerEmailInviteEnabled', () => {
  it('false se variabile assente o diversa da true', () => {
    expect(isSupabaseOwnerEmailInviteEnabled(createConfig({}))).toBe(false);
    expect(isSupabaseOwnerEmailInviteEnabled(createConfig({ SUPABASE_OWNER_EMAIL_INVITE: 'false' }))).toBe(
      false,
    );
  });

  it('true solo con SUPABASE_OWNER_EMAIL_INVITE=true', () => {
    expect(isSupabaseOwnerEmailInviteEnabled(createConfig({ SUPABASE_OWNER_EMAIL_INVITE: 'true' }))).toBe(
      true,
    );
    expect(isSupabaseOwnerEmailInviteEnabled(createConfig({ SUPABASE_OWNER_EMAIL_INVITE: 'TRUE' }))).toBe(
      true,
    );
  });
});
