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
      controller.handle(
        { rawBody: undefined } as never,
        'hmac',
        'products/update',
        'shop.myshopify.com',
      ),
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

  /**
   * ⛔ RIPRODUZIONE (`it.fails`, docs/30 #1): la stessa consegna arriva due volte con lo
   *    stesso `X-Shopify-Webhook-Id` (shopify.dev: «your app might receive the same webhook
   *    more than once … use the X-Shopify-Webhook-Id header to detect and skip duplicates»).
   *    Il controller non legge quell'intestazione e la seconda consegna viene elaborata
   *    di nuovo. Desiderato: elaborata una volta, `200` a entrambe.
   */
  it.fails(
    'RIPRODUZIONE: due consegne con lo stesso X-Shopify-Webhook-Id → UNA elaborazione',
    async () => {
      const rawBody = Buffer.from(JSON.stringify({ id: 777 }));
      shopifyWebhooks.process.mockClear();
      shopifyWebhooks.process.mockResolvedValue(undefined);
      const richiesta = {
        rawBody,
        headers: { 'x-shopify-webhook-id': 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043' },
      };

      await controller.handle(richiesta as never, 'hmac', 'orders/create', 'shop.myshopify.com');
      await controller.handle(richiesta as never, 'hmac', 'orders/create', 'shop.myshopify.com');

      expect(shopifyWebhooks.process).toHaveBeenCalledTimes(1);
    },
  );

  /**
   * ⛔ RIPRODUZIONE (`it.fails`, docs/30 #1): la risposta parte solo DOPO l'elaborazione.
   *    Shopify concede 5 s all'intera richiesta e ritenta (8 volte in 4 h), poi cancella
   *    la sottoscrizione. Desiderato: `200` appena la consegna è al sicuro, elaborazione
   *    dopo. Qui l'elaborazione è tenuta ferma: la risposta non deve dipendere da lei.
   */
  it.fails('RIPRODUZIONE: il 200 arriva anche se l’elaborazione non è ancora finita', async () => {
    const rawBody = Buffer.from(JSON.stringify({ id: 778 }));
    let sblocca: () => void = () => undefined;
    shopifyWebhooks.process.mockClear();
    shopifyWebhooks.process.mockImplementation(
      () => new Promise<void>((resolve) => (sblocca = resolve)),
    );

    const risposta = controller.handle(
      { rawBody } as never,
      'hmac',
      'orders/create',
      'shop.myshopify.com',
    );
    const esito = await Promise.race([
      risposta.then(() => 'risposto'),
      new Promise<string>((resolve) => setTimeout(() => resolve('ancora in attesa'), 50)),
    ]);
    sblocca();

    expect(esito).toBe('risposto');
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
