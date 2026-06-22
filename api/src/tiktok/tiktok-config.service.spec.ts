import { describe, expect, it } from 'vitest';

import { TikTokConfigService } from './tiktok-config.service';

describe('TikTokConfigService', () => {
  function createService(values: Record<string, string | undefined>) {
    return new TikTokConfigService({
      get: (key: string) => values[key],
    } as never);
  }

  it('isOAuthConfigured richiede credenziali e callback', () => {
    const configured = createService({
      TIKTOK_APP_KEY: 'key',
      TIKTOK_APP_SECRET: 'secret',
      TIKTOK_SERVICE_ID: 'svc',
      TIKTOK_OAUTH_CALLBACK_URL: 'https://api.test/callback',
      TIKTOK_TOKEN_ENCRYPTION_KEY: 'enc',
    });
    const incomplete = createService({ TIKTOK_APP_KEY: 'key' });

    expect(configured.isOAuthConfigured()).toBe(true);
    expect(incomplete.isOAuthConfigured()).toBe(false);
  });

  it('espone URL API e callback derivati', () => {
    const service = createService({
      TIKTOK_APP_URL: 'https://api.test/',
      FRONTEND_URL: 'https://app.test',
    });

    expect(service.apiBaseUrl).toBe('https://open-api.tiktokglobalshop.com');
    expect(service.callbackUrl).toBe('https://api.test/api/v1/tiktok/auth/callback');
    expect(service.frontendUrl).toBe('https://app.test');
    expect(service.apiVersion).toBe('202309');
  });
});
