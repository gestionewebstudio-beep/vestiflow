import type { AppConfig } from '@core/config/app-config.model';

// ⭐ Il frontend del COLLAUDO REALE Shopify (`docs/28`): stessi valori PUBBLICI
//    dell'ambiente di sviluppo (autenticazione sullo stesso progetto Supabase),
//    ma l'API è la SECONDA istanza sulla 3100 — quella che legge
//    `api/.env.collaudo.local` e scrive su `vestiflow_collaudo`, non l'API di
//    sviluppo sulla 3000 che scrive sul condiviso.
//    Si serve con `npm run start:collaudo` (porta 4212). Nessun segreto.
export const environment: AppConfig = {
  production: false,
  appName: 'VestiFlow (collaudo)',
  apiBaseUrl: 'http://localhost:3100/api/v1',
  supabase: {
    url: 'https://upuypsqavodytixhlwvz.supabase.co',
    anonKey: 'sb_publishable_mUCWHpkkrwRLllUQt8YGCg_-x048Dsi',
  },
  features: {
    barcodeScanner: true,
    shopify: true,
  },
};
