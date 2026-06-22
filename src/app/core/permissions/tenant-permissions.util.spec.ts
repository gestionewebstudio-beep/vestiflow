import { describe, expect, it } from 'vitest';

import type { User } from '../models/user.model';
import { UserRole } from '../models/user.model';
import { TenantChannelProfile } from '../models/tenant-channel-profile.model';

import {
  canDeleteProducts,
  canManageCatalog,
  canManageMfa,
  canManageShopifyConnection,
  canManageSupplierOrders,
  hasTenantRoutePermission,
  isTenantAdmin,
  isTenantManager,
} from './tenant-permissions.util';

function userWithRole(role: User['role']): User {
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
  };
}

describe('tenant-permissions.util', () => {
  it('isTenantAdmin consente owner e admin', () => {
    expect(isTenantAdmin(userWithRole(UserRole.Owner))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Admin))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Manager))).toBe(false);
    expect(isTenantAdmin(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('isTenantManager include manager', () => {
    expect(isTenantManager(userWithRole(UserRole.Manager))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canManageCatalog e ordini fornitori seguono manager', () => {
    expect(canManageCatalog(userWithRole(UserRole.Manager))).toBe(true);
    expect(canManageSupplierOrders(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canDeleteProducts e Shopify connection sono admin-only', () => {
    expect(canDeleteProducts(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageShopifyConnection(userWithRole(UserRole.Admin))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Manager))).toBe(false);
  });

  it('canManageMfa include platform admin', () => {
    const platformAdmin = { ...userWithRole(UserRole.Clerk), isPlatformAdmin: true };
    expect(canManageMfa(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageMfa(platformAdmin)).toBe(true);
  });

  it('hasTenantRoutePermission rispecchia admin e manager', () => {
    expect(hasTenantRoutePermission(userWithRole(UserRole.Admin), 'admin')).toBe(true);
    expect(hasTenantRoutePermission(userWithRole(UserRole.Manager), 'admin')).toBe(false);
    expect(hasTenantRoutePermission(userWithRole(UserRole.Manager), 'manager')).toBe(true);
    expect(hasTenantRoutePermission(userWithRole(UserRole.Clerk), 'manager')).toBe(false);
  });
});
