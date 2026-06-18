import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ShopifyTaxonomyCategory } from './shopify-graphql.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyOAuthService } from './shopify-oauth.service';

@Injectable()
export class ShopifyTaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
  ) {}

  async listCategories(
    tenantId: string,
    search?: string,
    childrenOf?: string,
  ): Promise<readonly ShopifyTaxonomyCategory[]> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    return this.shopifyGraphql.listTaxonomyCategories(shopDomain, accessToken, {
      search,
      childrenOf,
      first: 50,
    });
  }

  async fetchProductCategory(
    tenantId: string,
    shopifyProductId: string,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    return this.shopifyGraphql.getProductTaxonomyCategory(
      shopDomain,
      accessToken,
      shopifyProductId,
    );
  }

  async pushProductCategory(
    tenantId: string,
    shopifyProductId: string,
    categoryGid: string | null,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    return this.shopifyGraphql.updateProductTaxonomyCategory(
      shopDomain,
      accessToken,
      shopifyProductId,
      categoryGid,
    );
  }

  private async requireConnectedShop(
    tenantId: string,
  ): Promise<{ shopDomain: string; accessToken: string }> {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      throw new UnprocessableEntityException(
        'Connessione Shopify non attiva. Collega lo store da Impostazioni.',
      );
    }

    return this.shopifyOAuth.getAccessToken(tenantId);
  }
}
