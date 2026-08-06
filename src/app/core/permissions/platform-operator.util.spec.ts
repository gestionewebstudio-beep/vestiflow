import { describe, expect, it } from 'vitest';

import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import {
  hasActiveSupportSession,
  isPlatformOperator,
  isTenantWorkspaceUrl,
  PLATFORM_OPERATOR_HOME,
  resolvePlatformOperatorReturnUrl,
} from './platform-operator.util';

const baseUser: User = {
  id: 'u1',
  tenantId: 't1',
  email: 'op@example.com',
  displayName: 'Operatore',
  avatarUrl: null,
  role: UserRole.Owner,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: true,
  tenantChannelProfile: 'gestionale',
  tenantName: 'Cliente test',
  hasAllLocationsAccess: true,
  assignedLocationIds: [],
  assignedLocations: [],
  defaultLocationId: null,
  defaultLocation: null,
  permissions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('platform-operator.util', () => {
  it('isPlatformOperator riconosce isPlatformAdmin', () => {
    expect(isPlatformOperator(baseUser)).toBe(true);
    expect(isPlatformOperator({ ...baseUser, isPlatformAdmin: false })).toBe(false);
  });

  it('isPlatformOperator è false con sessione assistenza attiva', () => {
    expect(
      isPlatformOperator({
        ...baseUser,
        supportSession: {
          sessionId: 's1',
          targetTenantId: 't2',
          targetTenantName: 'Cliente',
          expiresAt: '2026-06-22T16:00:00.000Z',
        },
      }),
    ).toBe(false);
    expect(
      hasActiveSupportSession({
        ...baseUser,
        supportSession: {
          sessionId: 's1',
          targetTenantId: 't2',
          targetTenantName: 'Cliente',
          expiresAt: '2026-06-22T16:00:00.000Z',
        },
      }),
    ).toBe(true);
  });

  it('isTenantWorkspaceUrl distingue area admin', () => {
    expect(isTenantWorkspaceUrl('/app/settings')).toBe(true);
    expect(isTenantWorkspaceUrl('/app/admin/clients')).toBe(false);
    expect(isTenantWorkspaceUrl('/app/admin/clients/new')).toBe(false);
  });

  it('resolvePlatformOperatorReturnUrl manda operatore alla home admin', () => {
    expect(resolvePlatformOperatorReturnUrl(baseUser, null)).toBe(PLATFORM_OPERATOR_HOME);
    expect(resolvePlatformOperatorReturnUrl(baseUser, '/app/settings')).toBe(
      PLATFORM_OPERATOR_HOME,
    );
    expect(resolvePlatformOperatorReturnUrl(baseUser, '/app/admin/account')).toBe(
      '/app/admin/account',
    );
  });

  it('resolvePlatformOperatorReturnUrl lascia invariato il tenant', () => {
    const tenantUser = { ...baseUser, isPlatformAdmin: false };
    expect(resolvePlatformOperatorReturnUrl(tenantUser, '/app/products')).toBe('/app/products');
    expect(resolvePlatformOperatorReturnUrl(tenantUser, null)).toBe('/app/dashboard');
  });
});
