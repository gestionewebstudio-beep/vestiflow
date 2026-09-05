import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4310';
const address = new URL(baseURL);
if (
  !['localhost', '127.0.0.1'].includes(address.hostname) ||
  !address.port ||
  address.port === '4200'
) {
  throw new Error('La prova Cassa richiede una porta locale esplicita diversa da 4200.');
}

/** Solo frontend E2E, nessun avvio API, nessun riuso di servizi del proprietario. */
export default defineConfig({
  testDir: '.',
  testMatch: /(virtual-spike|cassa-performance|cassa-mobile|cassa|filtri-colonna)\.spec\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: '../test-results/cassa-isolated',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report/cassa-isolated', open: 'never' }],
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
