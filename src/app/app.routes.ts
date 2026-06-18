import { Routes } from '@angular/router';

import { authGuard, guestGuard } from '@core/auth';

// Routing feature-based con lazy loading. Le route applicative vivono sotto /app,
// protette da authGuard; /login e' riservata ai guest (guestGuard).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  {
    path: 'login',
    title: 'VestiFlow · Accesso',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'login/forgot-password',
    title: 'VestiFlow · Recupero password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'login/reset-password',
    title: 'VestiFlow · Nuova password',
    loadComponent: () =>
      import('@features/auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell-layout.component').then((m) => m.ShellLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { reuse: true },
        loadChildren: () =>
          import('@features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
      },
      {
        path: 'products',
        data: { reuse: true },
        loadChildren: () =>
          import('@features/products/products.routes').then((m) => m.productsRoutes),
      },
      {
        path: 'inventory',
        data: { reuse: true },
        loadChildren: () =>
          import('@features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
      },
      {
        path: 'orders',
        data: { reuse: true },
        loadChildren: () => import('@features/orders/orders.routes').then((m) => m.ordersRoutes),
      },
      {
        path: 'sales',
        loadChildren: () =>
          import('@features/sales-orders/sales-orders.routes').then((m) => m.salesOrdersRoutes),
      },
      {
        path: 'customers',
        loadChildren: () =>
          import('@features/customers/customers.routes').then((m) => m.customersRoutes),
      },
      {
        path: 'reports',
        loadChildren: () => import('@features/reports/reports.routes').then((m) => m.reportsRoutes),
      },
      {
        path: 'guide',
        data: { reuse: true },
        loadChildren: () => import('@features/guide/guide.routes').then((m) => m.guideRoutes),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('@features/settings/settings.routes').then((m) => m.settingsRoutes),
      },
      {
        path: 'admin',
        loadChildren: () => import('@features/admin/admin.routes').then((m) => m.adminRoutes),
      },
    ],
  },
  { path: '**', redirectTo: 'app/dashboard' },
];
