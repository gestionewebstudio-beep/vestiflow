import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { TenantPermission, type TenantPermissionKey } from '@core/models/tenant-permission.model';

import {
  hasAnyTenantPermission,
  hasFullTenantAccess,
  hasTenantPermission,
} from './user-permissions.util';

/** Permessi sufficienti per aprire la sezione Prodotti (nav + liste). */
export const CATALOG_SECTION_PERMISSIONS = [
  TenantPermission.CatalogManage,
  TenantPermission.CatalogImportExport,
  TenantPermission.CatalogDelete,
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
] as const satisfies readonly TenantPermissionKey[];

/** Permessi sufficienti per aprire la sezione Magazzino (nav + consultazione). */
export const INVENTORY_SECTION_PERMISSIONS = [
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.InventoryViewAllLocations,
] as const satisfies readonly TenantPermissionKey[];

export const SUPPLIER_ORDERS_VIEW_PERMISSIONS = [
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
] as const satisfies readonly TenantPermissionKey[];

export const CUSTOMERS_VIEW_PERMISSIONS = [
  TenantPermission.CustomersView,
  TenantPermission.CustomersManage,
] as const satisfies readonly TenantPermissionKey[];

export const REQUIRED_TENANT_PERMISSIONS_KEY = 'requiredTenantPermissions';

export type RequiredTenantPermissionsMode = 'any' | 'all';

export const REQUIRED_TENANT_PERMISSIONS_MODE_KEY = 'requiredTenantPermissionsMode';

/** Titolare o ruolo admin (permessi granulari sulle singole azioni). */
export function isTenantAdmin(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return user?.role === UserRole.Admin;
}

/** Accesso operativo manager: almeno un permesso di gestione catalogo/magazzino/ordini. */
export function isTenantManager(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return (
    hasTenantPermission(user, TenantPermission.CatalogManage) ||
    hasTenantPermission(user, TenantPermission.CatalogImportExport) ||
    hasTenantPermission(user, TenantPermission.SupplierOrdersManage) ||
    hasTenantPermission(user, TenantPermission.InventoryImportExport) ||
    hasTenantPermission(user, TenantPermission.InventoryManage)
  );
}

export function canManageShopifyConnection(user: User | null | undefined): boolean {
  return hasFullTenantAccess(user);
}

export function canManageTikTokConnection(user: User | null | undefined): boolean {
  return canManageShopifyConnection(user);
}

export function canManageCatalog(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CatalogManage);
}

export function canImportExportCatalog(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CatalogImportExport);
}

export function canImportExportInventory(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.InventoryImportExport);
}

/** Sync catalogo Shopify da liste prodotti (permesso CSV prodotti). */
export function canSyncCatalogFromShopify(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return canImportExportCatalog(user);
}

/** Sync giacenze Shopify da magazzino (permesso CSV giacenze). */
export function canSyncInventoryFromShopify(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return canImportExportInventory(user);
}

/** Sync clienti/vendite da Shopify (export dati). */
export function canSyncShopifyOperationalData(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return canExportOperationalData(user);
}

export function canSyncProductToShopify(user: User | null | undefined): boolean {
  return canSyncCatalogFromShopify(user);
}

export function canDeleteProducts(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CatalogDelete);
}

export function canExportOperationalData(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.ReportsExport);
}

export function canManageSupplierOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SupplierOrdersManage);
}

export function canReceiveSupplierOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return (
    hasTenantPermission(user, TenantPermission.SupplierOrdersReceive) ||
    hasTenantPermission(user, TenantPermission.SupplierOrdersManage)
  );
}

export function canViewSupplierOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, SUPPLIER_ORDERS_VIEW_PERMISSIONS);
}

export function canViewReports(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.ReportsView);
}

export function canViewCustomers(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, CUSTOMERS_VIEW_PERMISSIONS);
}

export function canManageCustomers(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CustomersManage);
}

export function canAccessCatalogSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, CATALOG_SECTION_PERMISSIONS);
}

export function canAccessInventorySection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, INVENTORY_SECTION_PERMISSIONS);
}

export function canManageSettingsCompany(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SettingsCompany);
}

export function canManageInventory(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.InventoryManage);
}

export function canViewInventoryAllLocations(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.InventoryViewAllLocations);
}

export function canRegisterRetailSales(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.RetailRegister);
}

export function canRegisterOnlineSales(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.RetailRegisterOnline);
}

export function canManageMfa(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return hasFullTenantAccess(user) || user.isPlatformAdmin;
}

export type TenantRoutePermission = 'admin' | 'manager';

export const TENANT_ROUTE_PERMISSION_KEY = 'tenantPermission';

export function hasTenantRoutePermission(
  user: User | null | undefined,
  permission: TenantRoutePermission,
): boolean {
  if (permission === 'admin') {
    return (
      hasFullTenantAccess(user) ||
      (user?.role === UserRole.Admin && hasTenantPermission(user, TenantPermission.SettingsCompany))
    );
  }
  return isTenantManager(user);
}
