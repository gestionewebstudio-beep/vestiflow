import type { AppConfig } from '@core/config/app-config.model';

// Valori di sviluppo. SOLO valori pubblici (regole-sicurezza).
// La build di produzione li sostituira' via fileReplacements (step successivo).
export const environment: AppConfig = {
  production: false,
  appName: 'VestiFlow',
  apiBaseUrl: 'http://localhost:3000/api/v1',
  // Anon/public key: Supabase → Project Settings → API Keys → publishable/anon.
  supabase: {
    url: 'https://upuypsqavodytixhlwvz.supabase.co',
    anonKey: 'sb_publishable_mUCWHpkkrwRLllUQt8YGCg_-x048Dsi',
  },
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
