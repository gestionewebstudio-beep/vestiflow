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
    path: 'invoice-draft/new',
    title: 'VestiFlow · Nuova bozza fattura',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      salesDocumentType: DocumentType.InvoiceDraft,
    },
  },
  {
    path: 'sales-ddt/new',
    title: 'VestiFlow · Nuovo DDT vendita',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      salesDocumentType: DocumentType.SalesDdt,
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
    path: 'manual-unload/new',
    title: 'VestiFlow · Nuovo scarico manuale',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      stockDocumentType: DocumentType.ManualUnload,
    },
  },
  {
    path: 'manual-unload/:id/edit',
    title: 'VestiFlow · Modifica scarico manuale',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage,
      stockDocumentType: DocumentType.ManualUnload,
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
