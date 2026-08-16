import { showRetailSalesRegister } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  ANY_DOCUMENT_MANAGE_PERMISSIONS,
  ANY_DOCUMENT_VIEW_PERMISSIONS,
  TenantPermission,
  docManagePermission,
  docViewPermission,
  type DocumentPermissionFamily,
  type TenantPermissionKey,
} from '@core/models/tenant-permission.model';

import {
  hasAnyTenantPermission,
  hasFullTenantAccess,
  hasTenantPermission,
} from './user-permissions.util';

// ── Gate composti per rotte e sidebar (specchio delle costanti API) ────────

/** Sezione Prodotti (nav + rotte catalogo in consultazione). */
export const CATALOG_SECTION_PERMISSIONS = [
  TenantPermission.SectionProducts,
] as const satisfies readonly TenantPermissionKey[];

/** Sezione Magazzino (nav + rotte giacenze/movimenti). */
export const INVENTORY_SECTION_PERMISSIONS = [
  TenantPermission.SectionInventory,
] as const satisfies readonly TenantPermissionKey[];

/** Sezione Fornitori (anagrafiche). */
export const SUPPLIERS_SECTION_PERMISSIONS = [
  TenantPermission.SectionSuppliers,
] as const satisfies readonly TenantPermissionKey[];

export const SUPPLIER_ORDERS_VIEW_PERMISSIONS = [
  docViewPermission('supplier_order'),
  docManagePermission('supplier_order'),
] as const satisfies readonly TenantPermissionKey[];

export const SUPPLIER_ORDERS_MANAGE_PERMISSIONS = [
  docManagePermission('supplier_order'),
] as const satisfies readonly TenantPermissionKey[];

export const SALES_ORDERS_VIEW_PERMISSIONS = [
  docViewPermission('sales_order'),
  docManagePermission('sales_order'),
] as const satisfies readonly TenantPermissionKey[];

export const SALES_ORDERS_MANAGE_PERMISSIONS = [
  docManagePermission('sales_order'),
] as const satisfies readonly TenantPermissionKey[];

// ── Gate di ROTTA a gruppi: sezione (porta) E contenuto ───────────────────
// Specchio dei gate API: la sezione sta sul controller, la famiglia
// sull'handler. Con un elenco piatto il client aprirebbe rotte che il server
// nega — schermata vuota e 403 su ogni chiamata.

export const SALES_ORDERS_VIEW_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  [TenantPermission.SectionSales],
  SALES_ORDERS_VIEW_PERMISSIONS,
];

export const SALES_ORDERS_MANAGE_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  [TenantPermission.SectionSales],
  SALES_ORDERS_MANAGE_PERMISSIONS,
];

export const SUPPLIER_ORDERS_VIEW_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  [TenantPermission.SectionSuppliers],
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
];

export const SUPPLIER_ORDERS_MANAGE_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  [TenantPermission.SectionSuppliers],
  SUPPLIER_ORDERS_MANAGE_PERMISSIONS,
];

/** Registro documenti: basta poter consultare UNA famiglia (il filtro per tipo fa il resto). */
export const DOCUMENTS_SECTION_PERMISSIONS = ANY_DOCUMENT_VIEW_PERMISSIONS;

/**
 * Registro documenti come gate di ROTTA: la sezione è una porta (l'API la
 * esige a livello di classe) e dentro serve almeno una famiglia consultabile.
 */
export const DOCUMENTS_SECTION_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  [TenantPermission.SectionDocuments],
  ANY_DOCUMENT_VIEW_PERMISSIONS,
];

export const CUSTOMERS_VIEW_PERMISSIONS = [
  TenantPermission.SectionCustomers,
  TenantPermission.CustomersManage,
] as const satisfies readonly TenantPermissionKey[];

export const REPORTS_VIEW_PERMISSIONS = [
  TenantPermission.SectionReports,
] as const satisfies readonly TenantPermissionKey[];

/** Vendite online e corrispettivi: raggiungibili da Vendite o dai Report. */
export const ONLINE_SALES_VIEW_PERMISSIONS = [
  TenantPermission.SectionSales,
  TenantPermission.SectionReports,
] as const satisfies readonly TenantPermissionKey[];

/** Sezione (Vendite o Report) E famiglia «Vendite online e corrispettivi». */
export const ONLINE_SALES_VIEW_GROUPS: readonly (readonly TenantPermissionKey[])[] = [
  ONLINE_SALES_VIEW_PERMISSIONS,
  [docViewPermission('online_sale')],
];

export const REQUIRED_TENANT_PERMISSIONS_KEY = 'requiredTenantPermissions';

/**
 * Rotte che richiedono almeno un permesso da OGNI gruppo: specchio di
 * `RequireAllPermissionGroups` lato API. Serve per «sezione E famiglia», che
 * un elenco piatto non sa esprimere.
 */
export const REQUIRED_TENANT_PERMISSION_GROUPS_KEY = 'requiredTenantPermissionGroups';

export type RequiredTenantPermissionsMode = 'any' | 'all';

export const REQUIRED_TENANT_PERMISSIONS_MODE_KEY = 'requiredTenantPermissionsMode';

// ── Ruoli ──────────────────────────────────────────────────────────────────

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
    hasTenantPermission(user, docManagePermission('supplier_order')) ||
    hasTenantPermission(user, TenantPermission.InventoryImportExport) ||
    hasTenantPermission(user, TenantPermission.InventoryManage)
  );
}

// ── Sezioni ────────────────────────────────────────────────────────────────

export function canAccessCatalogSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionProducts);
}

export function canAccessInventorySection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionInventory);
}

export function canAccessSuppliersSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionSuppliers);
}

export function canAccessDocumentsSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return (
    hasTenantPermission(user, TenantPermission.SectionDocuments) &&
    hasAnyTenantPermission(user, ANY_DOCUMENT_VIEW_PERMISSIONS)
  );
}

export function canAccessSalesSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionSales);
}

export function canAccessSettingsSection(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionSettings);
}

// ── Matrice documenti ──────────────────────────────────────────────────────

export function canViewDocFamily(
  user: User | null | undefined,
  family: DocumentPermissionFamily,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  // «Gestisci» implica «Consulta».
  return (
    hasTenantPermission(user, docViewPermission(family)) ||
    hasTenantPermission(user, docManagePermission(family))
  );
}

export function canManageDocFamily(
  user: User | null | undefined,
  family: DocumentPermissionFamily,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, docManagePermission(family));
}

/** Consultazione registro documenti: almeno una famiglia visibile. */
export function canViewDocuments(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, ANY_DOCUMENT_VIEW_PERMISSIONS);
}

/** Gestione documenti: almeno una famiglia gestibile. */
export function canManageDocuments(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, ANY_DOCUMENT_MANAGE_PERMISSIONS);
}

export function canViewSupplierOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, SUPPLIER_ORDERS_VIEW_PERMISSIONS);
}

export function canManageSupplierOrders(user: User | null | undefined): boolean {
  return canManageDocFamily(user, 'supplier_order');
}

/** Ricezione merce: chi gestisce l'arrivo merce o l'ordine fornitore. */
export function canReceiveSupplierOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return canManageDocFamily(user, 'goods_receipt') || canManageDocFamily(user, 'supplier_order');
}

export function canViewSalesOrders(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasAnyTenantPermission(user, SALES_ORDERS_VIEW_PERMISSIONS);
}

export function canManageSalesOrders(user: User | null | undefined): boolean {
  return canManageDocFamily(user, 'sales_order');
}

// ── Azioni ─────────────────────────────────────────────────────────────────

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

/**
 * Dato sensibile (§permessi): costo d'acquisto visibile dove si vende (es.
 * colonna Costo nell'Ordine cliente). Senza permesso la colonna non compare
 * nemmeno tra le opzioni del selettore colonne.
 */
export function canViewPurchaseCosts(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CatalogViewPurchaseCosts);
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

/** Riallineamento giacenze verso Shopify da magazzino (permesso CSV giacenze). */
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

/**
 * Scritture del registro corrispettivi derivato (righe, esclusioni, rettifiche).
 * Distinto dall'export: scaricare un CSV e correggere la contabilità sono due
 * mestieri diversi.
 *
 * ⚠️ Non riguarda più «la consegna al commercialista»: quel flusso è stato
 * ritirato il 16/08/2026 e VestiFlow non tiene traccia di cosa è già stato
 * mandato. L'operatore sceglie un periodo, stampa o esporta, e nulla cambia.
 */
export function canManageFiscalRegister(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.ReportsFiscalRegister);
}

export function canViewReports(user: User | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.SectionReports);
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

/**
 * La cassa si apre solo se il canale del tenant la prevede, la sezione Vendite è
 * accessibile e l'operatore ha il permesso di battere.
 *
 * Sta qui, e non nei singoli chiamanti, perché la condizione era scritta tre
 * volte in tre modi diversi — guard di rotta due termini, sidebar tre, hub
 * nessuno — e la voce compariva o spariva a seconda di dove la si guardava.
 */
export function canOpenRetailRegister(user: User | null | undefined): boolean {
  return (
    showRetailSalesRegister(user?.tenantChannelProfile) &&
    canAccessSalesSection(user) &&
    canRegisterRetailSales(user)
  );
}

export function canManageMfa(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return hasFullTenantAccess(user) || user.isPlatformAdmin;
}
