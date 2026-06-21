import { Injectable, Logger } from '@nestjs/common';
import { TikTokConnectionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokOAuthService } from './tiktok-oauth.service';

export type TikTokInventoryPushSkipReason =
  | 'not_connected'
  | 'product_not_linked'
  | 'variant_not_linked'
  | 'missing_sku_ids';

export interface TikTokInventoryPushResult {
  readonly pushed: boolean;
  readonly reason?: TikTokInventoryPushSkipReason | 'tiktok_error';
}

/**
 * Write-through giacenze VestiFlow → TikTok Shop (stock aggregato per variante).
 * TikTok Shop non usa location multiple nel MVP: sommiamo `available` su tutte le location.
 */
@Injectable()
export class TikTokInventoryPushService {
  private readonly logger = new Logger(TikTokInventoryPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly tiktokApi: TikTokApiClient,
    private readonly tiktokConnection: TikTokConnectionService,
  ) {}

  async pushVariantStock(tenantId: string, variantId: string): Promise<TikTokInventoryPushResult> {
    const connection = await this.prisma.tikTokConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });

    if (!connection || connection.status !== TikTokConnectionStatus.connected) {
      return { pushed: false, reason: 'not_connected' };
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, tenantId },
      select: {
        id: true,
        sku: true,
        tiktokSkuId: true,
        product: {
          select: { id: true, tiktokProductId: true },
        },
      },
    });

    if (!variant?.product.tiktokProductId) {
      return { pushed: false, reason: 'product_not_linked' };
    }
    if (!variant.tiktokSkuId) {
      return { pushed: false, reason: 'missing_sku_ids' };
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, variantId },
      select: { available: true },
    });
    const totalAvailable = levels.reduce((sum, level) => sum + level.available, 0);

    try {
      const { accessToken, shopCipher } = await this.tiktokOAuth.getAccessContext(tenantId);
      await this.tiktokApi.updateInventory(accessToken, shopCipher, {
        product_id: variant.product.tiktokProductId,
        skus: [
          {
            id: variant.tiktokSkuId,
            stock_infos: [{ available_stock: Math.max(0, totalAvailable) }],
          },
        ],
      });

      await this.tiktokConnection.touchSync(tenantId);
      this.logger.log(
        `Stock TikTok aggiornato (${tenantId}): SKU ${variant.sku} → ${totalAvailable}`,
      );
      return { pushed: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push stock TikTok';
      this.logger.warn(`Push stock TikTok fallito (${tenantId}): ${message}`);
      return { pushed: false, reason: 'tiktok_error' };
    }
  }
}
