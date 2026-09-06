import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { testClerkUser, testOwnerUser } from '../../test/fixtures/user-profile.fixture';
import { TenantOwnerGuard } from './tenant-owner.guard';

import type { ExecutionContext } from '@nestjs/common';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantOwnerGuard', () => {
  const guard = new TenantOwnerGuard();

  it('consente il titolare', () => {
    expect(guard.canActivate(contextFor({ appUser: testOwnerUser() }))).toBe(true);
  });

  it('consente la sessione di assistenza Vestiflow', () => {
    expect(
      guard.canActivate(
        contextFor({ appUser: testClerkUser(), supportSession: { sessionId: 's1' } }),
      ),
    ).toBe(true);
  });

  it('blocca ogni altro ruolo, anche admin', () => {
    expect(() => guard.canActivate(contextFor({ appUser: testClerkUser() }))).toThrow(
      ForbiddenException,
    );
  });
});
