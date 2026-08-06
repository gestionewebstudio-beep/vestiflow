/** Versione formato pacchetto ZIP backup tenant (manifest.json). */
export const TENANT_BACKUP_FORMAT_VERSION = 1;

export const TENANT_BACKUP_MANIFEST_FILE = 'manifest.json';
export const TENANT_BACKUP_DATA_DIR = 'data';
export const TENANT_BACKUP_ATTACHMENTS_DIR = 'attachments';

/** Entità esportate (nome file JSON senza estensione). */
export const TENANT_BACKUP_ENTITY_FILES = [
  'tenant',
  'users',
  'stores',
  'locations',
  'userStores',
  'documentTypeSettings',
  'vatCodes',
  'tenantFeatureSettings',
  'documentSequences',
  'paymentOptions',
  'parties',
  'suppliers',
  'customers',
  'products',
  'productVariants',
  'productImages',
  'supplierVariantLinks',
  'inventoryLevels',
  'inventoryLots',
  'inventorySerials',
  'stockMovements',
  'inventoryCountSessions',
  'inventoryCountLines',
  'supplierOrders',
  'supplierOrderLines',
  'salesOrders',
  'salesOrderLines',
  'stockReservations',
  'stockReservationEvents',
  'onlineOrderEvents',
  'corrispettiviDeliveries',
  'documents',
  'documentLines',
  'documentRevisions',
  'documentAttachments',
  'supplierAttachments',
  'shopifyConnections',
  'shopifyCredentials',
  'tiktokConnections',
  'tiktokCredentials',
  'userTableViewPreferences',
] as const;

export type TenantBackupEntityFile = (typeof TENANT_BACKUP_ENTITY_FILES)[number];

/** Ordine di inserimento rispettando FK (import). */
export const TENANT_BACKUP_IMPORT_ORDER: readonly TenantBackupEntityFile[] = [
  'stores',
  'locations',
  'users',
  'userStores',
  'documentTypeSettings',
  'vatCodes',
  'tenantFeatureSettings',
  'documentSequences',
  'paymentOptions',
  'parties',
  'suppliers',
  'customers',
  'products',
  'productVariants',
  'productImages',
  'supplierVariantLinks',
  'inventoryLevels',
  'inventoryLots',
  'inventorySerials',
  'stockMovements',
  'inventoryCountSessions',
  'inventoryCountLines',
  'supplierOrders',
  'supplierOrderLines',
  'salesOrders',
  'salesOrderLines',
  'stockReservations',
  'stockReservationEvents',
  'onlineOrderEvents',
  'corrispettiviDeliveries',
  'documents',
  'documentLines',
  'documentRevisions',
  'documentAttachments',
  'supplierAttachments',
  'shopifyConnections',
  'shopifyCredentials',
  'tiktokConnections',
  'tiktokCredentials',
  'userTableViewPreferences',
];

/** Ordine di cancellazione (figli prima dei genitori). */
export const TENANT_BACKUP_DELETE_ORDER: readonly TenantBackupEntityFile[] = [
  ...[...TENANT_BACKUP_IMPORT_ORDER].reverse(),
];
