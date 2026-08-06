import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  shopifyCustomersReadScopeError,
} from './shopify-scopes.util';
import { ShopifySyncService } from './shopify-sync.service';

export interface ShopifyCustomersPullResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteCustomerCount: number;
  readonly failed: readonly { readonly shopifyCustomerId: string; readonly message: string }[];
}

@Injectable()
export class ShopifyCustomersPullService {
  private readonly logger = new Logger(ShopifyCustomersPullService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifySync: ShopifySyncService,
  ) {}

  async pullCustomers(tenantId: string): Promise<ShopifyCustomersPullResult> {
    const connection = await this.shopifyConnection.getForTenant(tenantId);
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeError = shopifyCustomersReadScopeError(effectiveScopes);
    if (scopeError) {
      buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, effectiveScopes);
      throw new UnprocessableEntityException(scopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteCustomers;
    try {
      remoteCustomers = await this.shopifyAdmin.listAllCustomers(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyCustomerId: string; message: string }[] = [];

    for (const remoteCustomer of remoteCustomers) {
      const shopifyCustomerId = String(remoteCustomer['id'] ?? 'unknown');
      try {
        const outcome = await this.shopifySync.applyCustomerFromShopify(tenantId, remoteCustomer);
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
          shopifyCustomerId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    }

    await this.shopifyConnection.touchSync(tenantId);

    this.logger.log(
      `Import clienti Shopify (${tenantId}): +${imported} ~${updated} skip=${skipped} remote=${remoteCustomers.length} failed=${failed.length}`,
    );

    return {
      imported,
      updated,
      skipped,
      remoteCustomerCount: remoteCustomers.length,
      failed,
    };
  }
}
