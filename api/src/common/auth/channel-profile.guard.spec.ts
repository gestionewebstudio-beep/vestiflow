import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { TenantChannelProfile } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ChannelProfileGuard } from './channel-profile.guard';

function contextWith(profile: TenantChannelProfile | undefined): ExecutionContext {
  const request = profile === undefined ? {} : { appUser: { tenantChannelProfile: profile } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardRequiring(...profiles: TenantChannelProfile[]): ChannelProfileGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(profiles.length > 0 ? profiles : undefined),
  } as unknown as Reflector;
  return new ChannelProfileGuard(reflector);
}

describe('ChannelProfileGuard', () => {
  it('lascia passare il profilo richiesto', () => {
    const guard = guardRequiring(TenantChannelProfile.shopify);

    expect(guard.canActivate(contextWith(TenantChannelProfile.shopify))).toBe(true);
  });

  it('blocca un tenant solo gestionale sugli endpoint Shopify', () => {
    const guard = guardRequiring(TenantChannelProfile.shopify);

    expect(() => guard.canActivate(contextWith(TenantChannelProfile.gestionale))).toThrow(
      ForbiddenException,
    );
  });

  it('blocca un tenant Shopify sugli endpoint TikTok', () => {
    const guard = guardRequiring(TenantChannelProfile.tiktok_shop);

    expect(() => guard.canActivate(contextWith(TenantChannelProfile.shopify))).toThrow(
      ForbiddenException,
    );
  });

  it('non interviene se nessun profilo è richiesto', () => {
    const guard = guardRequiring();

    expect(guard.canActivate(contextWith(TenantChannelProfile.gestionale))).toBe(true);
  });

  it('lascia passare le rotte pubbliche (nessun appUser risolto)', () => {
    const guard = guardRequiring(TenantChannelProfile.shopify);

    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });
});
