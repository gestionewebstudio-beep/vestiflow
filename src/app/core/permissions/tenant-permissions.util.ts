import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

/** owner, admin — Shopify OAuth, sync bulk, eliminazione prodotti. */
export function isTenantAdmin(user: User | null | undefined): boolean {
  return user?.role === UserRole.Owner || user?.role === UserRole.Admin;
}

/** owner, admin, manager — catalogo, CSV, ordini fornitori (creazione/invio). */
export function isTenantManager(user: User | null | undefined): boolean {
  return isTenantAdmin(user) || user?.role === UserRole.Manager;
}

/** Alias semantico: connessione Shopify e sync da liste (allineato a ADMIN_ROLES API). */
export function canManageShopifyConnection(user: User | null | undefined): boolean {
  return isTenantAdmin(user);
}

/** Connessione TikTok Shop — stessi ruoli della connessione Shopify. */
export function canManageTikTokConnection(user: User | null | undefined): boolean {
  return isTenantAdmin(user);
}

/** Creazione/modifica prodotti, import/export CSV catalogo e giacenze. */
export function canManageCatalog(user: User | null | undefined): boolean {
  return isTenantManager(user);
}

/** Push singolo prodotto verso Shopify (allineato a MANAGER_ROLES API). */
export function canSyncProductToShopify(user: User | null | undefined): boolean {
  return isTenantManager(user);
}

/** Eliminazione prodotti (allineato a ADMIN_ROLES API). */
export function canDeleteProducts(user: User | null | undefined): boolean {
  return isTenantAdmin(user);
}

/** Export CSV vendite/clienti (allineato a MANAGER_ROLES API). */
export function canExportOperationalData(user: User | null | undefined): boolean {
  return isTenantManager(user);
}

/** Creazione e invio ordini fornitore (ricezione aperta a tutti i ruoli autenticati). */
export function canManageSupplierOrders(user: User | null | undefined): boolean {
  return isTenantManager(user);
}

/** MFA in Impostazioni: titolare, admin e operatori piattaforma. */
export function canManageMfa(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return isTenantAdmin(user) || user.isPlatformAdmin;
}

export type TenantRoutePermission = 'admin' | 'manager';

export const TENANT_ROUTE_PERMISSION_KEY = 'tenantPermission';

export function hasTenantRoutePermission(
  user: User | null | undefined,
  permission: TenantRoutePermission,
): boolean {
  return permission === 'admin' ? isTenantAdmin(user) : isTenantManager(user);
}
