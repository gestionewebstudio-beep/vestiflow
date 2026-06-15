import type { AppConfig } from '@core/config/app-config.model';

/**
 * Build di produzione. Valori pubblici: in CI sostituisci con env del provider
 * (fileReplacements o script di build). Nessun segreto qui.
 */
export const environment: AppConfig = {
  production: true,
  appName: 'VestiFlow',
  apiBaseUrl: '/api/v1',
  supabase: {
    url: 'https://<project-ref>.supabase.co',
    anonKey: '',
  },
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
