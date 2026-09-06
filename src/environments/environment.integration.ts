import type { AppConfig } from '@core/config/app-config.model';

// Il server del collaudo usa solo una porta effimera su loopback.
if (
  !['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  window.location.port === '4200'
) {
  throw new Error('La configurazione di integrazione richiede il server locale isolato.');
}

export const environment: AppConfig = {
  production: false,
  appName: 'VestiFlow',
  apiBaseUrl: `${window.location.origin}/api/v1`,
  // SDK e gateway ordinari, con emittente locale di prova. Nessuna credenziale DEV.
  supabase: { url: window.location.origin, anonKey: 'public-integration-test-key' },
  features: { barcodeScanner: true, shopify: true },
};
