import type { AppConfig } from '@core/config/app-config.model';

/**
 * Configurazione E2E CI: auth mock (nessuna anon key Supabase).
 * L'API puo' rispondere 401 sulle chiamate autenticate; i test CI verificano
 * shell, routing e wizard senza dipendere da credenziali reali.
 */
export const environment: AppConfig = {
  production: false,
  appName: 'VestiFlow',
  apiBaseUrl: 'http://localhost:3000/api/v1',
  supabase: undefined,
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
