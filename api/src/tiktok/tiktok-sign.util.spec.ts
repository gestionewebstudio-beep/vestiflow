import { describe, expect, it } from 'vitest';

import { buildTikTokQuery, signTikTokRequest } from './tiktok-sign.util';

describe('tiktok-sign.util', () => {
  describe('buildTikTokQuery', () => {
    it('include app_key e timestamp', () => {
      expect(buildTikTokQuery('app-key', 1700000000)).toEqual({
        app_key: 'app-key',
        timestamp: '1700000000',
      });
    });

    it('merge parametri extra', () => {
      expect(buildTikTokQuery('app-key', 1700000000, { shop_id: '123' })).toEqual({
        app_key: 'app-key',
        timestamp: '1700000000',
        shop_id: '123',
      });
    });
  });

  describe('signTikTokRequest', () => {
    it('produce firma HMAC-SHA256 deterministica', () => {
      const query = { app_key: 'key', timestamp: '123', sign: 'ignored', access_token: 'ignored' };
      const sign1 = signTikTokRequest('secret', '/api/path', query, '{"a":1}');
      const sign2 = signTikTokRequest('secret', '/api/path', query, '{"a":1}');

      expect(sign1).toMatch(/^[a-f0-9]{64}$/);
      expect(sign1).toBe(sign2);
    });

    it('cambia firma se cambia path o body', () => {
      const query = { app_key: 'key', timestamp: '123' };
      const base = signTikTokRequest('secret', '/api/a', query, '');
      const otherPath = signTikTokRequest('secret', '/api/b', query, '');
      const otherBody = signTikTokRequest('secret', '/api/a', query, '{"x":1}');

      expect(base).not.toBe(otherPath);
      expect(base).not.toBe(otherBody);
    });
  });
});
