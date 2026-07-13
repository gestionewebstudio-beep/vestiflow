import { Injectable, Logger } from '@nestjs/common';
import { ShopifyConnectionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';
import { SHOPIFY_WRITE_INVENTORY_SCOPE, shopifyHasScope } from './shopify-scopes.util';

export type ShopifyInventoryPushSkipReason =
  | 'not_connected'
  | 'missing_write_inventory_scope'
  | 'variant_not_linked'
  | 'location_not_linked'
  | 'level_not_found'
  | 'unchanged';

export interface ShopifyInventoryPushResult {
  readonly pushed: boolean;
  readonly reason?: ShopifyInventoryPushSkipReason | 'shopify_error';
  readonly publishableAvailable?: number;
}

/**
 * Push inventario VestiFlow → Shopify (post-commit, best-effort).
 *
 * Pubblica `shopifyPublishableAvailable = max(0, onHand - committed - safetyStock)`
 * sul campo REST `available` (NON `on_hand`). Registra fingerprint per anti-loop.
 */
@Injectable()
export class ShopifyInventoryPushService {
  private readonly logger = new Logger(ShopifyInventoryPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly reconciliation: ShopifyInventoryReconciliationService,
  ) {}

  async pushLevel(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { pushed: false, reason: 'not_connected' };
    }

    if (!shopifyHasScope(connection.scopes, SHOPIFY_WRITE_INVENTORY_SCOPE)) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): scope ${SHOPIFY_WRITE_INVENTORY_SCOPE} assente`,
      );
      return { pushed: false, reason: 'missing_write_inventory_scope' };
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, tenantId },
      select: {
        id: true,
        sku: true,
        shopifyInventoryItemId: true,
        shopifyVariantId: true,
      },
    });
    if (!variant) {
      return { pushed: false, reason: 'variant_not_linked' };
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { shopifyLocationId: true, name: true },
    });
    if (!location?.shopifyLocationId) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): location ${locationId} senza shopifyLocationId`,
      );
      return { pushed: false, reason: 'location_not_linked' };
    }

    const level = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      select: { onHand: true, committed: true },
    });
    if (!level) {
      return { pushed: false, reason: 'level_not_found' };
    }

    const publishable = computeShopifyPublishableAvailable(level.onHand, level.committed, 0);

    const syncState = await this.prisma.shopifyInventorySyncState.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId, locationId },
      },
      select: { lastPushedAvailable: true },
    });
    if (syncState?.lastPushedAvailable === publishable) {
      return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
    }

    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      const inventoryItemId = await this.resolveInventoryItemId(variant, shopDomain, accessToken);
      if (!inventoryItemId) {
        this.logger.debug(
          `Push inventario saltato (${tenantId}): variante ${variant.sku} non collegata a Shopify`,
        );
        return { pushed: false, reason: 'variant_not_linked' };
      }

      await this.shopifyAdmin.setInventoryAvailable(
        shopDomain,
        accessToken,
        inventoryItemId,
        location.shopifyLocationId,
        publishable,
      );

      await this.reconciliation.recordSuccessfulPush(
        tenantId,
        variantId,
        locationId,
        publishable,
      );
      await this.shopifyConnection.touchSync(tenantId);
      this.logger.log(
        `Inventario Shopify aggiornato (${tenantId}): SKU ${variant.sku} @ ${location.name} → ${publishable} ` +
          `(Giacenza ${level.onHand}, Impegnata ${level.committed})`,
      );
      return { pushed: true, publishableAvailable: publishable };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push inventario Shopify';
      this.logger.warn(`Push inventario Shopify fallito (${tenantId}): ${message}`);
      return { pushed: false, reason: 'shopify_error' };
    }
  }

  async pushLevels(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    const uniqueLocationIds = [...new Set(locationIds)];
    for (const locationId of uniqueLocationIds) {
      await this.pushLevel(tenantId, variantId, locationId);
    }
  }

  private async resolveInventoryItemId(
    variant: {
      readonly id: string;
      readonly shopifyInventoryItemId: string | null;
      readonly shopifyVariantId: string | null;
    },
    shopDomain: string,
    accessToken: string,
  ): Promise<string | null> {
    if (variant.shopifyInventoryItemId) {
      return variant.shopifyInventoryItemId;
    }
    if (!variant.shopifyVariantId) {
      return null;
    }

    const shopifyVariant = await this.shopifyAdmin.getVariant(
      shopDomain,
      accessToken,
      variant.shopifyVariantId,
    );
    const inventoryItemId = String(shopifyVariant.inventory_item_id);

    await this.prisma.productVariant.update({
      where: { id: variant.id },
      data: { shopifyInventoryItemId: inventoryItemId },
    });

    return inventoryItemId;
  }
}
