import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ShopifySyncStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifySyncService } from './shopify-sync.service';
import { isExpectedShopifyWebhookTopic } from './shopify-webhook-topics';

@Injectable()
export class ShopifyWebhookService {
  private readonly logger = new Logger(ShopifyWebhookService.name);

  constructor(
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifySync: ShopifySyncService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly prisma: PrismaService,
  ) {}

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

  async process(shopDomain: string, topic: string, payload: unknown): Promise<void> {
    const tenantId = await this.shopifyOAuth.resolveTenantByShopDomain(shopDomain);
    const data = payload as Record<string, unknown>;

    const autoSyncEnabled = await this.shopifyConnection.isAutoSyncEnabled(tenantId);
    if (!autoSyncEnabled) {
      this.logger.debug(
        `Webhook ${topic} ignorato: aggiornamenti automatici disattivati (${tenantId})`,
      );
      return;
    }

    // Timbrato QUI: dopo il cancello sugli aggiornamenti automatici e dopo aver verificato
    // che il topic sia dei nostri — cioe' quando l'evento e' davvero ACCOLTO — e prima di
    // trattarlo, perche' un fallimento nel trattamento non toglie il fatto che sia arrivato.
    //
    // Gli eventi scartati (sincronizzazione spenta, topic fuori dallo switch) NON passano di
    // qui: sono un fatto diverso e avranno una traccia propria, col motivo. Contarli qui
    // farebbe dire «arrivano eventi» a una connessione che li sta buttando tutti.
    if (isExpectedShopifyWebhookTopic(topic)) {
      await this.shopifyConnection.recordWebhookEventReceived(tenantId);
    }

    try {
      await this.shopifySync.handleWebhook(tenantId, topic, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore sync webhook';
      this.logger.error(`Webhook ${topic} fallito per tenant ${tenantId}: ${message}`);

      if (topic.startsWith('products/')) {
        await this.recordProductWebhookFailure(tenantId, data, message);
      } else {
        await this.shopifyConnection.recordSetupWarning(tenantId, message, 'webhook_sync_failed');
      }

      throw error;
    }
  }

  private async recordProductWebhookFailure(
    tenantId: string,
    payload: Record<string, unknown>,
    message: string,
  ): Promise<void> {
    const shopifyProductId = payload.id != null ? String(payload.id) : null;
    if (shopifyProductId) {
      await this.prisma.product.updateMany({
        where: { tenantId, shopifyProductId },
        data: {
          shopifySyncStatus: ShopifySyncStatus.error,
          shopifyLastError: message.slice(0, 500),
        },
      });
    }

    await this.shopifyConnection.recordSetupWarning(
      tenantId,
      `Sync prodotto Shopify non riuscito: ${message.slice(0, 200)}`,
      'product_webhook_failed',
    );
  }
}
