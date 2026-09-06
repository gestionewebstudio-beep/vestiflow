import { defineConfig, devices } from '@playwright/test';

/**
 * ⭐ **Configurazione SEPARATA per la sola misura prestazionale mobile.**
 *
 * ⛔ **Esiste per non mettere `continue-on-error` sul job della Cassa.** La
 * deroga del 06/09/2026 riguarda una singola soglia temporale: separare il
 * file e la configurazione permette di dichiarare non bloccante QUEL passo,
 * lasciando obbligatorio tutto il resto — prove funzionali comprese, e la
 * preparazione dell'ambiente per prima.
 *
 * ⚠️ **Porta diversa da quella della configurazione isolata**: i due passi CI
 * sono sequenziali, ma `reuseExistingServer: false` fallisce se il server
 * precedente non ha ancora liberato la porta. Un numero diverso toglie di mezzo
 * una corsa che non ha niente da insegnare.
 */
const baseURL = process.env['E2E_BASE_URL_PERF'] ?? 'http://127.0.0.1:4311';
const address = new URL(baseURL);
if (
  !['localhost', '127.0.0.1'].includes(address.hostname) ||
  !address.port ||
  address.port === '4200'
) {
  throw new Error('La misura prestazionale richiede una porta locale esplicita diversa da 4200.');
}

export default defineConfig({
  testDir: '.',
  testMatch: /cassa-prestazioni\.spec\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  outputDir: '../test-results/cassa-prestazioni',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report/cassa-prestazioni', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    serviceWorkers: 'block',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: address.origin,
          localStorage: [{ name: 'vestiflow-mock-user-id', value: 'user-owner' }],
        },
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port ${address.port} --configuration e2e --hmr=false`,
    cwd: '..',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
