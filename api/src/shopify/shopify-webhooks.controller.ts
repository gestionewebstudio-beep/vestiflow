import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { ShopifyWebhookService } from './shopify-webhook.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// I webhook Shopify arrivano in burst (bulk sync) e sono gia' autenticati via HMAC:
// niente rate limit qui per non perdere eventi legittimi.
@SkipThrottle()
@Controller('shopify/webhooks')
export class ShopifyWebhooksController {
  constructor(private readonly shopifyWebhooks: ShopifyWebhookService) {}

  @Public()
  @Post()
  async handle(
    @Req() request: RawBodyRequest,
    @Headers('x-shopify-hmac-sha256') hmac: string | undefined,
    @Headers('x-shopify-topic') topic: string | undefined,
    @Headers('x-shopify-shop-domain') shopDomain: string | undefined,
  ): Promise<{ ok: true }> {
    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body mancante per la verifica webhook');
    }
    if (!topic || !shopDomain) {
      throw new BadRequestException('Header webhook Shopify mancanti');
    }

    this.shopifyWebhooks.verifyHmac(rawBody, hmac);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Payload webhook non valido');
    }

    await this.shopifyWebhooks.process(shopDomain, topic, payload);
    return { ok: true };
  }
}
