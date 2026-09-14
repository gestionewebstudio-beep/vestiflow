import { defineConfig } from 'vitest/config';

import integration from './vitest.integration.config';

/**
 * Il collaudo a DUE FASI della migration `20260828210000_stati_commerciali_ordini`
 * (`stati-ordini-backfill`): si esegue a mano, prima e dopo `prisma:deploy:test`.
 *
 * ⛔ Il file è escluso PER NOME dalla configurazione di integrazione, e `--exclude` da
 *    riga di comando AGGIUNGE esclusioni, non le toglie: `npm run test:migration` non
 *    trovava più nessun file («No test files found», misurato il 14/09/2026). Come per
 *    `cassa-migrations`, la configurazione dedicata dichiara l'unico file che include.
 */
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: ['src/test/integration/stati-ordini-backfill.integration-spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
