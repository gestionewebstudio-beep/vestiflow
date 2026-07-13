import { Injectable, Logger } from '@nestjs/common';

import { ShopifyInventoryPushService } from '../shopify/shopify-inventory-push.service';
import { ShopifyProductPushService } from '../shopify/shopify-product-push.service';
import { TikTokInventoryPushService } from '../tiktok/tiktok-inventory-push.service';
import { TikTokProductPushService } from '../tiktok/tiktok-product-push.service';

/**
 * Orchestrazione push verso canali di vendita collegati.
 * Ogni canale è best-effort e indipendente: un fallimento TikTok non blocca Shopify.
 * L'inventario viene pubblicato post-commit in modo asincrono (§5 eventi VestiFlow).
 */
@Injectable()
export class ChannelSyncFacade {
  private readonly logger = new Logger(ChannelSyncFacade.name);

  constructor(
    private readonly shopifyInventoryPush: ShopifyInventoryPushService,
    private readonly shopifyProductPush: ShopifyProductPushService,
    private readonly tiktokInventoryPush: TikTokInventoryPushService,
    private readonly tiktokProductPush: TikTokProductPushService,
  ) {}

  enqueueProductPush(tenantId: string, productId: string): void {
    void this.shopifyProductPush.enqueuePush(tenantId, productId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push prodotto Shopify fallito';
      this.logger.warn(`Push prodotto Shopify non riuscito (${tenantId}): ${message}`);
    });
    void this.tiktokProductPush.enqueuePush(tenantId, productId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push prodotto TikTok fallito';
      this.logger.warn(`Push prodotto TikTok non riuscito (${tenantId}): ${message}`);
    });
  }

  /** Post-commit: pubblica inventario senza bloccare la transazione locale. */
  enqueueInventoryPush(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): void {
    void this.pushInventoryLevels(tenantId, variantId, locationIds).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
      this.logger.warn(`Push inventario canali non riuscito (${tenantId}): ${message}`);
    });
  }

  async pushInventoryLevels(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    try {
      await this.shopifyInventoryPush.pushLevels(tenantId, variantId, locationIds);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push inventario Shopify fallito';
      this.logger.warn(`Push inventario Shopify non riuscito (${tenantId}): ${message}`);
    }

    try {
      await this.tiktokInventoryPush.pushVariantStock(tenantId, variantId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push inventario TikTok fallito';
      this.logger.warn(`Push inventario TikTok non riuscito (${tenantId}): ${message}`);
    }
  }
}
