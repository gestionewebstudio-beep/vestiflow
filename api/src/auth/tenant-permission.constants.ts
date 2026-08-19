import { UserRole } from '@prisma/client';

/**
 * Modello permessi «sezioni + documenti + azioni» (decisione prodotto 2026-08-11).
 *
 * Tre ingredienti, tutti persistiti su User.permissions (il titolare ignora
 * l'array: accesso pieno):
 * - SEZIONI (`section.*`): le porte delle aree della sidebar. Senza la chiave
 *   la sezione non si apre, qualunque altra cosa l'utente abbia.
 * - DOCUMENTI (`doc.<famiglia>.view|manage`): quali carte può consultare e
 *   quali gestire (creare, modificare, stampare, annullare). Una famiglia
 *   raggruppa i DocumentType che l'utente percepisce come lo stesso documento
 *   (es. fattura + fattura accompagnatoria). Ordine cliente e ordine fornitore
 *   sono famiglie anche se vivono in tabelle proprie.
 * - AZIONI (`catalog.*`, `inventory.*`, `retail.*`, ...): ciò che non è né una
 *   porta né una carta — costi d'acquisto, import/export, eliminazioni,
 *   movimenti rapidi. Le più delicate sono evidenziate come «azioni sensibili»
 *   nell'editor.
 */
export const TenantPermission = {
  // ── Sezioni ─────────────────────────────────────────────────────────
  SectionProducts: 'section.products',
  SectionInventory: 'section.inventory',
  SectionSuppliers: 'section.suppliers',
  SectionDocuments: 'section.documents',
  SectionSales: 'section.sales',
  SectionCustomers: 'section.customers',
  SectionReports: 'section.reports',
  SectionSettings: 'section.settings',
  // ── Azioni ──────────────────────────────────────────────────────────
  InventoryViewAllLocations: 'inventory.view_all_locations',
  InventoryManage: 'inventory.manage',
  InventoryImportExport: 'inventory.import_export',
  CatalogManage: 'catalog.manage',
  CatalogImportExport: 'catalog.import_export',
  CatalogDelete: 'catalog.delete',
  CatalogViewPurchaseCosts: 'catalog.view_purchase_costs',
  RetailRegister: 'retail.register',
  ReportsExport: 'reports.export',
  SettingsCompany: 'settings.company',
  /**
   * Configurazione documentale del tenant: numeratori, serie, impostazioni per
   * tipo, causali di arrivo merce, tipi di documento esterno. È una scelta di
   * negozio, non la gestione di un documento: chi gestisce solo l'arrivo merce
   * non deve poter riscrivere i prefissi delle fatture.
   */
  DocumentsConfigure: 'documents.configure',
  /**
   * Registro fiscale: marcare le consegne al commercialista, cambiare lo stato
   * fiscale di un ordine, correggere una riga del registro corrispettivi.
   * Sono SCRITTURE, e stavano dietro «Esportare dati»: chi scaricava un CSV si
   * ritrovava a poter modificare la contabilità.
   */
  ReportsFiscalRegister: 'reports.fiscal_register',
  CustomersManage: 'customers.manage',
} as const;

/**
 * Famiglie di documenti della matrice permessi. L'ordine è quello di
 * presentazione nell'editor.
 */
export const DOCUMENT_PERMISSION_FAMILIES = [
  'goods_receipt',
  'purchase_invoice',
  'supplier_order',
  'sales_order',
  'quote',
  'proforma',
  'sales_ddt',
  'invoice',
  'store_sale',
  'online_sale',
  'transfer',
  'adjustment',
  'manual_unload',
] as const;

export type DocumentPermissionFamily = (typeof DOCUMENT_PERMISSION_FAMILIES)[number];

export function docViewPermission(family: DocumentPermissionFamily): TenantPermissionKey {
  return `doc.${family}.view` as TenantPermissionKey;
}

export function docManagePermission(family: DocumentPermissionFamily): TenantPermissionKey {
  return `doc.${family}.manage` as TenantPermissionKey;
}

const DOC_PERMISSIONS: readonly string[] = DOCUMENT_PERMISSION_FAMILIES.flatMap((family) => [
  `doc.${family}.view`,
  `doc.${family}.manage`,
]);

export type TenantPermissionKey =
  | (typeof TenantPermission)[keyof typeof TenantPermission]
  | `doc.${DocumentPermissionFamily}.view`
  | `doc.${DocumentPermissionFamily}.manage`;

export const ALL_TENANT_PERMISSIONS = [
  ...Object.values(TenantPermission),
  ...DOC_PERMISSIONS,
] as readonly TenantPermissionKey[];

/** Tutte le chiavi «può consultare almeno un documento» (gate di classe sui controller). */
export const ANY_DOCUMENT_VIEW_PERMISSIONS = DOCUMENT_PERMISSION_FAMILIES.map((family) =>
  docViewPermission(family),
) as readonly TenantPermissionKey[];

/** Tutte le chiavi «può gestire almeno un documento». */
export const ANY_DOCUMENT_MANAGE_PERMISSIONS = DOCUMENT_PERMISSION_FAMILIES.map((family) =>
  docManagePermission(family),
) as readonly TenantPermissionKey[];

export interface TenantPermissionDefinition {
  readonly key: TenantPermissionKey;
  readonly label: string;
  readonly hint: string;
  readonly group: 'sections' | 'inventory' | 'catalog' | 'sales' | 'reports' | 'settings' | 'customers';
}

export const TENANT_PERMISSION_DEFINITIONS: readonly TenantPermissionDefinition[] = [
  {
    key: TenantPermission.SectionProducts,
    label: 'Sezione Prodotti',
    hint: 'Apre catalogo e anagrafiche articolo.',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionInventory,
    label: 'Sezione Magazzino',
    hint: 'Apre giacenze, movimenti e conteggi.',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionSuppliers,
    label: 'Sezione Fornitori',
    hint: 'Apre anagrafiche fornitori e ordini fornitore.',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionDocuments,
    label: 'Sezione Documenti',
    hint: 'Apre il registro documenti (cosa vede lì dentro lo decide la matrice documenti).',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionSales,
    label: 'Sezione Vendite',
    hint: 'Apre ordini cliente, cassa, vendite online e corrispettivi.',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionCustomers,
    label: 'Sezione Clienti',
    hint: 'Apre l’anagrafica clienti (in sola lettura senza «Gestire clienti»).',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionReports,
    label: 'Sezione Report',
    hint: 'Apre report, dashboard analitiche e registro commercialista.',
    group: 'sections',
  },
  {
    key: TenantPermission.SectionSettings,
    label: 'Sezione Impostazioni',
    hint: 'Apre Impostazioni (Codici IVA, pagamenti; il resto resta legato ad altri permessi).',
    group: 'sections',
  },
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
    key: TenantPermission.CatalogViewPurchaseCosts,
    label: "Visualizza costi d'acquisto",
    hint:
      "Vale dove il costo è un'informazione in più: catalogo, magazzino, movimenti e margini nei report. " +
      'NON tocca i documenti d’acquisto (arrivo merce, fatture e ordini fornitore): lì i prezzi SONO il documento — ' +
      'per nasconderli, togli quelle righe dalla matrice Documenti.',
    group: 'catalog',
  },
  {
    key: TenantPermission.RetailRegister,
    label: 'Registrare vendite al banco',
    hint: 'Vendite e storni da registratore/cassiere.',
    group: 'sales',
  },
  {
    key: TenantPermission.ReportsExport,
    label: 'Esportare dati',
    hint:
      'Scarica in CSV/PDF vendite, clienti, corrispettivi e giacenze, e marca le consegne al ' +
      'commercialista. Vale solo sulle sezioni che l’utente può già consultare.',
    group: 'reports',
  },
  {
    key: TenantPermission.SettingsCompany,
    label: 'Impostazioni azienda',
    hint: 'Dati societari e preferenze generali del negozio.',
    group: 'settings',
  },
  {
    key: TenantPermission.DocumentsConfigure,
    label: 'Configurare i documenti',
    hint: 'Numeratori, serie, impostazioni per tipo, causali arrivo merce e tipi di documento esterno.',
    group: 'settings',
  },
  {
    key: TenantPermission.ReportsFiscalRegister,
    label: 'Registrare corrispettivi manuali',
    // Riscritta il 17/08/2026 con la prima applicazione vera del permesso. Qui
    // c'era «Marca le consegne al commercialista, cambia lo stato fiscale di un
    // ordine e corregge le righe del registro corrispettivi»: tre cose che non
    // esistono più — il flusso commercialista è ritirato (10 §5), lo stato
    // fiscale della vendita è stato eliminato (10 §6), e il Registro non si
    // corregge riga per riga (10 §1).
    hint:
      'Aggiunge al Registro Corrispettivi le registrazioni economiche che nessuna vendita ' +
      'produce (cassa esterna, chiusure da recuperare), e le corregge o elimina. Solo importi ' +
      'e IVA: non tocca il magazzino.',
    group: 'reports',
  },
  {
    key: TenantPermission.CustomersManage,
    label: 'Gestire clienti',
    hint: 'Crea e modifica anagrafiche clienti (la consultazione è la sezione Clienti).',
    group: 'customers',
  },
];

/** Etichette delle famiglie documento (matrice Consulta/Gestisci dell'editor). */
export const DOCUMENT_FAMILY_LABELS: Readonly<Record<DocumentPermissionFamily, string>> = {
  goods_receipt: 'Arrivo merce',
  purchase_invoice: 'Registrazione fattura fornitore',
  supplier_order: 'Ordine fornitore',
  sales_order: 'Ordine cliente',
  quote: 'Preventivo',
  proforma: 'Proforma',
  sales_ddt: 'DDT di vendita',
  invoice: 'Fattura (anche accompagnatoria)',
  store_sale: 'Vendite e resi negozio',
  online_sale: 'Vendite online e corrispettivi',
  transfer: 'Trasferimento tra sedi',
  adjustment: 'Rettifiche e carichi manuali',
  manual_unload: 'Scarico manuale',
};

/** Famiglie senza una vera «gestione» (documenti generati dal sistema): l'editor offre solo Consulta. */
export const VIEW_ONLY_DOCUMENT_FAMILIES: readonly DocumentPermissionFamily[] = ['online_sale'];

// ── Preset di ruolo ───────────────────────────────────────────────────
// Materializzati al salvataggio: sono il punto di partenza che il titolare
// personalizza, non un fallback a runtime. Derivano dall'espansione dei
// vecchi preset (documents.view -> tutte le famiglie in consultazione, ecc.):
// nessun ruolo perde nulla rispetto al modello precedente.

const ALL_DOC_VIEW = DOCUMENT_PERMISSION_FAMILIES.map((family) => docViewPermission(family));
const ALL_DOC_MANAGE = DOCUMENT_PERMISSION_FAMILIES.filter(
  (family) => !VIEW_ONLY_DOCUMENT_FAMILIES.includes(family),
).map((family) => docManagePermission(family));

const ALL_SECTIONS: readonly TenantPermissionKey[] = [
  TenantPermission.SectionProducts,
  TenantPermission.SectionInventory,
  TenantPermission.SectionSuppliers,
  TenantPermission.SectionDocuments,
  TenantPermission.SectionSales,
  TenantPermission.SectionCustomers,
  TenantPermission.SectionReports,
  TenantPermission.SectionSettings,
];

const ADMIN_DEFAULTS: readonly TenantPermissionKey[] = ALL_TENANT_PERMISSIONS;

const MANAGER_DEFAULTS: readonly TenantPermissionKey[] = [
  ...ALL_SECTIONS,
  ...ALL_DOC_VIEW,
  ...ALL_DOC_MANAGE,
  TenantPermission.InventoryViewAllLocations,
  TenantPermission.InventoryManage,
  TenantPermission.InventoryImportExport,
  TenantPermission.CatalogManage,
  TenantPermission.CatalogImportExport,
  TenantPermission.CatalogViewPurchaseCosts,
  TenantPermission.RetailRegister,
  TenantPermission.ReportsExport,
  TenantPermission.DocumentsConfigure,
  TenantPermission.ReportsFiscalRegister,
  TenantPermission.CustomersManage,
];

const CLERK_DEFAULTS: readonly TenantPermissionKey[] = [
  ...ALL_SECTIONS,
  // Consulta tutto il registro (come l'ex documents.view), gestisce solo
  // l'arrivo merce (ex supplier_orders.receive).
  ...ALL_DOC_VIEW,
  docManagePermission('goods_receipt'),
  TenantPermission.InventoryManage,
  TenantPermission.RetailRegister,
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

// ── Gate composti (controller e rotte) ────────────────────────────────

/** Consultazione prodotti (liste, dettaglio, lookup). */
export const CATALOG_SECTION_PERMISSIONS = [
  TenantPermission.SectionProducts,
] as const satisfies readonly TenantPermissionKey[];

/** Consultazione magazzino (giacenze, movimenti). */
export const INVENTORY_SECTION_PERMISSIONS = [
  TenantPermission.SectionInventory,
] as const satisfies readonly TenantPermissionKey[];

/** Consultazione anagrafiche fornitori. */
export const SUPPLIERS_VIEW_PERMISSIONS = [
  TenantPermission.SectionSuppliers,
] as const satisfies readonly TenantPermissionKey[];

/**
 * Lookup fornitori nei form: oltre alla sezione, chi gestisce ordini
 * fornitore, arrivi merce o registrazioni fattura deve poter scegliere un
 * fornitore anche senza accesso all'anagrafica completa.
 */
export const SUPPLIERS_LOOKUP_PERMISSIONS = [
  TenantPermission.SectionSuppliers,
  docViewPermission('supplier_order'),
  docManagePermission('supplier_order'),
  docManagePermission('goods_receipt'),
  docManagePermission('purchase_invoice'),
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

/** Consultazione registro documenti: basta poter vedere UNA famiglia (il filtro per tipo fa il resto). */
export const DOCUMENTS_VIEW_PERMISSIONS = ANY_DOCUMENT_VIEW_PERMISSIONS;

/** Gestione documenti: basta poter gestire UNA famiglia (l'asserzione per tipo fa il resto). */
export const DOCUMENTS_MANAGE_PERMISSIONS = ANY_DOCUMENT_MANAGE_PERMISSIONS;

/**
 * Gruppi «sezione E contenuto» per il registro documenti: la chiave di sezione
 * è una PORTA, e deve valere anche lato API — altrimenti revocarla toglierebbe
 * solo la voce di menu, e l'etichetta prometterebbe più di quanto mantiene.
 */
export const DOCUMENTS_SECTION_VIEW_GROUPS = [
  [TenantPermission.SectionDocuments],
  ANY_DOCUMENT_VIEW_PERMISSIONS,
] as const;

export const DOCUMENTS_SECTION_MANAGE_GROUPS = [
  [TenantPermission.SectionDocuments],
  ANY_DOCUMENT_MANAGE_PERMISSIONS,
] as const;

/**
 * Lettura della configurazione documentale (numeratori, serie, causali, tipi
 * esterni): chi consulta un documento la vede perché serve a leggerlo, e chi
 * la CONFIGURA deve poterla vedere anche senza consultare alcun documento —
 * altrimenti la pagina Impostazioni documenti si apre vuota.
 */
export const DOCUMENTS_CONFIGURE_READ_PERMISSIONS = [
  ...ANY_DOCUMENT_VIEW_PERMISSIONS,
  TenantPermission.DocumentsConfigure,
] as readonly TenantPermissionKey[];

export const CUSTOMERS_VIEW_PERMISSIONS = [
  TenantPermission.SectionCustomers,
  TenantPermission.CustomersManage,
] as const satisfies readonly TenantPermissionKey[];

export const REPORTS_VIEW_PERMISSIONS = [
  TenantPermission.SectionReports,
] as const satisfies readonly TenantPermissionKey[];

/** Vendite online e corrispettivi: raggiungibili sia dalla sezione Vendite che dai Report. */
export const ONLINE_SALES_VIEW_PERMISSIONS = [
  TenantPermission.SectionSales,
  TenantPermission.SectionReports,
] as const satisfies readonly TenantPermissionKey[];

/**
 * Sezione E famiglia: senza questa forma la riga «Vendite online e
 * corrispettivi» della matrice documenti sarebbe una casella che non fa nulla
 * — il titolare la toglierebbe senza che cambi niente.
 */
export const ONLINE_SALES_VIEW_GROUPS = [
  ONLINE_SALES_VIEW_PERMISSIONS,
  [docViewPermission('online_sale')],
] as const;

/**
 * Il **Corrispettivo manuale** (`10` §12): leggerlo è vedere il Registro.
 *
 * Non ha un permesso di lettura proprio perché non ha un elenco proprio: si
 * apre da una riga del Registro Corrispettivi, e chi quella riga la vede può
 * anche aprirla. Un permesso in più qui creerebbe uno stato in cui l'operatore
 * legge il totale ma non la registrazione che lo compone.
 */
export const MANUAL_RECEIPT_READ_GROUPS = ONLINE_SALES_VIEW_GROUPS;

/**
 * **Scrivere** nel Registro: creare, correggere ed eliminare una registrazione
 * manuale.
 *
 * ⚠️ È la **prima applicazione** di `reports.fiscal_register`: il permesso
 * esisteva dal piano permessi ma nessuna rotta, guard o template lo usava, e la
 * sua descrizione parlava ancora di «marcare le consegne al commercialista» —
 * flusso ritirato il 16/08/2026 (`10` §5). La descrizione è stata riscritta
 * insieme a questo uso.
 *
 * Si chiede **anche** la vista del Registro, non solo la scrittura: chi può
 * registrare un corrispettivo deve poter vedere quello che sta modificando. È
 * la stessa forma dell'export, che pretende la vista più `reports.export`.
 */
export const MANUAL_RECEIPT_WRITE_GROUPS = [
  ...ONLINE_SALES_VIEW_GROUPS,
  [TenantPermission.ReportsFiscalRegister],
] as const;

/** Sync catalogo Shopify (CSV prodotti). */
export const SHOPIFY_CATALOG_SYNC_PERMISSIONS = [
  TenantPermission.CatalogImportExport,
] as const satisfies readonly TenantPermissionKey[];

/** Sync giacenze Shopify (CSV giacenze). */
export const SHOPIFY_INVENTORY_SYNC_PERMISSIONS = [
  TenantPermission.InventoryImportExport,
] as const satisfies readonly TenantPermissionKey[];

// Le due sincronizzazioni «operative» del canale stavano dietro UNA costante
// sola, che valeva `[reports.export]`. Sono separate perché toccano entità
// diverse: una costante condivisa può chiedere solo il permesso più debole fra
// i due usi, e infatti chiedeva quello di uno scarico CSV per due scritture.

/**
 * Sync clienti Shopify: «Esportare dati» E il permesso che governa la
 * scrittura dell'anagrafica. Senza il secondo gruppo, chi poteva solo
 * scaricare un CSV creava e aggiornava clienti dal canale — la stessa
 * scrittura che `POST /customers` protegge con `customers.manage`.
 */
export const SHOPIFY_CUSTOMERS_SYNC_GROUPS = [
  [TenantPermission.ReportsExport],
  [TenantPermission.CustomersManage],
] as const;

/**
 * Sync ordini Shopify: «Esportare dati» E il diritto di vedere le vendite
 * online (sezione E famiglia, la stessa forma dei corrispettivi). L'import
 * crea gli ordini del canale e libera gli impegni di magazzino di quelli
 * spariti da Shopify: senza il secondo requisito quelle carte entravano nel
 * gestionale per mano di chi non ha il permesso di consultarle.
 *
 * Si chiede la CONSULTAZIONE e non la gestione perché `online_sale` è una
 * famiglia di sola consultazione (VIEW_ONLY_DOCUMENT_FAMILIES): nessun preset
 * assegna `doc.online_sale.manage`, quindi pretenderlo chiuderebbe la rotta a
 * chiunque non sia il titolare.
 */
export const SHOPIFY_ORDERS_SYNC_GROUPS = [
  [TenantPermission.ReportsExport],
  ...ONLINE_SALES_VIEW_GROUPS,
] as const;
