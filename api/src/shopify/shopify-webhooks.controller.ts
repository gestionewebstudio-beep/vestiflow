import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { ShopifyWebhookCodaService } from './shopify-webhook-coda.service';
import { ShopifyWebhookService } from './shopify-webhook.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * L'ingresso delle notifiche Shopify (docs/30 §7.1.2).
 *
 * ⭐ L'ordine è quello che protegge: FIRMA → intestazioni → JSON → ricevuta DUREVOLE →
 *    `200`. La conferma parte solo dopo il commit della ricevuta; se il salvataggio
 *    fallisce l'eccezione risale e Shopify non riceve `200` (ritenta lui, e alla
 *    riconsegna la chiave unica assorbe il doppione). L'elaborazione avviene fuori dalla
 *    richiesta: la risposta non dipende da lei (era il difetto riprodotto: 5 s concessi,
 *    poi 8 ritentativi e la cancellazione della sottoscrizione).
 *
 * ⛔ Senza `X-Shopify-Webhook-Id` niente idempotenza: `400`, e il rifiuto si vede (D5).
 *    Negozio sconosciuto: il rifiuto di sempre, nessuna ricevuta (D6).
 */
// I webhook Shopify arrivano in burst (bulk sync) e sono gia' autenticati via HMAC:
// niente rate limit qui per non perdere eventi legittimi.
@SkipThrottle()
@Controller('shopify/webhooks')
export class ShopifyWebhooksController {
  constructor(
    private readonly shopifyWebhooks: ShopifyWebhookService,
    private readonly coda: ShopifyWebhookCodaService,
  ) {}

  @Public()
  @Post()
  async handle(
    @Req() request: RawBodyRequest,
    @Headers('x-shopify-hmac-sha256') hmac: string | undefined,
    @Headers('x-shopify-topic') topic: string | undefined,
    @Headers('x-shopify-shop-domain') shopDomain: string | undefined,
    @Headers('x-shopify-webhook-id') webhookId: string | undefined,
    @Headers('x-shopify-triggered-at') triggeredAt: string | undefined,
    @Headers('x-shopify-api-version') apiVersion: string | undefined,
  ): Promise<{ ok: true }> {
    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body mancante per la verifica webhook');
    }

    // Prima di fidarsi di QUALUNQUE dato — intestazioni comprese — la firma.
    this.shopifyWebhooks.verifyHmac(rawBody, hmac);

    if (!topic || !shopDomain) {
      throw new BadRequestException('Header webhook Shopify mancanti');
    }
    const idConsegna = webhookId?.trim();
    if (!idConsegna) {
      throw new BadRequestException(
        'Header X-Shopify-Webhook-Id mancante: senza identificativo la consegna non è deduplicabile.',
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Payload webhook non valido');
    }

    const accolta = await this.coda.accogli({
      shopDomain,
      webhookId: idConsegna,
      topic,
      payload,
      triggeredAt: dataValida(triggeredAt),
      apiVersion: apiVersion?.trim() || null,
    });
    if (!accolta.doppione) {
      this.coda.sveglia(accolta.tenantId);
    }
    return { ok: true };
  }
}

function dataValida(testo: string | undefined): Date | null {
  if (!testo) {
    return null;
  }
  const data = new Date(testo);
  return Number.isNaN(data.getTime()) ? null : data;
}
