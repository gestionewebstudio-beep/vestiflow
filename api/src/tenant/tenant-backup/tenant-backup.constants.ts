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
 * 4  dati Cassa, dipendenze e riferimenti ai cataloghi globali. Import v3 supportato.
 * 5  08/09/2026 — lo STORICO dei collegamenti Shopify (sette tabelle, docs/24
 *    §8.5.2). Gli archivi v3 e v4 non lo contengono, e non devono contenerlo:
 *    le chiavi nuove valgono `[]`.
 */
export const TENANT_BACKUP_FORMAT_VERSION = 5;
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
  // ── Storico dei collegamenti Shopify (v5, docs/24 §8.5.2) ─────────────────
  // ⚠️ L'ORDINE conta e non e' alfabetico: e' quello delle dipendenze, perche'
  //    da qui discendono `TENANT_BACKUP_IMPORT_ORDER` e il suo inverso. Le sette
  //    stanno PRIMA di `shopifyConnections`, che ha una FK verso `shopify_shops`.
  shopifyShops: 'ShopifyShop',
  shopifyProductIdentities: 'ShopifyProductIdentity',
  shopifyVariantIdentities: 'ShopifyVariantIdentity',
  shopifyProductLinks: 'ShopifyProductLink',
  shopifyVariantLinks: 'ShopifyVariantLink',
  shopifyLocationPairs: 'ShopifyLocationPair',
  shopifyLocationLinks: 'ShopifyLocationLink',
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

/**
 * Lo STORICO dei collegamenti remoti, in ordine di dipendenza (docs/24 §8.5.2).
 *
 * ⛔ **Non si purga MAI**, ed e' il fulcro di tutto il resto: quattro delle
 *    sette tabelle hanno trigger `BEFORE DELETE` che rifiutano, e un ripristino
 *    che provasse a cancellarle fallirebbe interamente. Ma la ragione non e'
 *    tecnica: un GID cancellato tornerebbe riassegnabile a un altro articolo.
 *
 * ⭐ **Quindi si reinserisce SOLO PER ASSENZA.** Su un tenant esistente le righe
 *    ci sono gia' e non si toccano; su un database vuoto non c'e' niente, e si
 *    reinseriscono tutte — che e' il recupero che questa lista rende possibile.
 */
export const TENANT_BACKUP_STORICO_SHOPIFY = [
  'shopifyShops',
  'shopifyProductIdentities',
  'shopifyVariantIdentities',
  'shopifyProductLinks',
  'shopifyVariantLinks',
  'shopifyLocationPairs',
  'shopifyLocationLinks',
] as const satisfies readonly TenantBackupEntityFile[];

const STORICO_SHOPIFY = new Set<TenantBackupEntityFile>(TENANT_BACKUP_STORICO_SHOPIFY);

export function isStoricoShopify(key: TenantBackupEntityFile): boolean {
  return STORICO_SHOPIFY.has(key);
}

/**
 * In quale versione di formato e' COMPARSO ciascun file di entita'.
 *
 * ⛔ **Serve a non pretendere da un archivio vecchio un file che quella versione
 *    non poteva contenere.** Senza, `formatVersion 5` diventa il metro con cui
 *    si giudica un pacchetto v4, e il ripristino di un backup legittimo viene
 *    rifiutato con «File backup mancante».
 *
 * ⚠️ Chi non compare qui c'era gia' a v3.
 */
const INTRODOTTO_IN: Partial<Record<TenantBackupEntityFile, number>> = Object.fromEntries(
  TENANT_BACKUP_STORICO_SHOPIFY.map((key) => [key, 5]),
);

/**
 * I file che un archivio di quella versione DEVE contenere.
 *
 * ⭐ **Una sola fonte per due cancelli.** L'archivio si verifica in due punti —
 *    la presenza del file e la presenza del conteggio nel manifest — e prima
 *    ognuno aveva la propria condizione scritta a mano. Erano due rotture
 *    indipendenti per lo stesso archivio vecchio: misurato l'08/09/2026.
 */
export function tenantBackupFileAttesi(
  formatVersion: number,
): readonly TenantBackupEntityFile[] {
  if (formatVersion <= 3) {
    return TENANT_BACKUP_V3_ENTITY_FILES;
  }
  return TENANT_BACKUP_ENTITY_FILES.filter((key) => (INTRODOTTO_IN[key] ?? 3) <= formatVersion);
}

/** File obbligatori degli archivi v4: tutto tranne lo storico, comparso a v5. */
export const TENANT_BACKUP_V4_ENTITY_FILES: readonly TenantBackupEntityFile[] =
  tenantBackupFileAttesi(4);

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

/**
 * ⛔ **Lo storico NON e' qui**, e l'esclusione e' deliberata (§10.1 S2).
 *
 * ⚠️ Questa costante e' usata da DUE percorsi, non uno: il ripristino e la
 *    cancellazione amministrativa del tenant. Per il primo l'esclusione e'
 *    necessaria — cancellare lo storico e' vietato dai trigger. Per il secondo
 *    **non cambia niente rispetto a oggi**: prima le sette tabelle non stavano
 *    affatto nel registro, quindi la purga non le toccava comunque, e la
 *    cancellazione di un tenant con storico si ferma sulla FK come si fermava
 *    prima. Chiuderla e' A4, che resta un blocco separato.
 */
export const TENANT_BACKUP_DELETE_ORDER = [...TENANT_BACKUP_IMPORT_ORDER]
  .reverse()
  .filter((key) => !isStoricoShopify(key));

/**
 * L'ordine di cancellazione COMPLETO, storico incluso.
 *
 * ⛔ **Lo usa SOLO la cancellazione amministrativa del tenant** (§10.2), che e'
 *    l'unica operazione in cui lo storico deve davvero sparire — e che per
 *    farlo accende un permesso di riga limitato a quel tenant. Il ripristino
 *    da backup continua a usare l'ordine ridotto qui sopra.
 *
 * ⭐ **L'ordine e' gia' giusto**: le sette tabelle stanno nel registro prima di
 *    `shopifyConnections`, quindi al contrario le connessioni si cancellano
 *    prima dei negozi a cui puntano, e lo storico prima delle anagrafiche a cui
 *    si aggancia. Non c'e' una seconda sequenza da tenere allineata.
 */
export const TENANT_BACKUP_DELETE_ORDER_COMPLETO = [...TENANT_BACKUP_IMPORT_ORDER].reverse();
