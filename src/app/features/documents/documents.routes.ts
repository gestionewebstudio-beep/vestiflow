import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { DocumentType } from '@core/models/document.model';
import {
  TenantPermission,
  docManagePermission,
  docViewPermission,
  type DocumentPermissionFamily,
} from '@core/models/tenant-permission.model';
import {
  DOCUMENTS_SECTION_GROUPS,
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
} from '@core/permissions/tenant-permissions.util';
import { documentTypeLabel } from '@domain/documents/models/document-labels.util';
import {
  SALES_FORM_DOCUMENT_TYPES,
  type SalesFormDocumentType,
} from '@domain/documents/models/document-sales.util';

import { SALES_FORM_ROUTE_SEGMENT } from './models/document-routing.util';

// Matrice permessi documenti: ogni rotta chiede la SEZIONE (porta) E la
// FAMIGLIA del tipo — gli stessi due gruppi che l'API esige a livello di
// classe e di handler. «Gestisci» implica «Consulta». L'hub, il registro
// generico e il dettaglio per id chiedono la sezione e almeno una famiglia:
// il contenuto lo filtra comunque l'API per tipo.
const familyView = (family: DocumentPermissionFamily) => [
  [TenantPermission.SectionDocuments],
  [docViewPermission(family), docManagePermission(family)],
];
const familyManage = (family: DocumentPermissionFamily) => [
  [TenantPermission.SectionDocuments],
  [docManagePermission(family)],
];

/**
 * Le rotte di modifica della maschera vendita, una per tipo, generate dalla
 * mappa dei segmenti (`SALES_FORM_ROUTE_SEGMENT`).
 *
 * Sono generate e non scritte a mano per la stessa ragione per cui la mappa è
 * esaustiva: un tipo aggiunto alla famiglia deve **ottenere** la sua rotta,
 * non aspettare che qualcuno se ne ricordi. Scritte a mano sarebbero quattro
 * blocchi quasi identici, e il quinto sarebbe quello dimenticato.
 */
function salesFormEditRoutes(): Routes {
  return SALES_FORM_DOCUMENT_TYPES.map((type) => ({
    path: `${SALES_FORM_ROUTE_SEGMENT[type]}/:id/edit`,
    title: `Modifica ${documentTypeLabel(type).toLocaleLowerCase('it-IT')}`,
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage(SALES_FORM_PERMISSION_FAMILY[type]),
      salesDocumentType: type,
    },
  }));
}

/** Famiglia permessi di ciascun tipo della maschera vendita, esaustiva. */
const SALES_FORM_PERMISSION_FAMILY: Readonly<
  Record<SalesFormDocumentType, DocumentPermissionFamily>
> = {
  [DocumentType.Proforma]: 'proforma',
  [DocumentType.Invoice]: 'invoice',
  [DocumentType.InvoiceAccompanying]: 'invoice',
  [DocumentType.CreditNote]: 'invoice',
};

export const documentsRoutes: Routes = [
  {
    path: '',
    title: 'Documenti',
    loadComponent: () => import('./documents-hub.component').then((m) => m.DocumentsHubComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: DOCUMENTS_SECTION_GROUPS, reuse: true },
  },
  {
    path: 'registro',
    title: 'Registro documenti',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: DOCUMENTS_SECTION_GROUPS,
      documentListProfile: 'generic',
      reuse: true,
    },
  },
  {
    path: 'arrivi-merce',
    title: 'Arrivi merce',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('goods_receipt'),
      documentListProfile: 'goods-receipt',
      reuse: true,
    },
  },
  {
    // Pagine elenco dedicate ai documenti di vendita (voci sidebar Vendite):
    // stesso componente del registro con profilo dedicato (titolo, «Nuovo …»,
    // stato vuoto e filtri propri, senza filtro «Tipo»).
    path: 'quote',
    title: 'Preventivi',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('quote'),
      documentListProfile: 'quote',
      reuse: true,
    },
  },
  {
    path: 'proforma',
    title: 'Proforma',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('proforma'),
      documentListProfile: 'proforma',
      reuse: true,
    },
  },
  {
    path: 'sales-ddt',
    title: 'DDT vendita',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('sales_ddt'),
      documentListProfile: 'sales-ddt',
      reuse: true,
    },
  },
  {
    // Elenco condiviso Fattura / Fattura accompagnatoria: il filtro «Tipo» si
    // preimposta dal query param `type` della voce hub, ma resta modificabile.
    path: 'fattura',
    title: 'Fatture',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('invoice'),
      documentListProfile: 'invoice',
      reuse: true,
    },
  },
  // ⛔ Qui c'era il reindirizzamento dal vecchio percorso «Bozze fattura»
  // (`invoice-draft`). Tolto il 25/08/2026: quella schermata non esiste più —
  // il documento si chiama Fattura e sta su `fattura`.
  //
  // ⭐ E dal 26/08/2026 non sopravvive più nemmeno nell'enum: il valore
  // `invoice_draft` di `DocumentType` è stato rinominato in `invoice`. Qui
  // c'era scritto che rinominarlo «è una migration su un database condiviso più
  // un'ottantina di punti di codice»: erano 153 occorrenze in 58 file, e la
  // migration è una riga di catalogo senza un solo UPDATE sui dati.
  {
    // Elenco Registrazioni fattura fornitore (Documenti → Acquisti e
    // fornitori): colonne e filtri della spec, stato saldo incluso.
    path: 'registrazioni-fatture-fornitori',
    title: 'Registrazioni fatture fornitori',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('purchase_invoice'),
      documentListProfile: 'purchase-invoice',
      reuse: true,
    },
  },
  // ⛔ Qui c'erano due reindirizzamenti dal vecchio indirizzo delle Vendite al
  // banco (`/app/documents/vendite-negozio`), uscito da /app/documents il
  // 19/08/2026. Tolti il 25/08/2026 per decisione del proprietario: «per ora
  // nessuno lo utilizza, è in fase di realizzazione, possiamo sistemare tutto e
  // in modo pulito». Un indirizzo che sopravvive a se stesso è una seconda
  // strada verso la stessa pagina, e prima o poi qualcuno la scrive nei link.
  {
    // Vendita manuale: pagina elenco dedicata — il documento resta qui
    // finché l'operatore non lo elimina.
    path: 'manual-unload',
    title: 'Vendite manuali',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('manual_unload'),
      documentListProfile: 'manual-unload',
      reuse: true,
    },
  },
  {
    path: 'proforma/new',
    title: 'Nuova proforma',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('proforma'),
      salesDocumentType: DocumentType.Proforma,
    },
  },
  {
    path: 'fattura/new',
    title: 'Nuova fattura',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('invoice'),
      salesDocumentType: DocumentType.Invoice,
    },
  },
  {
    // Stesso form: le sezioni Trasporto e Destinazione e la colonna «Scarica
    // mag.» compaiono in base al tipo, non a un componente separato.
    path: 'fattura-accompagnatoria/new',
    title: 'Nuova fattura accompagnatoria',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('invoice'),
      salesDocumentType: DocumentType.InvoiceAccompanying,
    },
  },
  {
    // Terzo tipo della stessa famiglia, stesso form: cambiano il verso
    // economico e la casella «Carica magazzino» per riga, non il componente.
    path: 'nota-di-credito/new',
    title: 'Nuova nota di credito',
    loadComponent: () =>
      import('./sales-document-form.component').then((m) => m.SalesDocumentFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('invoice'),
      salesDocumentType: DocumentType.CreditNote,
    },
  },
  {
    // DDT vendita: stessa maschera dell'Ordine cliente in modalità sales-ddt
    // (prompt DDT §BASE — righe identiche, testata con Pagamento e «Seguirà
    // doc. di vendita», sezioni Trasporto e Indirizzi, scarico al salvataggio).
    path: 'sales-ddt/new',
    title: 'Nuovo DDT vendita',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('sales_ddt'),
      customerDocumentKind: 'sales-ddt',
    },
  },
  {
    path: 'sales-ddt/:id/edit',
    title: 'Modifica DDT vendita',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('sales_ddt'),
      customerDocumentKind: 'sales-ddt',
    },
  },
  {
    // Preventivo: stessa maschera dell'Ordine cliente in modalità quote
    // (nessuno stato, nessun impegno magazzino, numeratore PRE).
    path: 'quote/new',
    title: 'Nuovo preventivo',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('quote'),
      customerDocumentKind: 'quote',
    },
  },
  {
    path: 'quote/:id/edit',
    title: 'Modifica preventivo',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('quote'),
      customerDocumentKind: 'quote',
    },
  },
  {
    // Anteprime dettaglio dedicate (layout Ordine cliente): registrate dopo le
    // rotte `x/new` così «new» non viene mai interpretato come id documento.
    path: 'quote/:id',
    title: 'Dettaglio preventivo',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('quote'),
      documentListProfile: 'quote',
    },
  },
  {
    path: 'proforma/:id',
    title: 'Dettaglio proforma',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('proforma'),
      documentListProfile: 'proforma',
    },
  },
  {
    path: 'sales-ddt/:id',
    title: 'Dettaglio DDT vendita',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('sales_ddt'),
      documentListProfile: 'sales-ddt',
    },
  },
  {
    // Dettaglio condiviso: il titolo segue il tipo del documento caricato.
    path: 'fattura/:id',
    title: 'Dettaglio fattura',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('invoice'),
      documentListProfile: 'invoice',
    },
  },
  // ── Modifica: UNA ROTTA PER TIPO ──────────────────────────────────────────
  //
  // Sostituiscono `sales/:id/edit`, che il tipo non lo portava. Il form lo
  // ricavava allora dal documento **caricato**, e fino alla risposta della GET
  // ricadeva su Proforma: titolo «Modifica proforma» su una fattura, dicitura
  // «Proforma non valida ai fini IVA» stampata sopra un documento fiscale,
  // tendina Serie partita con le serie sbagliate (`07-…§18`, `03-…§4.11`).
  //
  // Il tipo nel percorso lo rende noto PRIMA della lettura, e con esso il
  // permesso esatto: ogni rotta chiede la propria famiglia invece dell'unione
  // di due (l'unione apriva la maschera a chi non gestiva quel tipo, lasciando
  // il rifiuto all'API — cioè a lavoro già fatto).
  ...salesFormEditRoutes(),
  {
    path: ':id/print',
    title: 'Stampa documento',
    loadComponent: () =>
      import('./document-print-preview.component').then((m) => m.DocumentPrintPreviewComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: DOCUMENTS_SECTION_GROUPS },
  },
  {
    path: 'goods-receipt/new',
    title: 'Nuovo arrivo merce',
    loadComponent: () =>
      import('./goods-receipt-form.component').then((m) => m.GoodsReceiptFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('goods_receipt') },
  },
  {
    path: 'registrazioni-fatture-fornitori/new',
    title: 'Nuova registrazione fattura fornitore',
    loadComponent: () =>
      import('./purchase-invoice-form.component').then((m) => m.PurchaseInvoiceFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('purchase_invoice') },
  },
  {
    path: 'registrazioni-fatture-fornitori/:id/edit',
    title: 'Modifica registrazione fattura fornitore',
    loadComponent: () =>
      import('./purchase-invoice-form.component').then((m) => m.PurchaseInvoiceFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('purchase_invoice') },
  },
  {
    path: 'transfer/new',
    title: 'Nuovo trasferimento',
    loadComponent: () => import('./transfer-form.component').then((m) => m.TransferFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('transfer') },
  },
  {
    path: 'transfer/:id/edit',
    title: 'Modifica trasferimento',
    loadComponent: () => import('./transfer-form.component').then((m) => m.TransferFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('transfer') },
  },
  {
    // Vendita manuale: stessa maschera del DDT vendita in modalità
    // manual-unload (prompt Vendita manuale — righe con prezzi e totali,
    // cliente facoltativo, scarico diretto giacenze al salvataggio).
    path: 'manual-unload/new',
    title: 'Nuova vendita manuale',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('manual_unload'),
      customerDocumentKind: 'manual-unload',
    },
  },
  {
    path: 'manual-unload/:id/edit',
    title: 'Modifica vendita manuale',
    loadComponent: () =>
      import('@features/sales-orders/customer-order-form.component').then(
        (m) => m.CustomerOrderFormComponent,
      ),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('manual_unload'),
      customerDocumentKind: 'manual-unload',
    },
  },
  {
    // Anteprima dettaglio dedicata (layout Ordine cliente): registrata dopo
    // `manual-unload/new` così «new» non viene interpretato come id.
    path: 'manual-unload/:id',
    title: 'Dettaglio vendita manuale',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('manual_unload'),
      documentListProfile: 'manual-unload',
    },
  },
  {
    path: 'adjustment/new',
    title: 'Nuova rettifica inventario',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('adjustment'),
      stockDocumentType: DocumentType.Adjustment,
    },
  },
  {
    path: 'adjustment/:id/edit',
    title: 'Modifica rettifica inventario',
    loadComponent: () =>
      import('./stock-operation-form.component').then((m) => m.StockOperationFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('adjustment'),
      stockDocumentType: DocumentType.Adjustment,
    },
  },
  {
    // Numeratori, serie, causali e tipi esterni: configurazione del negozio,
    // con la sua chiave — non «gestisci una famiglia qualsiasi».
    path: 'settings',
    title: 'Impostazioni documenti',
    loadComponent: () =>
      import('./document-settings.component').then((m) => m.DocumentSettingsComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: [
        [TenantPermission.SectionDocuments],
        [TenantPermission.DocumentsConfigure],
      ],
    },
  },
  {
    path: ':id/edit',
    title: 'Modifica arrivo merce',
    loadComponent: () =>
      import('./goods-receipt-form.component').then((m) => m.GoodsReceiptFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyManage('goods_receipt') },
  },
  {
    path: ':id',
    title: 'Dettaglio documento',
    loadComponent: () =>
      import('./document-detail.component').then((m) => m.DocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: DOCUMENTS_SECTION_GROUPS },
  },
];

/**
 * Elenco e dettaglio della **Vendite al banco**, montati dal composition root
 * sotto `/app/vendita-al-banco` (`11` C3).
 *
 * ⛔ **Vivono qui e non nella feature store-sales** perche' il componente e'
 * `DocumentListComponent`, che e' di questa feature: una feature non importa
 * da un'altra feature, la composizione la fa `app.routes.ts`.
 *
 * ⚠️ I `data:` vanno tenuti come sono. L'elenco ha `reuse: true` e il dettaglio
 * NO — uniformarli per simmetria cambierebbe comportamento — e senza
 * `documentListProfile: 'store-sale'` il componente ricade su `'generic'` e
 * mostra il registro generale col filtro Tipo: non un errore, una pagina
 * diversa che sembra funzionare.
 */
export const storeSaleDocumentRoutes: Routes = [
  {
    // Elenco delle Vendite al banco, condiviso dai due tipi creati dalla
    // maschera. I documenti nascono in transazione con i propri movimenti;
    // si modificano dalla loro maschera, non da qui, e non si eliminano.
    path: '',
    title: 'Vendite al banco',
    loadComponent: () => import('./document-list.component').then((m) => m.DocumentListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('store_sale'),
      documentListProfile: 'store-sale',
      reuse: true,
    },
  },
  {
    // ⚠️ Il dettaglio NON ha `reuse: true`, e non è una svista: ce l'ha solo
    // l'elenco. Aggiungerlo per simmetria cambierebbe comportamento.
    path: ':id',
    title: 'Dettaglio vendita al banco',
    loadComponent: () =>
      import('./sales-document-detail.component').then((m) => m.SalesDocumentDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: familyView('store_sale'),
      documentListProfile: 'store-sale',
    },
  },
];
