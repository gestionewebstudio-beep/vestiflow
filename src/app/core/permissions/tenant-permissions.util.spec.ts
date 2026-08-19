import { describe, expect, it } from 'vitest';

import type { User } from '../models/user.model';
import { UserRole } from '../models/user.model';
import { TenantChannelProfile } from '../models/tenant-channel-profile.model';
import {
  DOCUMENT_PERMISSION_FAMILIES,
  TenantPermission,
  defaultPermissionsForRole,
  docManagePermission,
  docViewPermission,
  type TenantPermissionKey,
} from '../models/tenant-permission.model';

import {
  CUSTOMERS_VIEW_PERMISSIONS,
  DOCUMENTS_SECTION_GROUPS,
  MANUAL_RECEIPT_WRITE_GROUPS,
  ONLINE_SALES_VIEW_GROUPS,
  SALES_ORDERS_MANAGE_GROUPS,
  SALES_ORDERS_VIEW_GROUPS,
  SUPPLIER_ORDERS_MANAGE_GROUPS,
  SUPPLIER_ORDERS_VIEW_GROUPS,
  canAccessCatalogSection,
  canAccessDocumentsSection,
  canAccessInventorySection,
  canAccessSalesSection,
  canAccessSettingsSection,
  canAccessSuppliersSection,
  canDeleteProducts,
  canExportOperationalData,
  canImportExportCatalog,
  canImportExportInventory,
  canManageCatalog,
  canManageCustomers,
  canManageDocFamily,
  canManageDocuments,
  canManageFiscalRegister,
  canManageInventory,
  canManageMfa,
  canManageSalesOrders,
  canManageSettingsCompany,
  canManageShopifyConnection,
  canManageSupplierOrders,
  canManageTikTokConnection,
  canOpenRetailRegister,
  canReceiveSupplierOrders,
  canRegisterRetailSales,
  canSyncCatalogFromShopify,
  canSyncInventoryFromShopify,
  canSyncProductToShopify,
  canSyncShopifyOperationalData,
  canViewCustomers,
  canViewDocFamily,
  canViewDocuments,
  canViewInventoryAllLocations,
  canViewPurchaseCosts,
  canViewReports,
  canViewSalesOrders,
  canViewSupplierOrders,
  isTenantAdmin,
  isTenantManager,
} from './tenant-permissions.util';

function userWithRole(role: User['role'], overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'test@example.com',
    displayName: 'Test',
    avatarUrl: null,
    role,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    // I preset di ruolo sono materializzati al salvataggio (l'array salvato È
    // la verità): la fixture rispecchia i dati reali, non l'array vuoto.
    permissions: [...defaultPermissionsForRole(role)],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tenant-permissions.util', () => {
  it('isTenantAdmin consente owner e admin', () => {
    expect(isTenantAdmin(userWithRole(UserRole.Owner))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Admin))).toBe(true);
    expect(isTenantAdmin(userWithRole(UserRole.Manager))).toBe(false);
    expect(isTenantAdmin(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('isTenantAdmin è true con sessione assistenza attiva anche per clerk', () => {
    expect(
      isTenantAdmin(
        userWithRole(UserRole.Clerk, {
          supportSession: {
            sessionId: 'session-1',
            targetTenantId: 'tenant-client',
            targetTenantName: 'Cliente',
            expiresAt: '2026-06-24T16:00:00.000Z',
          },
        }),
      ),
    ).toBe(true);
  });

  it('isTenantManager include manager ma esclude clerk senza permessi operativi', () => {
    expect(isTenantManager(userWithRole(UserRole.Manager))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Clerk))).toBe(true);
    expect(isTenantManager(userWithRole(UserRole.Owner))).toBe(true);
    expect(
      isTenantManager(
        userWithRole(UserRole.Clerk, {
          permissions: [TenantPermission.SectionCustomers],
        }),
      ),
    ).toBe(false);
  });

  it('isTenantManager include clerk con permesso magazzino', () => {
    expect(
      isTenantManager(
        userWithRole(UserRole.Clerk, {
          permissions: [TenantPermission.InventoryManage],
        }),
      ),
    ).toBe(true);
  });

  it('canManageCatalog e ordini fornitori seguono manager', () => {
    expect(canManageCatalog(userWithRole(UserRole.Manager))).toBe(true);
    expect(canManageCatalog(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageSupplierOrders(userWithRole(UserRole.Manager))).toBe(true);
  });

  it('canSyncCatalogFromShopify richiede catalog.import_export, non catalog.manage', () => {
    const catalogManageOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogManage],
    });

    expect(canManageCatalog(catalogManageOnly)).toBe(true);
    expect(canImportExportCatalog(catalogManageOnly)).toBe(false);
    expect(canSyncCatalogFromShopify(catalogManageOnly)).toBe(false);
    expect(canSyncProductToShopify(catalogManageOnly)).toBe(false);
  });

  it('import/export catalogo e giacenze sono permessi distinti', () => {
    const inventoryOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryImportExport],
    });
    const catalogOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogImportExport],
    });

    expect(canImportExportInventory(inventoryOnly)).toBe(true);
    expect(canImportExportCatalog(inventoryOnly)).toBe(false);
    expect(canSyncInventoryFromShopify(inventoryOnly)).toBe(true);
    expect(canSyncCatalogFromShopify(inventoryOnly)).toBe(false);

    expect(canImportExportCatalog(catalogOnly)).toBe(true);
    expect(canImportExportInventory(catalogOnly)).toBe(false);
    expect(canSyncCatalogFromShopify(catalogOnly)).toBe(true);
    expect(canSyncInventoryFromShopify(catalogOnly)).toBe(false);
  });

  it('canDeleteProducts e connessioni canali sono owner-only', () => {
    expect(canDeleteProducts(userWithRole(UserRole.Manager))).toBe(false);
    expect(canDeleteProducts(userWithRole(UserRole.Admin))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Owner))).toBe(true);
    expect(canManageShopifyConnection(userWithRole(UserRole.Admin))).toBe(false);
    expect(canManageShopifyConnection(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageTikTokConnection(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canExportOperationalData e sync Shopify operativo', () => {
    expect(canExportOperationalData(userWithRole(UserRole.Manager))).toBe(true);
    expect(canExportOperationalData(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canSyncShopifyOperationalData(userWithRole(UserRole.Clerk))).toBe(false);
    expect(
      canSyncShopifyOperationalData(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.ReportsExport] }),
      ),
    ).toBe(true);
    expect(canSyncProductToShopify(userWithRole(UserRole.Manager))).toBe(true);
    expect(canSyncProductToShopify(userWithRole(UserRole.Clerk))).toBe(false);
  });

  it('canManageMfa include platform admin', () => {
    const platformAdmin = { ...userWithRole(UserRole.Clerk), isPlatformAdmin: true };
    expect(canManageMfa(userWithRole(UserRole.Clerk))).toBe(false);
    expect(canManageMfa(userWithRole(UserRole.Owner))).toBe(true);
    expect(canManageMfa(platformAdmin)).toBe(true);
  });

  it('ritorna false con utente null per ogni helper', () => {
    expect(isTenantAdmin(null)).toBe(false);
    expect(isTenantManager(undefined)).toBe(false);
    expect(canManageCatalog(null)).toBe(false);
    expect(canImportExportInventory(null)).toBe(false);
    expect(canManageSupplierOrders(null)).toBe(false);
    expect(canViewReports(null)).toBe(false);
    expect(canViewCustomers(null)).toBe(false);
  });

  it('canViewReports e canViewCustomers rispettano permessi espliciti', () => {
    const noReports = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryManage, TenantPermission.SectionCustomers],
    });
    expect(canViewReports(noReports)).toBe(false);
    expect(canViewCustomers(noReports)).toBe(true);

    const reportsOnly = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionReports],
    });
    expect(canViewReports(reportsOnly)).toBe(true);
    expect(canViewCustomers(reportsOnly)).toBe(false);
  });

  it('canReceiveSupplierOrders include manage o receive', () => {
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: ['doc.goods_receipt.manage'] }),
      ),
    ).toBe(true);
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: ['doc.supplier_order.manage'] }),
      ),
    ).toBe(true);
    expect(
      canReceiveSupplierOrders(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.InventoryManage] }),
      ),
    ).toBe(false);
  });

  it('canManageSettingsCompany richiede settings.company', () => {
    expect(canManageSettingsCompany(userWithRole(UserRole.Manager))).toBe(false);
    expect(canManageSettingsCompany(userWithRole(UserRole.Admin))).toBe(true);
    expect(
      canManageSettingsCompany(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.SettingsCompany] }),
      ),
    ).toBe(true);
  });
});

// ── Aggiunte 19/08/2026 ────────────────────────────────────────────────────
// Copertura dei gate che nessuna prova toccava: sezioni, matrice documenti,
// azioni sensibili e cassa negozio. Sono lo SPECCHIO dei gate API: se qui e là
// divergono, il client apre una rotta che il server nega — schermata vuota e
// 403 su ogni chiamata, senza che niente arrossisca.

/** Titolare: l’array è vuoto per scelta, l’accesso pieno viene dal ruolo. */
const titolare = userWithRole(UserRole.Owner, { permissions: [] });

/** Sezione «semplice»: una porta, un permesso. Documenti sta a parte (ne vuole due). */
const SEZIONI_SEMPLICI: readonly (readonly [
  TenantPermissionKey,
  (user: User | null | undefined) => boolean,
])[] = [
  [TenantPermission.SectionProducts, canAccessCatalogSection],
  [TenantPermission.SectionInventory, canAccessInventorySection],
  [TenantPermission.SectionSuppliers, canAccessSuppliersSection],
  [TenantPermission.SectionSales, canAccessSalesSection],
  [TenantPermission.SectionSettings, canAccessSettingsSection],
];

const TUTTE_LE_SEZIONI: readonly ((user: User | null | undefined) => boolean)[] = [
  canAccessCatalogSection,
  canAccessInventorySection,
  canAccessSuppliersSection,
  canAccessDocumentsSection,
  canAccessSalesSection,
  canAccessSettingsSection,
];

describe('tenant-permissions.util — sezioni', () => {
  it('ogni sezione risponde al proprio permesso e a nessun altro', () => {
    for (const [permesso, apre] of SEZIONI_SEMPLICI) {
      const soloQuesta = userWithRole(UserRole.Clerk, { permissions: [permesso] });

      for (const [altroPermesso, apreAltra] of SEZIONI_SEMPLICI) {
        expect(apreAltra(soloQuesta)).toBe(altroPermesso === permesso);
      }
      expect(apre(soloQuesta)).toBe(true);
    }
  });

  it('la sezione Documenti richiede la porta E almeno una famiglia consultabile', () => {
    const soloPorta = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionDocuments],
    });
    const solaFamiglia = userWithRole(UserRole.Clerk, {
      permissions: [docViewPermission('quote')],
    });
    const entrambi = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionDocuments, docViewPermission('quote')],
    });

    expect(canAccessDocumentsSection(soloPorta)).toBe(false);
    expect(canAccessDocumentsSection(solaFamiglia)).toBe(false);
    expect(canAccessDocumentsSection(entrambi)).toBe(true);
  });

  it('il titolare apre ogni sezione anche con l’array permessi vuoto', () => {
    for (const apre of TUTTE_LE_SEZIONI) {
      expect(apre(titolare)).toBe(true);
    }
  });

  it('nessuna sezione si apre senza utente', () => {
    for (const apre of TUTTE_LE_SEZIONI) {
      expect(apre(null)).toBe(false);
      expect(apre(undefined)).toBe(false);
    }
  });

  it('un clerk con l’array permessi vuoto non apre nulla', () => {
    const spogliato = userWithRole(UserRole.Clerk, { permissions: [] });

    for (const apre of TUTTE_LE_SEZIONI) {
      expect(apre(spogliato)).toBe(false);
    }
  });
});

describe('tenant-permissions.util — matrice documenti', () => {
  it('«gestisci» implica «consulta», mai il contrario', () => {
    const gestisce = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('invoice')],
    });
    const consulta = userWithRole(UserRole.Clerk, {
      permissions: [docViewPermission('invoice')],
    });

    expect(canViewDocFamily(gestisce, 'invoice')).toBe(true);
    expect(canManageDocFamily(gestisce, 'invoice')).toBe(true);
    expect(canViewDocFamily(consulta, 'invoice')).toBe(true);
    expect(canManageDocFamily(consulta, 'invoice')).toBe(false);
  });

  it('il permesso di una famiglia non ne apre un’altra', () => {
    const soloFatture = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('invoice')],
    });

    expect(canViewDocFamily(soloFatture, 'sales_order')).toBe(false);
    expect(canManageDocFamily(soloFatture, 'sales_order')).toBe(false);
    expect(canViewDocFamily(soloFatture, 'goods_receipt')).toBe(false);
  });

  it('il titolare vede e gestisce ogni famiglia con l’array vuoto', () => {
    for (const famiglia of DOCUMENT_PERMISSION_FAMILIES) {
      expect(canViewDocFamily(titolare, famiglia)).toBe(true);
      expect(canManageDocFamily(titolare, famiglia)).toBe(true);
    }
  });

  it('senza utente la matrice documenti nega tutto', () => {
    expect(canViewDocFamily(null, 'invoice')).toBe(false);
    expect(canViewDocFamily(undefined, 'invoice')).toBe(false);
    expect(canManageDocFamily(null, 'invoice')).toBe(false);
    expect(canViewDocuments(null)).toBe(false);
    expect(canManageDocuments(null)).toBe(false);
    expect(canViewSupplierOrders(null)).toBe(false);
    expect(canViewSalesOrders(undefined)).toBe(false);
    expect(canManageSalesOrders(null)).toBe(false);
  });

  it('al registro basta UNA famiglia: consultabile per vedere, gestibile per scrivere', () => {
    const soloConsulta = userWithRole(UserRole.Clerk, {
      permissions: [docViewPermission('transfer')],
    });
    const gestisceUna = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('transfer')],
    });
    const nessunaFamiglia = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionDocuments],
    });

    expect(canViewDocuments(soloConsulta)).toBe(true);
    expect(canManageDocuments(soloConsulta)).toBe(false);
    expect(canViewDocuments(gestisceUna)).toBe(true);
    expect(canManageDocuments(gestisceUna)).toBe(true);
    expect(canViewDocuments(nessunaFamiglia)).toBe(false);
    expect(canManageDocuments(nessunaFamiglia)).toBe(false);
    expect(canViewDocuments(titolare)).toBe(true);
    expect(canManageDocuments(titolare)).toBe(true);
  });

  it('ordini fornitore: la vista viene da consulta O gestisci, la gestione solo da gestisci', () => {
    const consulta = userWithRole(UserRole.Clerk, {
      permissions: [docViewPermission('supplier_order')],
    });
    const gestisce = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('supplier_order')],
    });
    const altraFamiglia = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('goods_receipt')],
    });

    expect(canViewSupplierOrders(consulta)).toBe(true);
    expect(canManageSupplierOrders(consulta)).toBe(false);
    expect(canViewSupplierOrders(gestisce)).toBe(true);
    expect(canManageSupplierOrders(gestisce)).toBe(true);
    expect(canViewSupplierOrders(altraFamiglia)).toBe(false);
    expect(canViewSupplierOrders(titolare)).toBe(true);
  });

  it('ordini cliente: la vista viene da consulta O gestisci, la gestione solo da gestisci', () => {
    const consulta = userWithRole(UserRole.Clerk, {
      permissions: [docViewPermission('sales_order')],
    });
    const gestisce = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('sales_order')],
    });
    const altraFamiglia = userWithRole(UserRole.Clerk, {
      permissions: [docManagePermission('quote')],
    });

    expect(canViewSalesOrders(consulta)).toBe(true);
    expect(canManageSalesOrders(consulta)).toBe(false);
    expect(canViewSalesOrders(gestisce)).toBe(true);
    expect(canManageSalesOrders(gestisce)).toBe(true);
    expect(canViewSalesOrders(altraFamiglia)).toBe(false);
    expect(canViewSalesOrders(titolare)).toBe(true);
    expect(canManageSalesOrders(titolare)).toBe(true);
  });
});

describe('tenant-permissions.util — azioni sensibili', () => {
  it('i costi d’acquisto hanno un permesso proprio: gestire il catalogo non li mostra', () => {
    const gestisceCatalogo = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogManage],
    });
    const vedeCosti = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CatalogViewPurchaseCosts],
    });

    expect(canViewPurchaseCosts(gestisceCatalogo)).toBe(false);
    expect(canViewPurchaseCosts(vedeCosti)).toBe(true);
    expect(canManageCatalog(vedeCosti)).toBe(false);
    expect(canViewPurchaseCosts(titolare)).toBe(true);
    expect(canViewPurchaseCosts(null)).toBe(false);
  });

  it('gestire le giacenze e vederle su tutte le sedi sono permessi distinti', () => {
    const gestisce = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryManage],
    });
    const vedeTutte = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    expect(canManageInventory(gestisce)).toBe(true);
    expect(canViewInventoryAllLocations(gestisce)).toBe(false);
    expect(canManageInventory(vedeTutte)).toBe(false);
    expect(canViewInventoryAllLocations(vedeTutte)).toBe(true);
    expect(canManageInventory(titolare)).toBe(true);
    expect(canViewInventoryAllLocations(titolare)).toBe(true);
    expect(canManageInventory(null)).toBe(false);
    expect(canViewInventoryAllLocations(undefined)).toBe(false);
  });

  it('registrare corrispettivi manuali richiede reports.fiscal_register, non l’export', () => {
    const esporta = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.ReportsExport],
    });
    const registra = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.ReportsFiscalRegister],
    });

    expect(canManageFiscalRegister(esporta)).toBe(false);
    expect(canExportOperationalData(registra)).toBe(false);
    expect(canManageFiscalRegister(registra)).toBe(true);
    expect(canManageFiscalRegister(titolare)).toBe(true);
    expect(canManageFiscalRegister(null)).toBe(false);
  });

  it('la sola sezione Clienti consulta l’anagrafica ma non la modifica', () => {
    const consulta = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionCustomers],
    });
    const gestisce = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.CustomersManage],
    });

    expect(canViewCustomers(consulta)).toBe(true);
    expect(canManageCustomers(consulta)).toBe(false);
    // «Gestire clienti» apre anche la consultazione: sta nell’elenco della vista.
    expect(canViewCustomers(gestisce)).toBe(true);
    expect(canManageCustomers(gestisce)).toBe(true);
    expect(canManageCustomers(titolare)).toBe(true);
    expect(canManageCustomers(null)).toBe(false);
  });
});

describe('tenant-permissions.util — cassa negozio', () => {
  const cassiere = userWithRole(UserRole.Clerk, {
    permissions: [TenantPermission.SectionSales, TenantPermission.RetailRegister],
  });

  it('canOpenRetailRegister esige sezione Vendite E permesso di battere', () => {
    const senzaSezione = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.RetailRegister],
    });
    const senzaBattitura = userWithRole(UserRole.Clerk, {
      permissions: [TenantPermission.SectionSales],
    });

    expect(canOpenRetailRegister(cassiere)).toBe(true);
    expect(canOpenRetailRegister(senzaSezione)).toBe(false);
    expect(canOpenRetailRegister(senzaBattitura)).toBe(false);
    expect(canOpenRetailRegister(titolare)).toBe(true);
  });

  it('la cassa si apre con ogni profilo canale del tenant', () => {
    for (const profilo of Object.values(TenantChannelProfile)) {
      expect(canOpenRetailRegister({ ...cassiere, tenantChannelProfile: profilo })).toBe(true);
    }
  });

  it('senza utente, o con profilo canale assente, la cassa resta chiusa', () => {
    expect(canOpenRetailRegister(null)).toBe(false);
    expect(canOpenRetailRegister(undefined)).toBe(false);
    expect(
      canOpenRetailRegister(userWithRole(UserRole.Owner, { tenantChannelProfile: undefined })),
    ).toBe(false);
  });

  it('canRegisterRetailSales risponde al solo permesso retail.register', () => {
    expect(
      canRegisterRetailSales(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.RetailRegister] }),
      ),
    ).toBe(true);
    expect(
      canRegisterRetailSales(
        userWithRole(UserRole.Clerk, { permissions: [TenantPermission.SectionSales] }),
      ),
    ).toBe(false);
    expect(canRegisterRetailSales(titolare)).toBe(true);
    expect(canRegisterRetailSales(null)).toBe(false);
  });
});

describe('tenant-permissions.util — gate di rotta a gruppi', () => {
  it('ordini cliente e fornitore chiedono la sezione E la famiglia, non un elenco piatto', () => {
    expect(SALES_ORDERS_VIEW_GROUPS).toEqual([
      [TenantPermission.SectionSales],
      [docViewPermission('sales_order'), docManagePermission('sales_order')],
    ]);
    expect(SALES_ORDERS_MANAGE_GROUPS).toEqual([
      [TenantPermission.SectionSales],
      [docManagePermission('sales_order')],
    ]);
    expect(SUPPLIER_ORDERS_VIEW_GROUPS).toEqual([
      [TenantPermission.SectionSuppliers],
      [docViewPermission('supplier_order'), docManagePermission('supplier_order')],
    ]);
    expect(SUPPLIER_ORDERS_MANAGE_GROUPS).toEqual([
      [TenantPermission.SectionSuppliers],
      [docManagePermission('supplier_order')],
    ]);
  });

  it('il registro documenti chiede la porta e le sole CONSULTAZIONI di famiglia', () => {
    expect(DOCUMENTS_SECTION_GROUPS).toEqual([
      [TenantPermission.SectionDocuments],
      DOCUMENT_PERMISSION_FAMILIES.map((famiglia) => docViewPermission(famiglia)),
    ]);
  });

  it('scrivere un corrispettivo manuale aggiunge il registro fiscale alla vista corrispettivi', () => {
    expect(ONLINE_SALES_VIEW_GROUPS).toEqual([
      [TenantPermission.SectionSales, TenantPermission.SectionReports],
      [docViewPermission('online_sale')],
    ]);
    expect(MANUAL_RECEIPT_WRITE_GROUPS).toEqual([
      [TenantPermission.SectionSales, TenantPermission.SectionReports],
      [docViewPermission('online_sale')],
      [TenantPermission.ReportsFiscalRegister],
    ]);
  });

  it('la vista clienti si apre dalla sezione o dal permesso di gestione', () => {
    expect(CUSTOMERS_VIEW_PERMISSIONS).toEqual([
      TenantPermission.SectionCustomers,
      TenantPermission.CustomersManage,
    ]);
  });
});

describe('tenant-permissions.util — titolare e utente assente', () => {
  /**
   * La scorciatoia `hasFullTenantAccess` sta in testa a quasi ogni helper, ma
   * le prove storiche interrogavano solo manager e clerk: il ramo del titolare
   * restava non eseguito proprio dove sbagliarlo darebbe a un titolare una
   * schermata vuota nel proprio gestionale.
   */
  const AZIONI: readonly ((user: User | null | undefined) => boolean)[] = [
    canReceiveSupplierOrders,
    canManageCatalog,
    canImportExportCatalog,
    canImportExportInventory,
    canSyncCatalogFromShopify,
    canSyncInventoryFromShopify,
    canSyncShopifyOperationalData,
    canSyncProductToShopify,
    canDeleteProducts,
    canExportOperationalData,
    canViewReports,
    canViewCustomers,
    canManageSettingsCompany,
    canManageMfa,
    canManageShopifyConnection,
    canManageTikTokConnection,
    canManageSupplierOrders,
    isTenantAdmin,
    isTenantManager,
  ];

  it('il titolare passa ogni azione anche con l’array permessi vuoto', () => {
    for (const consente of AZIONI) {
      expect(consente(titolare)).toBe(true);
    }
  });

  it('senza utente ogni azione è negata', () => {
    for (const consente of AZIONI) {
      expect(consente(null)).toBe(false);
      expect(consente(undefined)).toBe(false);
    }
  });
});
