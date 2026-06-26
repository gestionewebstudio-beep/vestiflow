import { Routes } from '@angular/router';

export const settingsRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Impostazioni',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
];
