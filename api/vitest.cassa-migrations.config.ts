import { defineConfig } from 'vitest/config';

import integration from './vitest.integration.config';

/** Opt-in distruttivo sul solo DB TEST: il normale test:integration non ricrea lo schema. */
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: ['src/test/integration/cassa-migrations.integration-spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
