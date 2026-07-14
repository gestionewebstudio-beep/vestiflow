import { describe, expect, it } from 'vitest';

import type { User } from '../models/user.model';
import { UserRole } from '../models/user.model';
import { TenantChannelProfile } from '../models/tenant-channel-profile.model';
import { TenantPermission } from '../models/tenant-permission.model';

import {
  canDeleteProducts,
  canExportOperationalData,
  canImportExportCatalog,
  canImportExportInventory,
  canManageCatalog,
  canManageMfa,
  canManageSettingsCompany,
  canManageShopifyConnection,
  canManageSupplierOrders,
  canManageTikTokConnection,
  canReceiveSupplierOrders,
  canSyncCatalogFromShopify,
  canSyncInventoryFromShopify,
  canSyncProductToShopify,
  canSyncShopifyOperationalData,
  canViewCustomers,
  canViewReports,
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
    tenantName: 'Cliente test',
    assignedLocationId: null,
    assignedLocationName: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tenant-permissions.util', () => {
  it('isTenantAdmin consente owner e admin', () => {
    expect(isTenantAdmin(userWithRole(UserRole.Owner))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Admin))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Manager))).toBe(false);
    expect(isTenantAdmin(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('isTenantAdmin è true con sessione assistenza attiva anche per clerk', () => {
    expect(
      isTenantAdmin(
        userWithRole(UserRole.Clerk, {
          supportSession: {
            sessionId: 'session-1',
            targetTenantId: 'tenant-client',
            targetTenantName: 'Cliente',
            expiresAt: '2026-06-24T16:00:00.000Z',
          },
        }),
      ),
    ).toBe(true);
  });

  it('isTenantManager include manager ma esclude clerk senza permessi operativi', () => {
    expect(isTenantManager(userWithRole(UserRole.Manager))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Clerk))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Owner))).toBe(true);
    expect(
      isTenantManager(
        userWithRole(UserRole.Clerk, {
          permissions: [TenantPermission.CustomersView],
        }),
      ),
    ).toBe(false);
  });

  it('isTenantManager include clerk con permesso magazzino', () => {
    expect(
      isTenantManager(
        userWithRole(UserRole.Clerk, {
          permissions: [TenantPermission.InventoryManage],
        }),
      ),
    ).toBe(true);
  });

  it('canManageCatalog e ordini fornitori seguono manager', () => {
    expect(canManageCatalog(userWithRole(UserRole.Manager))).toBe(true);
    expect(canManageCatalog(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Manager))).toBe(true);
  });

  it('canSyncCatalogFromShopify richiede catalog.import_export, non catalog.manage', () => {
    const catalogManageOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogManage],
    });

    expect(canManageCatalog(catalogManageOnly)).toBe(true);
    expect(canImportExportCatalog(catalogManageOnly)).toBe(false);
    expect(canSyncCatalogFromShopify(catalogManageOnly)).toBe(false);
    expect(canSyncProductToShopify(catalogManageOnly)).toBe(false);
  });

  it('import/export catalogo e giacenze sono permessi distinti', () => {
    const inventoryOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryImportExport],
    });
    const catalogOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogImportExport],
    });

    expect(canImportExportInventory(inventoryOnly)).toBe(true);
    expect(canImportExportCatalog(inventoryOnly)).toBe(false);
    expect(canSyncInventoryFromShopify(inventoryOnly)).toBe(true);
    expect(canSyncCatalogFromShopify(inventoryOnly)).toBe(false);

    expect(canImportExportCatalog(catalogOnly)).toBe(true);
    expect(canImportExportInventory(catalogOnly)).toBe(false);
    expect(canSyncCatalogFromShopify(catalogOnly)).toBe(true);
    expect(canSyncInventoryFromShopify(catalogOnly)).toBe(false);
  });

  it('canDeleteProducts e connessioni canali sono owner-only', () => {
    expect(canDeleteProducts(userWithRole(UserRole.Manager))).toBe(false);
    expect(canDeleteProducts(userWithRole(UserRole.Admin))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Owner))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Admin))).toBe(false);
    expect(canManageShopifyConnection(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageTikTokConnection(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canExportOperationalData e sync Shopify operativo', () => {
    expect(canExportOperationalData(userWithRole(UserRole.Manager))).toBe(true);
    expect(canExportOperationalData(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canSyncShopifyOperationalData(userWithRole(UserRole.Clerk))).toBe(false);
    expect(
      canSyncShopifyOperationalData(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.ReportsExport] }),
      ),
    ).toBe(true);
    expect(canSyncProductToShopify(userWithRole(UserRole.Manager))).toBe(true);
    expect(canSyncProductToShopify(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canManageMfa include platform admin', () => {
    const platformAdmin = { ...userWithRole(UserRole.Clerk), isPlatformAdmin: true };
    expect(canManageMfa(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageMfa(userWithRole(UserRole.Owner))).toBe(true);
    expect(canManageMfa(platformAdmin)).toBe(true);
  });

  it('ritorna false con utente null per ogni helper', () => {
    expect(isTenantAdmin(null)).toBe(false);
    expect(isTenantManager(undefined)).toBe(false);
    expect(canManageCatalog(null)).toBe(false);
    expect(canImportExportInventory(null)).toBe(false);
    expect(canManageSupplierOrders(null)).toBe(false);
    expect(canViewReports(null)).toBe(false);
    expect(canViewCustomers(null)).toBe(false);
  });

  it('canViewReports e canViewCustomers rispettano permessi espliciti', () => {
    const noReports = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryManage, TenantPermission.CustomersView],
    });
    expect(canViewReports(noReports)).toBe(false);
    expect(canViewCustomers(noReports)).toBe(true);

    const reportsOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.ReportsView],
    });
    expect(canViewReports(reportsOnly)).toBe(true);
    expect(canViewCustomers(reportsOnly)).toBe(false);
  });

  it('canReceiveSupplierOrders include manage o receive', () => {
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.SupplierOrdersReceive] }),
      ),
    ).toBe(true);
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.SupplierOrdersManage] }),
      ),
    ).toBe(true);
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.InventoryManage] }),
      ),
    ).toBe(false);
  });

  it('canManageSettingsCompany richiede settings.company', () => {
    expect(canManageSettingsCompany(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageSettingsCompany(userWithRole(UserRole.Admin))).toBe(true);
    expect(
      canManageSettingsCompany(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.SettingsCompany] }),
      ),
    ).toBe(true);
  });
});
