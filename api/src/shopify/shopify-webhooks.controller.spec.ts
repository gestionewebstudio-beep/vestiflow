import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';

describe('ShopifyWebhooksController', () => {
  const shopifyWebhooks = {
    verifyHmac: vi.fn(),
    process: vi.fn(),
  };

  const controller = new ShopifyWebhooksController(
    shopifyWebhooks as unknown as ShopifyWebhookService,
  );

  it('rifiuta webhook senza raw body', async () => {
    await expect(
      controller.handle({ rawBody: undefined } as never, 'hmac', 'products/update', 'shop.myshopify.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rifiuta header topic o shop mancanti', async () => {
    const rawBody = Buffer.from('{}');

    await expect(
      controller.handle({ rawBody } as never, 'hmac', undefined, 'shop.myshopify.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('processa webhook valido', async () => {
    const payload = { id: 123 };
    const rawBody = Buffer.from(JSON.stringify(payload));
    shopifyWebhooks.process.mockResolvedValue(undefined);

    await expect(
      controller.handle(
        { rawBody } as never,
        'valid-hmac',
        'products/update',
        'shop.myshopify.com',
      ),
    ).resolves.toEqual({ ok: true });

    expect(shopifyWebhooks.verifyHmac).toHaveBeenCalledWith(rawBody, 'valid-hmac');
    expect(shopifyWebhooks.process).toHaveBeenCalledWith(
      'shop.myshopify.com',
      'products/update',
      payload,
    );
  });

  it('rifiuta payload JSON non valido', async () => {
    const rawBody = Buffer.from('{ invalid json');

    await expect(
      controller.handle(
        { rawBody } as never,
        'valid-hmac',
        'products/update',
        'shop.myshopify.com',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
