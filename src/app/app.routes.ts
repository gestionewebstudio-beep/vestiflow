import { Routes } from '@angular/router';

import { authGuard, guestGuard } from '@core/auth';
import { mustChangePasswordGuard } from '@core/guards/must-change-password.guard';
import { tenantWorkspaceGuard } from '@core/guards/tenant-workspace.guard';
import { platformAdminGuard } from '@features/admin/guards/platform-admin.guard';

// Routing feature-based con lazy loading. Le route applicative vivono sotto /app,
// protette da authGuard; /login e' riservata ai guest (guestGuard).
// Le pagine lista conservate al cambio tab portano `data: { reuse: true }` sulla
// rotta foglia nel routes della feature (vedi TabRouteReuseStrategy): qui sui
// mount `loadChildren` il flag non avrebbe effetto, il router non lo legge.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  {
    path: 'login',
    title: 'Accesso',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'login/forgot-password',
    title: 'Recupero password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    // Senza guestGuard, a differenza delle sorelle: il link email Supabase
    // (invito o recupero) stabilisce una sessione prima di arrivare qui, e il
    // guard rimbalzerebbe l'utente in dashboard senza fargli impostare la password.
    path: 'login/reset-password',
    title: 'Nuova password',
    loadComponent: () =>
      import('@features/auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    // Fuori dalla shell (come reset-password): l'utente con password iniziale
    // da cambiare non deve vedere la navigazione finché non ha concluso.
    path: 'cambia-password',
    title: 'Cambia password',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard, mustChangePasswordGuard],
    loadComponent: () =>
      import('./layout/shell-layout.component').then((m) => m.ShellLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
      },
      {
        path: 'products',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/products/products.routes').then((m) => m.productsRoutes),
      },
      {
        path: 'inventory',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
      },
      {
        path: 'orders',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () => import('@features/orders/orders.routes').then((m) => m.ordersRoutes),
      },
      {
        path: 'suppliers',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/suppliers/suppliers.routes').then((m) => m.suppliersRoutes),
      },
      {
        path: 'documents',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/documents/documents.routes').then((m) => m.documentsRoutes),
      },
      {
        // Area Vendite: composizione di tre feature. Le pagine di online-sales
        // e store-sales vivono sotto /app/sales ma appartengono ad altre
        // feature: montarle qui (il composition root può importare le feature)
        // evita gli import cross-feature nei routes di sales-orders.
        // Ordine: i segmenti statici prima del catch-all '' di sales-orders,
        // il cui ':id' altrimenti li catturerebbe.
        path: 'sales',
        canActivate: [tenantWorkspaceGuard],
        children: [
          {
            path: 'online',
            loadChildren: () =>
              import('@features/online-sales/online-sales.routes').then((m) => m.onlineSalesRoutes),
          },
          {
            // «Corrispettivi» della sidebar porta al registro DERIVATO da
            // vendite e rettifiche. Quello costruito su `corrispettivo_entries`
            // — che mostrava aliquote inventate sugli ordini multi-aliquota
            // (registro difetti 3.12) — è caduto il 17/08/2026 con le sue
            // tabelle: l'indirizzo e la voce di menu non sono mai cambiati.
            //
            // Il componente vive sotto `features/reports/` e la rotta si
            // dichiara qui, alla radice, perché una feature non importa da
            // un'altra feature.
            path: 'corrispettivi',
            loadChildren: () =>
              import('@features/reports/reports.routes').then((m) => m.corrispettiviRegisterRoutes),
          },
          {
            path: 'register',
            loadChildren: () =>
              import('@features/store-sales/store-sales.routes').then(
                (m) => m.storeSalesRegisterRoutes,
              ),
          },
          {
            path: '',
            loadChildren: () =>
              import('@features/sales-orders/sales-orders.routes').then((m) => m.salesOrdersRoutes),
          },
        ],
      },
      {
        path: 'customers',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/customers/customers.routes').then((m) => m.customersRoutes),
      },
      {
        path: 'reports',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () => import('@features/reports/reports.routes').then((m) => m.reportsRoutes),
      },
      {
        path: 'guide',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () => import('@features/guide/guide.routes').then((m) => m.guideRoutes),
      },
      {
        path: 'settings',
        canActivate: [tenantWorkspaceGuard],
        loadChildren: () =>
          import('@features/settings/settings.routes').then((m) => m.settingsRoutes),
      },
      {
        path: 'admin',
        children: [
          {
            // Variante admin della guida: il componente vive in features/guide,
            // quindi la monta il composition root — admin non può importarlo.
            path: 'guide',
            title: 'Guida tecnica',
            canActivate: [platformAdminGuard],
            loadComponent: () =>
              import('@features/guide/guide.component').then((m) => m.GuideComponent),
            data: { guideVariant: 'admin' },
          },
          {
            path: '',
            loadChildren: () => import('@features/admin/admin.routes').then((m) => m.adminRoutes),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'app/dashboard' },
];
