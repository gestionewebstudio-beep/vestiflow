import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CATALOG_SECTION_PERMISSIONS,
  SHOPIFY_CATALOG_SYNC_PERMISSIONS,
  SHOPIFY_INVENTORY_SYNC_PERMISSIONS,
  SHOPIFY_OPERATIONAL_SYNC_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
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
import { LocationLicensingService } from '../inventory/location-licensing.service';
import { ShopifyShopChangeService } from './shopify-shop-change.service';
import type {
  ShopifyShopChangePreview,
  ShopifyShopChangePurgeResult,
} from './shopify-shop-change.service';

@Controller('shopify')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
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
    private readonly locationLicensing: LocationLicensingService,
  ) {}

  @Get('connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  getConnection(@CurrentTenant() tenantId: string): Promise<ShopifyConnectionDto> {
    return this.shopifyConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.shopifyOAuth.disconnect(tenantId);
    return { disconnected: true };
  }

  @Get('shop-change/preview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  previewShopChange(@CurrentTenant() tenantId: string): Promise<ShopifyShopChangePreview> {
    return this.shopifyShopChange.preview(tenantId);
  }

  @Post('shop-change/purge')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  purgeShopifyData(
    @CurrentTenant() tenantId: string,
    @Body() dto: PurgeShopifyDataDto,
  ): Promise<ShopifyShopChangePurgeResult> {
    return this.shopifyShopChange.purge(tenantId, dto);
  }

  @Post('sync/locations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async syncLocations(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncLocations(tenantId);
    const autoLicensed = await this.locationLicensing.tryAutoLicenseSingleShopifyLocation(tenantId);
    return { synced: true as const, autoLicensed, ...result };
  }

  @Post('sync/webhooks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async syncWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncWebhooks(tenantId);
    return { synced: true as const, ...result };
  }

  @Post('sync/webhooks/disable')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async disableWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.disableWebhooks(tenantId);
    return { disabled: true as const, ...result };
  }

  @Post('sync/products')
  @RequireAnyPermissions(SHOPIFY_CATALOG_SYNC_PERMISSIONS)
  async syncProducts(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCatalogSyncResult> {
    const result = await this.shopifyProductPull.pullCatalog(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/inventory')
  @RequireAnyPermissions(SHOPIFY_INVENTORY_SYNC_PERMISSIONS)
  async syncInventory(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyInventoryPullResult> {
    const result = await this.shopifyInventoryPull.pullInventory(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/customers')
  @RequireAnyPermissions(SHOPIFY_OPERATIONAL_SYNC_PERMISSIONS)
  async syncCustomers(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCustomersPullResult> {
    const result = await this.shopifyCustomersPull.pullCustomers(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/orders')
  @RequireAnyPermissions(SHOPIFY_OPERATIONAL_SYNC_PERMISSIONS)
  async syncOrders(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyOrdersPullResult> {
    const result = await this.shopifyOrdersPull.pullOrders(tenantId);
    return { synced: true, ...result };
  }

  @Post('connection/clear-errors')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async clearErrors(@CurrentTenant() tenantId: string): Promise<ClearShopifyErrorsResult> {
    return this.shopifyConnection.clearErrors(tenantId);
  }

  @Get('taxonomy/categories')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
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
  @RequirePermissions(TenantPermission.CatalogManage)
  async listCategoryAttributes(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCategoryAttributesQueryDto,
  ) {
    const items = await this.shopifyTaxonomy.getCategoryAttributes(tenantId, query.categoryId);
    return { items };
  }
}
