import type { UserRole } from './user.model';
import { UserRole as UserRoleConst } from './user.model';

/**
 * Modello permessi «sezioni + documenti + azioni» — SPECCHIO delle costanti
 * API (api/src/auth/tenant-permission.constants.ts): stessi valori, stessa
 * semantica. Tre ingredienti: sezioni (`section.*`, le porte della sidebar),
 * matrice documenti (`doc.<famiglia>.view|manage`), azioni. Il titolare
 * ignora l'array (accesso pieno).
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
   * negozio, non la gestione di un documento.
   */
  DocumentsConfigure: 'documents.configure',
  /**
   * Registro fiscale: marcare le consegne al commercialista, cambiare lo stato
   * fiscale di un ordine, correggere una riga del registro corrispettivi.
   */
  ReportsFiscalRegister: 'reports.fiscal_register',
  CustomersManage: 'customers.manage',
} as const;

/** Famiglie della matrice documenti, nell'ordine di presentazione dell'editor. */
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

export type TenantPermissionKey =
  | (typeof TenantPermission)[keyof typeof TenantPermission]
  | `doc.${DocumentPermissionFamily}.view`
  | `doc.${DocumentPermissionFamily}.manage`;

export function docViewPermission(family: DocumentPermissionFamily): TenantPermissionKey {
  return `doc.${family}.view`;
}

export function docManagePermission(family: DocumentPermissionFamily): TenantPermissionKey {
  return `doc.${family}.manage`;
}

const DOC_PERMISSIONS = DOCUMENT_PERMISSION_FAMILIES.flatMap((family) => [
  docViewPermission(family),
  docManagePermission(family),
]);

export const ALL_TENANT_PERMISSIONS = [
  ...Object.values(TenantPermission),
  ...DOC_PERMISSIONS,
] as readonly TenantPermissionKey[];

export const ANY_DOCUMENT_VIEW_PERMISSIONS = DOCUMENT_PERMISSION_FAMILIES.map((family) =>
  docViewPermission(family),
) as readonly TenantPermissionKey[];

export const ANY_DOCUMENT_MANAGE_PERMISSIONS = DOCUMENT_PERMISSION_FAMILIES.map((family) =>
  docManagePermission(family),
) as readonly TenantPermissionKey[];

export const DOCUMENT_FAMILY_LABELS: Readonly<Record<DocumentPermissionFamily, string>> = {
  goods_receipt: 'Arrivo merce',
  purchase_invoice: 'Registrazione fattura fornitore',
  supplier_order: 'Ordine fornitore',
  sales_order: 'Ordine cliente',
  quote: 'Preventivo',
  proforma: 'Proforma',
  sales_ddt: 'DDT di vendita',
  invoice: 'Fattura (anche accompagnatoria)',
  store_sale: 'Vendite e resi al banco',
  online_sale: 'Vendite online e corrispettivi',
  transfer: 'Trasferimento tra sedi',
  adjustment: 'Rettifiche e carichi manuali',
  manual_unload: 'Vendita manuale',
};

/** Famiglie generate dal sistema: nell'editor si offre solo «Consulta». */
export const VIEW_ONLY_DOCUMENT_FAMILIES: readonly DocumentPermissionFamily[] = ['online_sale'];

export interface TenantPermissionDefinition {
  readonly key: TenantPermissionKey;
  readonly label: string;
  readonly hint: string;
  readonly group:
    'sections' | 'inventory' | 'catalog' | 'sales' | 'reports' | 'settings' | 'customers';
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

export const TENANT_PERMISSION_GROUP_LABELS: Readonly<
  Record<TenantPermissionDefinition['group'], string>
> = {
  sections: 'Sezioni',
  inventory: 'Magazzino',
  catalog: 'Catalogo',
  sales: 'Vendite',
  reports: 'Report',
  settings: 'Impostazioni',
  customers: 'Clienti',
};

/** Azioni da mettere in evidenza nell'editor (gruppo «Azioni sensibili»). */
export const SENSITIVE_ACTION_PERMISSIONS: readonly TenantPermissionKey[] = [
  TenantPermission.CatalogViewPurchaseCosts,
  TenantPermission.InventoryViewAllLocations,
  TenantPermission.CatalogDelete,
  TenantPermission.InventoryImportExport,
  TenantPermission.CatalogImportExport,
  TenantPermission.ReportsExport,
];

// ── Preset di ruolo (materializzati al salvataggio, mai fallback a runtime) ──

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
  ...ALL_DOC_VIEW,
  docManagePermission('goods_receipt'),
  TenantPermission.InventoryManage,
  TenantPermission.RetailRegister,
];

export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<UserRole, readonly TenantPermissionKey[]>> =
  {
    [UserRoleConst.Owner]: ALL_TENANT_PERMISSIONS,
    [UserRoleConst.Admin]: ADMIN_DEFAULTS,
    [UserRoleConst.Manager]: MANAGER_DEFAULTS,
    [UserRoleConst.Clerk]: CLERK_DEFAULTS,
  };

export function isTenantPermissionKey(value: string): value is TenantPermissionKey {
  return (ALL_TENANT_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultPermissionsForRole(role: UserRole): readonly TenantPermissionKey[] {
  return ROLE_DEFAULT_PERMISSIONS[role] ?? [];
}
