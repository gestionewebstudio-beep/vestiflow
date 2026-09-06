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
 * 3  26/08/2026 — `TenantFeatureSettings.defaultUnitOfMeasure` tolta dallo schema:
 *    i pacchetti v2 la portano dentro `data/tenantFeatureSettings.json`, e l’import
 *    fa `createMany` con le righe così come stanno — nessuna whitelist di colonne.
 *    Senza questo scatto Prisma alzerebbe `Unknown argument` a metà ripristino.
 */
// 4: dati Cassa, dipendenze e riferimenti ai cataloghi globali. Import v3 supportato.
export const TENANT_BACKUP_FORMAT_VERSION = 4;
export const TENANT_BACKUP_MIN_FORMAT_VERSION = 3;

export const TENANT_BACKUP_MANIFEST_FILE = 'manifest.json';
export const TENANT_BACKUP_DATA_DIR = 'data';
export const TENANT_BACKUP_ATTACHMENTS_DIR = 'attachments';

/** Unico registro per export, import e cancellazione del tenant. */
export const TENANT_BACKUP_MODELS = {
  tenant: 'Tenant',
  stores: 'Store',
  locations: 'Location',
  users: 'User',
  userStores: 'UserStore',
  userLocations: 'UserLocation',
  vatCodes: 'VatCode',
  externalDocumentTypes: 'ExternalDocumentType',
  goodsReceiptCausals: 'GoodsReceiptCausal',
  documentTypeSettings: 'DocumentTypeSetting',
  companyProfile: 'CompanyProfile',
  tenantFeatureSettings: 'TenantFeatureSettings',
  documentSequences: 'DocumentSequence',
  documentCounters: 'DocumentCounter',
  paymentOptions: 'PaymentOption',
  unitOfMeasureOptions: 'UnitOfMeasureOption',
  parties: 'Party',
  suppliers: 'Supplier',
  customers: 'Customer',
  catalogCategories: 'CatalogCategory',
  products: 'Product',
  productVariants: 'ProductVariant',
  productImages: 'ProductImage',
  supplierVariantLinks: 'SupplierVariantLink',
  supplierOrders: 'SupplierOrder',
  supplierOrderLines: 'SupplierOrderLine',
  fiscalDevices: 'FiscalDevice',
  posTerminals: 'PosTerminal',
  cashSessions: 'CashSession',
  cashSessionMovements: 'CashSessionMovement',
  cashSessionDeviceChanges: 'CashSessionDeviceChange',
  salesOrders: 'SalesOrder',
  salesOrderLines: 'SalesOrderLine',
  salesOrderRefunds: 'SalesOrderRefund',
  salesOrderRefundTaxLines: 'SalesOrderRefundTaxLine',
  stockReservations: 'StockReservation',
  stockReservationEvents: 'StockReservationEvent',
  onlineOrderEvents: 'OnlineOrderEvent',
  onlineSales: 'OnlineSale',
  onlineSaleLines: 'OnlineSaleLine',
  documents: 'Document',
  documentLines: 'DocumentLine',
  documentPaymentInstallments: 'DocumentPaymentInstallment',
  storeSalePayments: 'StoreSalePayment',
  fiscalReceipts: 'FiscalReceipt',
  purchaseInvoiceGoodsReceiptLinks: 'PurchaseInvoiceGoodsReceiptLink',
  invoiceSalesDdtLinks: 'InvoiceSalesDdtLink',
  documentRevisions: 'DocumentRevision',
  documentAttachments: 'DocumentAttachment',
  attachments: 'Attachment',
  supplierAttachments: 'SupplierAttachment',
  inventoryLevels: 'InventoryLevel',
  inventoryLots: 'InventoryLot',
  inventorySerials: 'InventorySerial',
  stockMovements: 'StockMovement',
  inventoryCountSessions: 'InventoryCountSession',
  inventoryCountLines: 'InventoryCountLine',
  manualReceipts: 'ManualReceipt',
  manualReceiptLines: 'ManualReceiptLine',
  creationIntents: 'CreationIntent',
  shopifyConnections: 'ShopifyConnection',
  shopifyCredentials: 'ShopifyCredential',
  shopifyInventorySyncStates: 'ShopifyInventorySyncState',
  tiktokConnections: 'TikTokConnection',
  tiktokCredentials: 'TikTokCredential',
  userTableViewPreferences: 'UserTableViewPreference',
  userDocumentChronologyWarningPreferences: 'UserDocumentChronologyWarningPreference',
  userDocumentPriceModePreferences: 'UserDocumentPriceModePreference',
} as const;

export type TenantBackupEntityFile = keyof typeof TENANT_BACKUP_MODELS;
export const TENANT_BACKUP_ENTITY_FILES = Object.keys(
  TENANT_BACKUP_MODELS,
) as TenantBackupEntityFile[];

/** File obbligatori degli archivi v3, conservati senza inventare dati assenti. */
export const TENANT_BACKUP_V3_ENTITY_FILES: readonly TenantBackupEntityFile[] = [
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
];

/** FK circolari e autorelazioni sono completate nella stessa transazione. */
export const TENANT_BACKUP_DEFERRED_FIELDS: Partial<
  Record<TenantBackupEntityFile, readonly string[]>
> = {
  catalogCategories: ['parentId'],
  salesOrders: ['documentId'],
  documents: ['sourceDocumentId'],
  documentLines: ['returnedFromLineId'],
  storeSalePayments: ['refundedFromPaymentId'],
  fiscalReceipts: ['originalReceiptId'],
};

export const TENANT_BACKUP_IMPORT_ORDER = TENANT_BACKUP_ENTITY_FILES.filter(
  (key) => key !== 'tenant',
);
export const TENANT_BACKUP_DELETE_ORDER = [...TENANT_BACKUP_IMPORT_ORDER].reverse();
