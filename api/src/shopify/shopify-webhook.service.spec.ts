import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { ShopifyConfigService } from './shopify-config.service';
import { ShopifyWebhookService } from './shopify-webhook.service';

/**
 * Qui restano le sole prove della FIRMA: accoglienza, sincronizzazione spenta, topic
 * non trattato, data dell'ultimo evento e fallimenti sono della coda
 * (`coda-webhook.integration-spec.ts`), dove si misurano su database vero.
 */
describe('ShopifyWebhookService — la firma', () => {
  function createService(apiSecret: string | null = 'test-secret') {
    return new ShopifyWebhookService({ apiSecret } as unknown as ShopifyConfigService);
  }

  it('verifyHmac accetta firma valida', () => {
    const service = createService();
    const rawBody = Buffer.from('{"id":1}');
    const hmac = createHmac('sha256', 'test-secret').update(rawBody).digest('base64');

    expect(() => service.verifyHmac(rawBody, hmac)).not.toThrow();
  });

  it('verifyHmac rifiuta firma non valida, assente, o senza segreto configurato', () => {
    const rawBody = Buffer.from('{"id":1}');
    const hmac = createHmac('sha256', 'test-secret').update(rawBody).digest('base64');

    expect(() => createService().verifyHmac(rawBody, 'invalid')).toThrow(UnauthorizedException);
    expect(() => createService().verifyHmac(rawBody, undefined)).toThrow(UnauthorizedException);
    expect(() => createService(null).verifyHmac(rawBody, hmac)).toThrow(
      UnauthorizedException,
    );
  });
});
