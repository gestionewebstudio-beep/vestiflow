import { describe, expect, it } from 'vitest';

import type { User } from '../models/user.model';
import { UserRole } from '../models/user.model';
import { TenantChannelProfile } from '../models/tenant-channel-profile.model';

import {
  canDeleteProducts,
  canExportOperationalData,
  canManageCatalog,
  canManageMfa,
  canManageShopifyConnection,
  canManageSupplierOrders,
  canManageTikTokConnection,
  canSyncProductToShopify,
  hasTenantRoutePermission,
  isTenantAdmin,
  isTenantManager,
} from './tenant-permissions.util';

function userWithRole(role: User['role'], overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'test@example.com',
    displayName: 'Test',
    avatarUrl: null,
    role,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ALL_ROLES = [UserRole.Owner, UserRole.Admin, UserRole.Manager, UserRole.Clerk] as const;

describe('tenant-permissions.util', () => {
  it('isTenantAdmin consente owner e admin', () => {
    expect(isTenantAdmin(userWithRole(UserRole.Owner))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Admin))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Manager))).toBe(false);
    expect(isTenantAdmin(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('isTenantManager include manager ma esclude clerk', () => {
    expect(isTenantManager(userWithRole(UserRole.Manager))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Clerk))).toBe(false);
    expect(isTenantManager(userWithRole(UserRole.Owner))).toBe(true);
  });

  it('canManageCatalog e ordini fornitori seguono manager', () => {
    expect(canManageCatalog(userWithRole(UserRole.Manager))).toBe(true);
    expect(canManageCatalog(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Manager))).toBe(true);
  });

  it('canDeleteProducts e connessioni canali sono admin-only', () => {
    expect(canDeleteProducts(userWithRole(UserRole.Manager))).toBe(false);
    expect(canDeleteProducts(userWithRole(UserRole.Admin))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Admin))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageTikTokConnection(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canExportOperationalData e sync prodotto Shopify seguono manager', () => {
    expect(canExportOperationalData(userWithRole(UserRole.Manager))).toBe(true);
    expect(canExportOperationalData(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canSyncProductToShopify(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canSyncProductToShopify(userWithRole(UserRole.Manager))).toBe(true);
  });

  it('canManageMfa include platform admin', () => {
    const platformAdmin = { ...userWithRole(UserRole.Clerk), isPlatformAdmin: true };
    expect(canManageMfa(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageMfa(userWithRole(UserRole.Owner))).toBe(true);
    expect(canManageMfa(platformAdmin)).toBe(true);
  });

  it('hasTenantRoutePermission rispecchia admin e manager per ogni ruolo', () => {
    const matrix: Record<User['role'], { admin: boolean; manager: boolean }> = {
      [UserRole.Owner]: { admin: true, manager: true },
      [UserRole.Admin]: { admin: true, manager: true },
      [UserRole.Manager]: { admin: false, manager: true },
      [UserRole.Clerk]: { admin: false, manager: false },
    };

    for (const role of ALL_ROLES) {
      const user = userWithRole(role);
      expect(hasTenantRoutePermission(user, 'admin')).toBe(matrix[role].admin);
      expect(hasTenantRoutePermission(user, 'manager')).toBe(matrix[role].manager);
    }
  });

  it('ritorna false con utente null per ogni helper', () => {
    expect(isTenantAdmin(null)).toBe(false);
    expect(isTenantManager(undefined)).toBe(false);
    expect(canManageCatalog(null)).toBe(false);
    expect(canManageSupplierOrders(null)).toBe(false);
    expect(hasTenantRoutePermission(null, 'manager')).toBe(false);
  });
});
