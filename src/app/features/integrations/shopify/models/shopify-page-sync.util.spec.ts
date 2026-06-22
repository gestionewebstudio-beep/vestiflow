import { describe, expect, it } from 'vitest';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { UserRole } from '@core/models/user.model';

import { canManageShopifySync, isShopifyConnected } from './shopify-page-sync.util';

const adminUser = {
  id: 'u1',
  tenantId: 't1',
  email: 'admin@test.it',
  displayName: 'Admin',
  avatarUrl: null,
  role: UserRole.Admin,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: false,
  tenantChannelProfile: 'shopify' as const,
  tenantName: 'Cliente test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('shopify-page-sync.util', () => {
  describe('canManageShopifySync', () => {
    it('consente sync ad admin e owner', () => {
      expect(canManageShopifySync(adminUser)).toBe(true);
      expect(canManageShopifySync({ ...adminUser, role: UserRole.Owner })).toBe(true);
    });

    it('nega sync a manager e clerk', () => {
      expect(canManageShopifySync({ ...adminUser, role: UserRole.Manager })).toBe(false);
      expect(canManageShopifySync({ ...adminUser, role: UserRole.Clerk })).toBe(false);
      expect(canManageShopifySync(null)).toBe(false);
    });
  });

  describe('isShopifyConnected', () => {
    it('ritorna true solo se status Connected', () => {
      expect(
        isShopifyConnected({
          id: 'c1',
          tenantId: 't1',
          status: ShopifyConnectionStatus.Connected,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).toBe(true);
      expect(
        isShopifyConnected({
          id: 'c1',
          tenantId: 't1',
          status: ShopifyConnectionStatus.Error,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).toBe(false);
      expect(isShopifyConnected(null)).toBe(false);
    });
  });
});
