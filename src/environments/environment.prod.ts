import type { AppConfig } from '@core/config/app-config.model';

/**
 * Build di produzione (default `ng build`).
 * Per Firebase App Hosting usa `scripts/generate-environment-prod.mjs` via apphosting.yaml.
 *
 * IMPORTANTE: aggiorna `apiBaseUrl` con l'URL pubblico del backend (Railway, ecc.)
 * prima del deploy manuale, oppure imposta le env in Firebase App Hosting.
 */
export const environment: AppConfig = {
  production: true,
  appName: 'VestiFlow',
  // Sostituisci con l'URL Railway della API NestJS (HTTPS + /api/v1).
  apiBaseUrl: 'https://YOUR-RAILWAY-API.up.railway.app/api/v1',
  supabase: {
    url: 'https://upuypsqavodytixhlwvz.supabase.co',
    anonKey: 'sb_publishable_mUCWHpkkrwRLllUQt8YGCg_-x048Dsi',
  },
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
