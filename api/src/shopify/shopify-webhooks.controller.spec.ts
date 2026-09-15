import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShopifyWebhookCodaService } from './shopify-webhook-coda.service';
import type { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';

/**
 * Il controller da solo, con la coda finta: l'ORDINE dei controlli e il contratto
 * verso la coda. Che il `200` arrivi solo dopo il commit e che due consegne uguali
 * producano una elaborazione si misura su database vero in
 * `coda-webhook.integration-spec.ts` (le due `it.fails` di prima sono lì, ordinarie).
 */
describe('ShopifyWebhooksController', () => {
  const shopifyWebhooks = { verifyHmac: vi.fn() };
  const coda = { accogli: vi.fn(), sveglia: vi.fn() };
  const controller = new ShopifyWebhooksController(
    shopifyWebhooks as unknown as ShopifyWebhookService,
    coda as unknown as ShopifyWebhookCodaService,
  );
  const ID = 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043';

  beforeEach(() => {
    vi.clearAllMocks();
    coda.accogli.mockResolvedValue({ ricevutaId: 'r-1', tenantId: 't-1', doppione: false });
  });

  it('rifiuta webhook senza raw body, prima di qualunque altra cosa', async () => {
    await expect(
      controller.handle(
        { rawBody: undefined } as never,
        'hmac',
        'products/update',
        'shop.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(shopifyWebhooks.verifyHmac).not.toHaveBeenCalled();
  });

  it('la FIRMA si verifica prima di leggere intestazioni e corpo: con firma invalida niente ricevuta', async () => {
    shopifyWebhooks.verifyHmac.mockImplementationOnce(() => {
      throw new Error('firma');
    });
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{ non json') } as never,
        'hmac',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow('firma');
    expect(coda.accogli).not.toHaveBeenCalled();
  });

  it('rifiuta header topic o shop mancanti', async () => {
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{}') } as never,
        'hmac',
        undefined,
        'shop.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coda.accogli).not.toHaveBeenCalled();
  });

  it('⛔ senza X-Shopify-Webhook-Id → 400: senza identificativo non c è deduplica (D5)', async () => {
    for (const id of [undefined, '', '   ']) {
      await expect(
        controller.handle(
          { rawBody: Buffer.from('{"id":1}') } as never,
          'hmac',
          'orders/create',
          'shop.myshopify.com',
          id,
          undefined,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(coda.accogli).not.toHaveBeenCalled();
  });

  it('rifiuta payload JSON non valido', async () => {
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{ invalid json') } as never,
        'hmac',
        'products/update',
        'shop.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coda.accogli).not.toHaveBeenCalled();
  });

  it('consegna valida: firma verificata, ricevuta accolta con id, topic, data e versione API, poi la sveglia', async () => {
    const rawBody = Buffer.from(JSON.stringify({ id: 123 }));

    await expect(
      controller.handle(
        { rawBody } as never,
        'valid-hmac',
        'products/update',
        'shop.myshopify.com',
        ID,
        '2026-09-15T18:00:00Z',
        '2026-07',
      ),
    ).resolves.toEqual({ ok: true });

    expect(shopifyWebhooks.verifyHmac).toHaveBeenCalledWith(rawBody, 'valid-hmac');
    expect(coda.accogli).toHaveBeenCalledWith({
      shopDomain: 'shop.myshopify.com',
      webhookId: ID,
      topic: 'products/update',
      payload: { id: 123 },
      triggeredAt: new Date('2026-09-15T18:00:00Z'),
      apiVersion: '2026-07',
    });
    expect(coda.sveglia).toHaveBeenCalledWith('t-1');
  });

  it('una data di innesco non leggibile non ferma la consegna: arriva come assente', async () => {
    await controller.handle(
      { rawBody: Buffer.from('{"id":1}') } as never,
      'hmac',
      'orders/create',
      'shop.myshopify.com',
      ID,
      'non-una-data',
      undefined,
    );
    expect(coda.accogli).toHaveBeenCalledWith(expect.objectContaining({ triggeredAt: null }));
  });

  it('un doppione riceve 200 senza una seconda sveglia: la ricevuta era già durevole', async () => {
    coda.accogli.mockResolvedValueOnce({ ricevutaId: 'r-1', tenantId: 't-1', doppione: true });
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{"id":1}') } as never,
        'hmac',
        'orders/create',
        'shop.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).resolves.toEqual({ ok: true });
    expect(coda.sveglia).not.toHaveBeenCalled();
  });

  it('⛔ se la ricevuta non si salva NIENTE 200: l eccezione risale e Shopify ritenta lui', async () => {
    coda.accogli.mockRejectedValueOnce(new Error('database irraggiungibile'));
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{"id":1}') } as never,
        'hmac',
        'orders/create',
        'shop.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).rejects.toThrow('database irraggiungibile');
    expect(coda.sveglia).not.toHaveBeenCalled();
  });

  it('negozio sconosciuto: il rifiuto di sempre (D6), nessuna ricevuta e nessun 200', async () => {
    coda.accogli.mockRejectedValueOnce(new NotFoundException('Tenant non trovato'));
    await expect(
      controller.handle(
        { rawBody: Buffer.from('{"id":1}') } as never,
        'hmac',
        'orders/create',
        'ignoto.myshopify.com',
        ID,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
