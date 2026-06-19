import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type {
  ShopifyTaxonomyCategory,
  ShopifyTaxonomyCategoryAttribute,
} from './shopify-graphql.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';

@Injectable()
export class ShopifyTaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly taxonomyLocalization: ShopifyTaxonomyLocalizationService,
  ) {}

  async listCategories(
    tenantId: string,
    search?: string,
    childrenOf?: string,
  ): Promise<readonly ShopifyTaxonomyCategory[]> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    const categories = await this.shopifyGraphql.listTaxonomyCategories(shopDomain, accessToken, {
      search,
      childrenOf,
      first: 50,
    });
    return this.taxonomyLocalization.localizeCategories(categories);
  }

  async fetchProductCategory(
    tenantId: string,
    shopifyProductId: string,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    const category = await this.shopifyGraphql.getProductTaxonomyCategory(
      shopDomain,
      accessToken,
      shopifyProductId,
    );
    return this.taxonomyLocalization.localizeCategory(category);
  }

  async pushProductCategory(
    tenantId: string,
    shopifyProductId: string,
    categoryGid: string | null,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    const category = await this.shopifyGraphql.updateProductTaxonomyCategory(
      shopDomain,
      accessToken,
      shopifyProductId,
      categoryGid,
    );
    return this.taxonomyLocalization.localizeCategory(category);
  }

  async getCategoryAttributes(
    tenantId: string,
    categoryGid: string,
  ): Promise<readonly ShopifyTaxonomyCategoryAttribute[]> {
    const { shopDomain, accessToken } = await this.requireConnectedShop(tenantId);
    const attributes = await this.shopifyGraphql.getCategoryAttributes(
      shopDomain,
      accessToken,
      categoryGid,
    );
    return this.taxonomyLocalization.localizeCategoryAttributes(attributes);
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
