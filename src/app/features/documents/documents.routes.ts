import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { DocumentType } from '@core/models/document.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  DOCUMENTS_SECTION_PERMISSIONS,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

export const documentsRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Documenti',
    loadComponent: () => import('./documents-hub.component').then((m) => m.DocumentsHubComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS },
  },
  {
    path: 'registro',
    title: 'VestiFlow · Registro documenti',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'generic',
    },
  },
  {
    path: 'arrivi-merce',
    title: 'VestiFlow · Arrivi merce',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'goods-receipt',
    },
  },
  {
    // Pagine elenco dedicate ai documenti di vendita (voci sidebar Vendite):
    // stesso componente del registro con profilo dedicato (titolo, «Nuovo …»,
    // stato vuoto e filtri propri, senza filtro «Tipo»).
    path: 'quote',
    title: 'VestiFlow · Preventivi',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'quote',
    },
  },
  {
    path: 'proforma',
    title: 'VestiFlow · Proforma',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'proforma',
    },
  },
  {
    path: 'sales-ddt',
    title: 'VestiFlow · DDT vendita',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'sales-ddt',
    },
  },
  {
    // Elenco condiviso Fattura / Fattura accompagnatoria: il filtro «Tipo» si
    // preimposta dal query param `type` della voce hub, ma resta modificabile.
    path: 'fattura',
    title: 'VestiFlow · Fatture',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'invoice',
    },
  },
  {
    // Vecchio percorso «Bozze fattura»: preserva i link salvati dagli utenti.
    path: 'invoice-draft',
    redirectTo: 'fattura',
    pathMatch: 'full',
  },
  {
    // Elenco Registrazioni fattura fornitore (Documenti → Acquisti e
    // fornitori): colonne e filtri della spec, stato saldo incluso.
    path: 'registrazione-fattura',
    title: 'VestiFlow · Registrazioni fattura',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'purchase-invoice',
    },
  },
  {
    // Scarico manuale giacenze: pagina elenco dedicata (prompt Scarico
    // manuale) — il documento resta qui finché l'operatore non lo elimina.
    path: 'manual-unload',
    title: 'VestiFlow · Scarico manuale giacenze',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'manual-unload',
    },
  },
  {
    path: 'proforma/new',
    title: 'VestiFlow · Nuova proforma',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      salesDocumentType: DocumentType.Proforma,
    },
  },
  {
    path: 'fattura/new',
    title: 'VestiFlow · Nuova fattura',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      salesDocumentType: DocumentType.InvoiceDraft,
    },
  },
  {
    // Stesso form: le sezioni Trasporto e Destinazione e la colonna «Scarica
    // mag.» compaiono in base al tipo, non a un componente separato.
    path: 'fattura-accompagnatoria/new',
    title: 'VestiFlow · Nuova fattura accompagnatoria',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      salesDocumentType: DocumentType.InvoiceAccompanying,
    },
  },
  {
    // DDT vendita: stessa maschera dell'Ordine cliente in modalità sales-ddt
    // (prompt DDT §BASE — righe identiche, testata con Pagamento e «Seguirà
    // doc. di vendita», sezioni Trasporto e Indirizzi, scarico al salvataggio).
    path: 'sales-ddt/new',
    title: 'VestiFlow · Nuovo DDT vendita',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'sales-ddt',
    },
  },
  {
    path: 'sales-ddt/:id/edit',
    title: 'VestiFlow · Modifica DDT vendita',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'sales-ddt',
    },
  },
  {
    // Preventivo: stessa maschera dell'Ordine cliente in modalità quote
    // (nessuno stato, nessun impegno magazzino, numeratore PRE).
    path: 'quote/new',
    title: 'VestiFlow · Nuovo preventivo',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'quote',
    },
  },
  {
    path: 'quote/:id/edit',
    title: 'VestiFlow · Modifica preventivo',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'quote',
    },
  },
  {
    // Anteprime dettaglio dedicate (layout Ordine cliente): registrate dopo le
    // rotte `x/new` così «new» non viene mai interpretato come id documento.
    path: 'quote/:id',
    title: 'VestiFlow · Dettaglio preventivo',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'quote',
    },
  },
  {
    path: 'proforma/:id',
    title: 'VestiFlow · Dettaglio proforma',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'proforma',
    },
  },
  {
    path: 'sales-ddt/:id',
    title: 'VestiFlow · Dettaglio DDT vendita',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'sales-ddt',
    },
  },
  {
    // Dettaglio condiviso: il titolo segue il tipo del documento caricato.
    path: 'fattura/:id',
    title: 'VestiFlow · Dettaglio fattura',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'invoice',
    },
  },
  {
    path: 'sales/:id/edit',
    title: 'VestiFlow · Modifica documento vendita',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: ':id/print',
    title: 'VestiFlow · Stampa documento',
    loadComponent: () =>
      import('./document-print-preview.component').then((m) => m.DocumentPrintPreviewComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS },
  },
  {
    path: 'goods-receipt/new',
    title: 'VestiFlow · Nuovo arrivo merce',
    loadComponent: () =>
      import('./goods-receipt-form.component').then((m) => m.GoodsReceiptFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: 'registrazione-fattura/new',
    title: 'VestiFlow · Nuova registrazione fattura',
    loadComponent: () =>
      import('./purchase-invoice-form.component').then((m) => m.PurchaseInvoiceFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: 'registrazione-fattura/:id/edit',
    title: 'VestiFlow · Modifica registrazione fattura',
    loadComponent: () =>
      import('./purchase-invoice-form.component').then((m) => m.PurchaseInvoiceFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: 'transfer/new',
    title: 'VestiFlow · Nuovo trasferimento',
    loadComponent: () => import('./transfer-form.component').then((m) => m.TransferFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: 'transfer/:id/edit',
    title: 'VestiFlow · Modifica trasferimento',
    loadComponent: () => import('./transfer-form.component').then((m) => m.TransferFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    // Scarico manuale: stessa maschera del DDT vendita in modalità
    // manual-unload (prompt Scarico manuale — righe con prezzi e totali,
    // cliente facoltativo, scarico diretto giacenze al salvataggio).
    path: 'manual-unload/new',
    title: 'VestiFlow · Nuovo scarico manuale',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'manual-unload',
    },
  },
  {
    path: 'manual-unload/:id/edit',
    title: 'VestiFlow · Modifica scarico manuale',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      customerDocumentKind: 'manual-unload',
    },
  },
  {
    // Anteprima dettaglio dedicata (layout Ordine cliente): registrata dopo
    // `manual-unload/new` così «new» non viene interpretato come id.
    path: 'manual-unload/:id',
    title: 'VestiFlow · Dettaglio scarico manuale',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS,
      documentListProfile: 'manual-unload',
    },
  },
  {
    path: 'adjustment/new',
    title: 'VestiFlow · Nuova rettifica inventario',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      stockDocumentType: DocumentType.Adjustment,
    },
  },
  {
    path: 'adjustment/:id/edit',
    title: 'VestiFlow · Modifica rettifica inventario',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      stockDocumentType: DocumentType.Adjustment,
    },
  },
  {
    path: 'settings',
    title: 'VestiFlow · Impostazioni documenti',
    loadComponent: () =>
      import('./document-settings.component').then((m) => m.DocumentSettingsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica arrivo merce',
    loadComponent: () =>
      import('./goods-receipt-form.component').then((m) => m.GoodsReceiptFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio documento',
    loadComponent: () =>
      import('./document-detail.component').then((m) => m.DocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: DOCUMENTS_SECTION_PERMISSIONS },
  },
];
