import type { AppConfig } from '@core/config/app-config.model';

// Valori di sviluppo. SOLO valori pubblici (regole-sicurezza).
// La build di produzione li sostituira' via fileReplacements (step successivo).
export const environment: AppConfig = {
  production: false,
  appName: 'VestiFlow',
  apiBaseUrl: 'http://localhost:3000/api',
  features: {
    barcodeScanner: true,
    shopify: false,
  },
};
