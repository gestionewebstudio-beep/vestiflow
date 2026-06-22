import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  shopifyOrdersReadScopeError,
} from './shopify-scopes.util';
import { ShopifySyncService } from './shopify-sync.service';

export interface ShopifyOrdersPullResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteOrderCount: number;
  readonly failed: readonly { readonly shopifyOrderId: string; readonly message: string }[];
}

@Injectable()
export class ShopifyOrdersPullService {
  private readonly logger = new Logger(ShopifyOrdersPullService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifySync: ShopifySyncService,
  ) {}

  async pullOrders(tenantId: string): Promise<ShopifyOrdersPullResult> {
    const connection = await this.shopifyConnection.getForTenant(tenantId);
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeError = shopifyOrdersReadScopeError(effectiveScopes);
    if (scopeError) {
      buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, effectiveScopes);
      throw new UnprocessableEntityException(scopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteOrders;
    try {
      remoteOrders = await this.shopifyAdmin.listAllOrders(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyOrderId: string; message: string }[] = [];

    for (const remoteOrder of remoteOrders) {
      const shopifyOrderId = String(remoteOrder['id'] ?? 'unknown');
      try {
        const outcome = await this.shopifySync.applyOrderFromShopify(tenantId, remoteOrder);
        switch (outcome) {
          case 'created':
            imported += 1;
            break;
          case 'updated':
            updated += 1;
            break;
          case 'skipped':
            skipped += 1;
            break;
        }
      } catch (error) {
        failed.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    }

    await this.shopifyConnection.touchSync(tenantId);

    this.logger.log(
      `Import ordini Shopify (${tenantId}): +${imported} ~${updated} skip=${skipped} remote=${remoteOrders.length} failed=${failed.length}`,
    );

    return {
      imported,
      updated,
      skipped,
      remoteOrderCount: remoteOrders.length,
      failed,
    };
  }
}
