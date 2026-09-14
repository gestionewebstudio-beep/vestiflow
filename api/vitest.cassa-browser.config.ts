import { defineConfig } from 'vitest/config';

import integration from './vitest.integration.config';

/**
 * Richiede build frontend integration e Chromium; nessun fallback ai mock finanziari.
 * Ci sta anche la pagina Shopify in un browser vero (`shopify-pagina`): stesso
 * prerequisito, stesso momento della CI (dopo la build, in `test:cassa:real`).
 */
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: [
      'src/test/integration/cassa-browser.integration-spec.ts',
      'src/test/integration/shopify-pagina.integration-spec.ts',
    ],
    exclude: ['**/node_modules/**'],
    testTimeout: 180_000,
  },
});
