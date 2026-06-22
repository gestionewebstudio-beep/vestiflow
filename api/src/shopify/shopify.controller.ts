import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ADMIN_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { BeginShopifyAuthDto } from './dto/begin-shopify-auth.dto';
import type { ShopifyConnectionDto } from './shopify-config.service';
import { ShopifyConfigService } from './shopify-config.service';
import type { ClearShopifyErrorsResult } from './shopify-connection.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import type { ShopifyInventoryPullResult } from './shopify-inventory-pull.service';
import { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import type { ShopifyCustomersPullResult } from './shopify-customers-pull.service';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import type { ShopifyOrdersPullResult } from './shopify-orders-pull.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import type { ShopifyCatalogSyncResult } from './shopify-product-pull.service';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ListTaxonomyCategoriesQueryDto } from './dto/list-taxonomy-categories.query.dto';
import { ListCategoryAttributesQueryDto } from './dto/list-category-attributes.query.dto';
import { PurgeShopifyDataDto } from './dto/purge-shopify-data.dto';
import { ShopifyShopChangeService } from './shopify-shop-change.service';
import type {
  ShopifyShopChangePreview,
  ShopifyShopChangePurgeResult,
} from './shopify-shop-change.service';

@Controller('shopify')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopifyController {
  constructor(
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyProductPull: ShopifyProductPullService,
    private readonly shopifyInventoryPull: ShopifyInventoryPullService,
    private readonly shopifyCustomersPull: ShopifyCustomersPullService,
    private readonly shopifyOrdersPull: ShopifyOrdersPullService,
    private readonly shopifyTaxonomy: ShopifyTaxonomyService,
    private readonly shopifyShopChange: ShopifyShopChangeService,
  ) {}

  @Get('connection')
  getConnection(@CurrentTenant() tenantId: string): Promise<ShopifyConnectionDto> {
    return this.shopifyConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  @Roles(...ADMIN_ROLES)
  beginAuth(
    @CurrentTenant() tenantId: string,
    @Body() dto: BeginShopifyAuthDto,
  ): Promise<{ authorizeUrl: string }> {
    return this.shopifyOAuth.beginAuth(tenantId, dto.shop);
  }

  @Public()
  @Get('auth/callback')
  async authCallback(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const redirectUrl = await this.shopifyOAuth.handleCallback(query);
      response.redirect(redirectUrl);
    } catch {
      response.redirect(`${this.shopifyConfig.frontendUrl}/app/settings?shopify=error`);
    }
  }

  @Delete('connection')
  @Roles(...ADMIN_ROLES)
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.shopifyOAuth.disconnect(tenantId);
    return { disconnected: true };
  }

  @Get('shop-change/preview')
  @Roles(...ADMIN_ROLES)
  previewShopChange(@CurrentTenant() tenantId: string): Promise<ShopifyShopChangePreview> {
    return this.shopifyShopChange.preview(tenantId);
  }

  @Post('shop-change/purge')
  @Roles(...ADMIN_ROLES)
  purgeShopifyData(
    @CurrentTenant() tenantId: string,
    @Body() dto: PurgeShopifyDataDto,
  ): Promise<ShopifyShopChangePurgeResult> {
    return this.shopifyShopChange.purge(tenantId, dto);
  }

  @Post('sync/locations')
  @Roles(...ADMIN_ROLES)
  async syncLocations(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncLocations(tenantId);
    return { synced: true as const, ...result };
  }

  @Post('sync/webhooks')
  @Roles(...ADMIN_ROLES)
  async syncWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncWebhooks(tenantId);
    return { synced: true as const, ...result };
  }

  @Post('sync/webhooks/disable')
  @Roles(...ADMIN_ROLES)
  async disableWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.disableWebhooks(tenantId);
    return { disabled: true as const, ...result };
  }

  @Post('sync/products')
  @Roles(...ADMIN_ROLES)
  async syncProducts(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCatalogSyncResult> {
    const result = await this.shopifyProductPull.pullCatalog(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/inventory')
  @Roles(...ADMIN_ROLES)
  async syncInventory(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyInventoryPullResult> {
    const result = await this.shopifyInventoryPull.pullInventory(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/customers')
  @Roles(...ADMIN_ROLES)
  async syncCustomers(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCustomersPullResult> {
    const result = await this.shopifyCustomersPull.pullCustomers(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/orders')
  @Roles(...ADMIN_ROLES)
  async syncOrders(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyOrdersPullResult> {
    const result = await this.shopifyOrdersPull.pullOrders(tenantId);
    return { synced: true, ...result };
  }

  @Post('connection/clear-errors')
  @Roles(...ADMIN_ROLES)
  async clearErrors(@CurrentTenant() tenantId: string): Promise<ClearShopifyErrorsResult> {
    return this.shopifyConnection.clearErrors(tenantId);
  }

  @Get('taxonomy/categories')
  async listTaxonomyCategories(
    @CurrentTenant() tenantId: string,
    @Query() query: ListTaxonomyCategoriesQueryDto,
  ) {
    const items = await this.shopifyTaxonomy.listCategories(
      tenantId,
      query.search,
      query.childrenOf,
    );
    return { items };
  }

  @Get('taxonomy/category-attributes')
  async listCategoryAttributes(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCategoryAttributesQueryDto,
  ) {
    const items = await this.shopifyTaxonomy.getCategoryAttributes(tenantId, query.categoryId);
    return { items };
  }
}
