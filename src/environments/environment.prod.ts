import type { AppConfig } from '@core/config/app-config.model';

/**
 * Build di produzione (`ng build`, usato da Firebase App Hosting).
 * Solo valori pubblici (regole-sicurezza). I segreti vivono in api/ su Railway.
 *
 * Per cambiare API URL / Supabase senza toccare questo file:
 * `npm run build:firebase` con variabili VESTIFLOW_* (vedi scripts/generate-environment-prod.mjs).
 */
export const environment: AppConfig = {
  production: true,
  appName: 'VestiFlow',
  apiBaseUrl: 'https://vestiflow-production.up.railway.app/api/v1',
  supabase: {
    url: 'https://upuypsqavodytixhlwvz.supabase.co',
    anonKey: 'sb_publishable_mUCWHpkkrwRLllUQt8YGCg_-x048Dsi',
  },
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
