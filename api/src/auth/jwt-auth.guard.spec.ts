import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthProfileCacheService } from './auth-profile-cache.service';
import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseJwtService } from './supabase-jwt.service';
import type { SupabaseService } from './supabase.service';
import type { SupportSessionService } from '../support/support-session.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const jwt = {
    isConfigured: vi.fn(),
    verifyAccessToken: vi.fn(),
  };
  const profileCache = { get: vi.fn(), set: vi.fn() };
  const prisma = { user: { findFirst: vi.fn() }, tenant: { findUnique: vi.fn() } };
  const platformAdmin = { isPlatformAdmin: vi.fn().mockReturnValue(false) };
  const supabase = { userHasVerifiedTotpFactor: vi.fn() };
  const supportSessions = { resolveActiveSession: vi.fn() };

  const guard = new JwtAuthGuard(
    reflector,
    jwt as unknown as SupabaseJwtService,
    profileCache as unknown as AuthProfileCacheService,
    prisma as unknown as PrismaService,
    platformAdmin as unknown as PlatformAdminService,
    supabase as unknown as SupabaseService,
    supportSessions as unknown as SupportSessionService,
  );

  function context(authHeader?: string) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => (name === 'authorization' ? authHeader : undefined),
          tenantId: undefined,
          authUserId: undefined,
          appUser: undefined,
        }),
      }),
    };
  }

  it('consente route pubbliche', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(context() as never)).resolves.toBe(true);
    expect(jwt.verifyAccessToken).not.toHaveBeenCalled();
    reflector.getAllAndOverride.mockRestore?.();
  });

  it('rifiuta richieste senza Bearer token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? false : undefined,
    );
    jwt.isConfigured.mockReturnValue(true);

    await expect(guard.canActivate(context() as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('usa profilo in cache se disponibile', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwt.isConfigured.mockReturnValue(true);
    jwt.verifyAccessToken.mockResolvedValue({ authUserId: 'auth-1', assuranceLevel: 'aal2' });
    profileCache.get.mockReturnValue({
      tenantId: 'tenant-1',
      appUser: { displayName: 'Mario', role: 'admin' },
    });

    const request = {
      header: (name: string) => (name === 'authorization' ? 'Bearer valid-token' : undefined),
      tenantId: undefined as string | undefined,
      authUserId: undefined as string | undefined,
      appUser: undefined as { displayName: string; role: string } | undefined,
    };
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-1');
    expect(request.appUser?.displayName).toBe('Mario');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
