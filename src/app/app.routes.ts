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
        path: 'settings',
        loadChildren: () =>
          import('@features/settings/settings.routes').then((m) => m.settingsRoutes),
      },
    ],
  },
  { path: '**', redirectTo: 'app/dashboard' },
];
