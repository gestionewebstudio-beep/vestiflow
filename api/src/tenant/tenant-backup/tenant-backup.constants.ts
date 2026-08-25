/**
 * Versione formato pacchetto ZIP backup tenant (manifest.json).
 *
 * ⭐ **Si alza quando cambia il SIGNIFICATO di quello che c'e' dentro**, non
 * solo quando cambia la forma del manifest. I file di dati sono
 * `JSON.stringify` grezzi delle righe: un valore di enum rinominato viaggia li'
 * dentro come testo, e nessuna struttura se ne accorge.
 *
 * ⛔ Senza questo scatto, un archivio vecchio PASSA il cancello — che confronta
 * solo la versione — e poi esplode a meta' ripristino su un `createMany`, con
 * un errore che non spiega perche'. La transazione salva il database, ma chi
 * sta ripristinando non capisce cosa sia successo.
 *
 * ── Storia ──────────────────────────────────────────────────────────────────
 * 1  formato iniziale
 * 2  26/08/2026 — rinomina del valore di enum `invoice_draft` in `invoice`:
 *    i pacchetti v1 portano il nome vecchio dentro `data/documents.json`,
 *    `documentTypeSettings`, `documentSequences` e `stockMovements`.
 */
export const TENANT_BACKUP_FORMAT_VERSION = 2;

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
  'companyProfile',
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
  'companyProfile',
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
