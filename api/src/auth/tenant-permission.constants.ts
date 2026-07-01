import { UserRole } from '@prisma/client';

/** Permessi granulari tenant (persistiti su User.permissions). Il titolare li ignora (accesso pieno). */
export const TenantPermission = {
  InventoryViewAllLocations: 'inventory.view_all_locations',
  InventoryManage: 'inventory.manage',
  InventoryImportExport: 'inventory.import_export',
  CatalogManage: 'catalog.manage',
  CatalogImportExport: 'catalog.import_export',
  CatalogDelete: 'catalog.delete',
  SupplierOrdersManage: 'supplier_orders.manage',
  SupplierOrdersReceive: 'supplier_orders.receive',
  DocumentsView: 'documents.view',
  DocumentsManage: 'documents.manage',
  RetailRegister: 'retail.register',
  RetailRegisterOnline: 'retail.register_online',
  ReportsView: 'reports.view',
  ReportsExport: 'reports.export',
  SettingsCompany: 'settings.company',
  CustomersView: 'customers.view',
  CustomersManage: 'customers.manage',
} as const;

export type TenantPermissionKey = (typeof TenantPermission)[keyof typeof TenantPermission];

export const ALL_TENANT_PERMISSIONS = Object.values(TenantPermission) as readonly TenantPermissionKey[];

export interface TenantPermissionDefinition {
  readonly key: TenantPermissionKey;
  readonly label: string;
  readonly hint: string;
  readonly group: 'inventory' | 'catalog' | 'orders' | 'documents' | 'reports' | 'settings' | 'customers';
}

export const TENANT_PERMISSION_DEFINITIONS: readonly TenantPermissionDefinition[] = [
  {
    key: TenantPermission.InventoryViewAllLocations,
    label: 'Vedere giacenze di tutte le sedi',
    hint: 'Consulta stock e movimenti oltre la sede assegnata (le azioni restano sulla sede operativa).',
    group: 'inventory',
  },
  {
    key: TenantPermission.InventoryManage,
    label: 'Gestire giacenze',
    hint: 'Carichi, scarichi, trasferimenti verso altre sedi, rettifiche e conteggi sulla sede operativa.',
    group: 'inventory',
  },
  {
    key: TenantPermission.InventoryImportExport,
    label: 'Import/export e sync giacenze',
    hint: 'Esporta e importa CSV giacenze e sincronizza lo stock da Shopify.',
    group: 'inventory',
  },
  {
    key: TenantPermission.CatalogManage,
    label: 'Gestire catalogo',
    hint: 'Crea e modifica prodotti, varianti e prezzi.',
    group: 'catalog',
  },
  {
    key: TenantPermission.CatalogImportExport,
    label: 'Import/export e sync prodotti',
    hint: 'Esporta e importa CSV catalogo e sincronizza i prodotti da Shopify.',
    group: 'catalog',
  },
  {
    key: TenantPermission.CatalogDelete,
    label: 'Eliminare prodotti',
    hint: 'Rimuove prodotti dal catalogo.',
    group: 'catalog',
  },
  {
    key: TenantPermission.SupplierOrdersManage,
    label: 'Gestire ordini fornitore',
    hint: 'Crea, modifica e invia ordini ai fornitori.',
    group: 'orders',
  },
  {
    key: TenantPermission.SupplierOrdersReceive,
    label: 'Ricevere ordini fornitore',
    hint: 'Registra la merce in arrivo da ordini fornitore.',
    group: 'orders',
  },
  {
    key: TenantPermission.DocumentsView,
    label: 'Consultare documenti',
    hint: 'Registro documenti (DDT, carichi, trasferimenti, inventari, proforma) in sola lettura.',
    group: 'documents',
  },
  {
    key: TenantPermission.DocumentsManage,
    label: 'Gestire documenti',
    hint: 'Crea, modifica, conferma, stampa e annulla documenti; configura serie e numeratori.',
    group: 'documents',
  },
  {
    key: TenantPermission.RetailRegister,
    label: 'Registrare vendite al banco',
    hint: 'Vendite e storni da registratore/cassiere.',
    group: 'orders',
  },
  {
    key: TenantPermission.RetailRegisterOnline,
    label: 'Registrare vendite online',
    hint: 'Vendite e storni online registrati manualmente.',
    group: 'orders',
  },
  {
    key: TenantPermission.ReportsView,
    label: 'Consultare report',
    hint: 'Accesso alle schermate report e dashboard analitiche.',
    group: 'reports',
  },
  {
    key: TenantPermission.ReportsExport,
    label: 'Esportare dati',
    hint: 'Export CSV di vendite, clienti e giacenze.',
    group: 'reports',
  },
  {
    key: TenantPermission.SettingsCompany,
    label: 'Impostazioni azienda',
    hint: 'Dati societari e preferenze generali del negozio.',
    group: 'settings',
  },
  {
    key: TenantPermission.CustomersView,
    label: 'Visualizzare clienti',
    hint: 'Anagrafica clienti in sola lettura.',
    group: 'customers',
  },
  {
    key: TenantPermission.CustomersManage,
    label: 'Gestire clienti',
    hint: 'Crea e modifica anagrafiche clienti.',
    group: 'customers',
  },
];

const ADMIN_DEFAULTS: readonly TenantPermissionKey[] = ALL_TENANT_PERMISSIONS;

const MANAGER_DEFAULTS: readonly TenantPermissionKey[] = [
  TenantPermission.InventoryViewAllLocations,
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.CatalogManage,
  TenantPermission.CatalogImportExport,
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
  TenantPermission.DocumentsView,
  TenantPermission.DocumentsManage,
  TenantPermission.RetailRegister,
  TenantPermission.RetailRegisterOnline,
  TenantPermission.ReportsView,
  TenantPermission.ReportsExport,
  TenantPermission.CustomersView,
  TenantPermission.CustomersManage,
];

const CLERK_DEFAULTS: readonly TenantPermissionKey[] = [
  TenantPermission.InventoryManage,
  TenantPermission.SupplierOrdersReceive,
  TenantPermission.DocumentsView,
  TenantPermission.RetailRegister,
  TenantPermission.RetailRegisterOnline,
  TenantPermission.ReportsView,
  TenantPermission.CustomersView,
];

export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<UserRole, readonly TenantPermissionKey[]>> = {
  owner: ALL_TENANT_PERMISSIONS,
  admin: ADMIN_DEFAULTS,
  manager: MANAGER_DEFAULTS,
  clerk: CLERK_DEFAULTS,
};

export function isTenantPermissionKey(value: string): value is TenantPermissionKey {
  return (ALL_TENANT_PERMISSIONS as readonly string[]).includes(value);
}

/** Permessi sufficienti per consultare prodotti (liste, dettaglio, lookup). */
export const CATALOG_SECTION_PERMISSIONS = [
  TenantPermission.CatalogManage,
  TenantPermission.CatalogImportExport,
  TenantPermission.CatalogDelete,
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
] as const satisfies readonly TenantPermissionKey[];

/** Permessi sufficienti per consultare il magazzino (giacenze, movimenti). */
export const INVENTORY_SECTION_PERMISSIONS = [
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.InventoryViewAllLocations,
] as const satisfies readonly TenantPermissionKey[];

export const SUPPLIER_ORDERS_VIEW_PERMISSIONS = [
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
] as const satisfies readonly TenantPermissionKey[];

export const SUPPLIER_ORDERS_RECEIVE_PERMISSIONS = [
  TenantPermission.SupplierOrdersManage,
  TenantPermission.SupplierOrdersReceive,
] as const satisfies readonly TenantPermissionKey[];

/** Permessi sufficienti per consultare il registro documenti. */
export const DOCUMENTS_VIEW_PERMISSIONS = [
  TenantPermission.DocumentsView,
  TenantPermission.DocumentsManage,
] as const satisfies readonly TenantPermissionKey[];

export const CUSTOMERS_VIEW_PERMISSIONS = [
  TenantPermission.CustomersView,
  TenantPermission.CustomersManage,
] as const satisfies readonly TenantPermissionKey[];

/** Sync catalogo Shopify (CSV prodotti). */
export const SHOPIFY_CATALOG_SYNC_PERMISSIONS = [
  TenantPermission.CatalogImportExport,
] as const satisfies readonly TenantPermissionKey[];

/** Sync giacenze Shopify (CSV giacenze). */
export const SHOPIFY_INVENTORY_SYNC_PERMISSIONS = [
  TenantPermission.InventoryImportExport,
] as const satisfies readonly TenantPermissionKey[];

/** Sync clienti/ordini Shopify (export dati). */
export const SHOPIFY_OPERATIONAL_SYNC_PERMISSIONS = [
  TenantPermission.ReportsExport,
] as const satisfies readonly TenantPermissionKey[];
