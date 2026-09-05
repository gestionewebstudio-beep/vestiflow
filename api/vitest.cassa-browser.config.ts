import { defineConfig } from 'vitest/config';

import integration from './vitest.integration.config';

/** Richiede build frontend integration e Chromium; nessun fallback ai mock finanziari. */
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: ['src/test/integration/cassa-browser.integration-spec.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 180_000,
  },
});
