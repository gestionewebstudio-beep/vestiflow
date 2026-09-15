import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ShopifyConfigService } from './shopify-config.service';

/**
 * La VERIFICA della firma di una consegna webhook. Il resto — accoglienza durevole,
 * elaborazione fuori dalla richiesta, ritentativi, esiti per l'operatore — è della
 * coda (`ShopifyWebhookCodaService`, docs/30 §7.1.2). Qui non si legge il payload:
 * prima di fidarsi dei dati si controlla la firma, e il segreto non finisce mai nei log.
 */
@Injectable()
export class ShopifyWebhookService {
  constructor(private readonly shopifyConfig: ShopifyConfigService) {}

  verifyHmac(rawBody: Buffer, hmacHeader: string | undefined): void {
    const secret = this.shopifyConfig.apiSecret;
    if (!secret || !hmacHeader) {
      throw new UnauthorizedException('Webhook Shopify non verificabile');
    }

    const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
    const expected = Buffer.from(digest);
    const received = Buffer.from(hmacHeader);

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Firma webhook Shopify non valida');
    }
  }
}
