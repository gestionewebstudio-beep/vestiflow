import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hasE2eCredentials } from './e2e/helpers/env';

loadEnvFile(resolve(__dirname, '.env'));

const authFile = 'e2e/.auth/user.json';
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';

const authenticatedProjects = hasE2eCredentials()
  ? [
      {
        name: 'setup',
        testMatch: /auth\.setup\.ts/,
      },
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          storageState: authFile,
        },
        dependencies: ['setup'],
        testIgnore: [/\.guest\.spec\.ts$/, /auth\.setup\.ts/, /mobile-p0\.spec\.ts$/],
      },
      {
        name: 'mobile-chrome',
        use: {
          ...devices['Pixel 5'],
          storageState: authFile,
        },
        dependencies: ['setup'],
        testMatch: /mobile-p0\.spec\.ts$/,
      },
    ]
  : [];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    ...authenticatedProjects,
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.guest\.spec\.ts$/,
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run start:api',
          url: `${apiURL}/api/v1/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          cwd: '.',
        },
        {
          command: 'npm run start -- --host 127.0.0.1 --port 4200',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          cwd: '.',
        },
      ],
});

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
