/**
 * Genera environment.prod.ts prima della build (Firebase App Hosting / CI).
 * Legge variabili d'ambiente pubbliche — nessun segreto backend.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const apiBaseUrl = process.env.VESTIFLOW_API_BASE_URL?.trim();
const supabaseUrl = process.env.VESTIFLOW_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.VESTIFLOW_SUPABASE_ANON_KEY?.trim();

if (!apiBaseUrl) {
  console.error(
    '[generate-environment-prod] VESTIFLOW_API_BASE_URL mancante (es. https://tua-api.railway.app/api/v1)',
  );
  process.exit(1);
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[generate-environment-prod] VESTIFLOW_SUPABASE_URL e VESTIFLOW_SUPABASE_ANON_KEY sono obbligatori.',
  );
  process.exit(1);
}

const enableShopify = process.env.VESTIFLOW_ENABLE_SHOPIFY !== 'false';
const enableBarcode = process.env.VESTIFLOW_ENABLE_BARCODE_SCANNER !== 'false';

const contents = `import type { AppConfig } from '@core/config/app-config.model';

/** Generato da scripts/generate-environment-prod.mjs — non modificare manualmente. */
export const environment: AppConfig = {
  production: true,
  appName: 'VestiFlow',
  apiBaseUrl: '${apiBaseUrl.replace(/'/g, "\\'")}',
  supabase: {
    url: '${supabaseUrl.replace(/'/g, "\\'")}',
    anonKey: '${supabaseAnonKey.replace(/'/g, "\\'")}',
  },
  features: {
    barcodeScanner: ${enableBarcode},
    shopify: ${enableShopify},
  },
};
`;

writeFileSync(join(root, 'src/environments/environment.prod.ts'), contents, 'utf8');
console.log('[generate-environment-prod] environment.prod.ts aggiornato.');
