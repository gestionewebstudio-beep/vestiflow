import { describe, expect, it } from 'vitest';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { UserRole } from '@core/models/user.model';
import { TenantPermission } from '@core/models/tenant-permission.model';

import {
  canManageShopifySync,
  canSyncShopifyCatalog,
  canSyncShopifyCustomersOrOrders,
  canSyncShopifyInventory,
  isShopifyConnected,
} from './shopify-page-sync.util';

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
  assignedLocationId: null,
  assignedLocationName: null,
  permissions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('shopify-page-sync.util', () => {
  it('canSyncShopifyInventory consente sync giacenze con permesso inventory.import_export', () => {
    const clerk = {
      ...adminUser,
      role: UserRole.Clerk,
      permissions: [TenantPermission.InventoryImportExport],
    };
    expect(canSyncShopifyInventory(clerk)).toBe(true);
    expect(canSyncShopifyCatalog(clerk)).toBe(false);
  });

  it('canSyncShopifyCatalog consente sync catalogo con permesso catalog.import_export', () => {
    const clerk = {
      ...adminUser,
      role: UserRole.Clerk,
      permissions: [TenantPermission.CatalogImportExport],
    };
    expect(canSyncShopifyCatalog(clerk)).toBe(true);
    expect(canSyncShopifyInventory(clerk)).toBe(false);
  });

  it('canSyncShopifyCustomersOrOrders segue reports.export', () => {
    const clerk = {
      ...adminUser,
      role: UserRole.Clerk,
      permissions: [TenantPermission.ReportsExport],
    };
    expect(canSyncShopifyCustomersOrOrders(clerk)).toBe(true);
    expect(canSyncShopifyCatalog(clerk)).toBe(false);
  });

  it('canManageShopifySync legacy consente sync catalogo solo con import/export', () => {
    expect(
      canManageShopifySync({
        ...adminUser,
        permissions: [TenantPermission.CatalogManage],
      }),
    ).toBe(false);
    expect(
      canManageShopifySync({
        ...adminUser,
        role: UserRole.Clerk,
        permissions: [TenantPermission.CatalogImportExport],
      }),
    ).toBe(true);
    expect(
      canManageShopifySync({
        ...adminUser,
        role: UserRole.Manager,
        permissions: [TenantPermission.CatalogManage],
      }),
    ).toBe(false);
    expect(canManageShopifySync({ ...adminUser, role: UserRole.Owner })).toBe(true);
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
