import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  shopifyInventoryReadScopeError,
} from './shopify-scopes.util';
import { ShopifySyncService } from './shopify-sync.service';

const INVENTORY_ITEM_ID_BATCH_SIZE = 50;
const IMPORT_REASON = 'Import giacenze Shopify';

export interface ShopifyInventoryPullResult {
  readonly imported: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly linkedVariantCount: number;
  readonly linkedLocationCount: number;
  readonly remoteLevelCount: number;
}

@Injectable()
export class ShopifyInventoryPullService {
  private readonly logger = new Logger(ShopifyInventoryPullService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifySync: ShopifySyncService,
  ) {}

  async pullInventory(tenantId: string): Promise<ShopifyInventoryPullResult> {
    const connection = await this.shopifyConnection.getForTenant(tenantId);
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeError = shopifyInventoryReadScopeError(effectiveScopes);
    if (scopeError) {
      buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, effectiveScopes);
      throw new UnprocessableEntityException(scopeError);
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId, shopifyInventoryItemId: { not: null } },
      select: { shopifyInventoryItemId: true },
    });
    const locations = await this.prisma.location.findMany({
      where: { tenantId, shopifyLocationId: { not: null } },
      select: { shopifyLocationId: true },
    });

    const inventoryItemIds = variants
      .map((variant) => variant.shopifyInventoryItemId)
      .filter((id): id is string => Boolean(id));
    const shopifyLocationIds = locations
      .map((location) => location.shopifyLocationId)
      .filter((id): id is string => Boolean(id));

    if (inventoryItemIds.length === 0) {
      throw new UnprocessableEntityException(
        'Nessuna variante collegata a Shopify. Importa prima il catalogo da Prodotti.',
      );
    }

    if (shopifyLocationIds.length === 0) {
      throw new UnprocessableEntityException(
        'Nessuna location collegata a Shopify. Sincronizza le location da Impostazioni.',
      );
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);

    let imported = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let remoteLevelCount = 0;

    for (const shopifyLocationId of shopifyLocationIds) {
      for (
        let offset = 0;
        offset < inventoryItemIds.length;
        offset += INVENTORY_ITEM_ID_BATCH_SIZE
      ) {
        const batch = inventoryItemIds.slice(offset, offset + INVENTORY_ITEM_ID_BATCH_SIZE);
        let remoteLevels;
        try {
          remoteLevels = await this.shopifyAdmin.listInventoryLevels(
            shopDomain,
            accessToken,
            shopifyLocationId,
            batch,
          );
        } catch (error: unknown) {
          await this.shopifyConnection.recordApiFailure(tenantId, error);
          throw error;
        }
        remoteLevelCount += remoteLevels.length;

        for (const remoteLevel of remoteLevels) {
          const outcome = await this.shopifySync.applyInventoryLevelFromShopify(
            tenantId,
            String(remoteLevel.inventory_item_id),
            String(remoteLevel.location_id),
            Number(remoteLevel.available ?? 0),
            IMPORT_REASON,
          );

          switch (outcome) {
            case 'created':
              imported += 1;
              break;
            case 'updated':
              updated += 1;
              break;
            case 'unchanged':
              unchanged += 1;
              break;
            case 'skipped':
              skipped += 1;
              break;
          }
        }
      }
    }

    await this.shopifyConnection.touchSync(tenantId);

    this.logger.log(
      `Import giacenze Shopify (${tenantId}): +${imported} ~${updated} =${unchanged} skip=${skipped} remote=${remoteLevelCount}`,
    );

    return {
      imported,
      updated,
      unchanged,
      skipped,
      linkedVariantCount: inventoryItemIds.length,
      linkedLocationCount: shopifyLocationIds.length,
      remoteLevelCount,
    };
  }
}
