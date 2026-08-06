import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ShopifyCryptoService } from './shopify-crypto.service';

describe('ShopifyCryptoService', () => {
  function createService(key?: string) {
    return new ShopifyCryptoService({
      get: (name: string) => (name === 'SHOPIFY_TOKEN_ENCRYPTION_KEY' ? key : undefined),
    } as never);
  }

  it('isConfigured false senza chiave', () => {
    expect(createService().isConfigured()).toBe(false);
  });

  it('isConfigured true con chiave', () => {
    expect(createService('test-encryption-key-32-chars!!').isConfigured()).toBe(true);
  });

  it('encrypt/decrypt round-trip', () => {
    const service = createService('test-encryption-key-32-chars!!');
    const encrypted = service.encrypt('shpat_test_token');

    expect(encrypted.split(':')).toHaveLength(3);
    expect(service.decrypt(encrypted)).toBe('shpat_test_token');
  });

  it('encrypt fallisce se non configurato', () => {
    const service = createService();

    expect(() => service.encrypt('token')).toThrow(ServiceUnavailableException);
  });

  it('decrypt rifiuta payload malformato', () => {
    const service = createService('test-encryption-key-32-chars!!');

    expect(() => service.decrypt('bad-payload')).toThrow(ServiceUnavailableException);
  });
});
