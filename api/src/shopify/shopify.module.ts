import { Module } from '@nestjs/common';

import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import { ShopifyProductPushService } from './shopify-product-push.service';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';
import { ShopifyShopChangeService } from './shopify-shop-change.service';

@Module({
  imports: [LocationLicensingModule],
  controllers: [ShopifyController, ShopifyWebhooksController],
  providers: [
    ShopifyConfigService,
    ShopifyCryptoService,
    ShopifyAdminClient,
    ShopifyGraphqlClient,
    ShopifyRateLimiterService,
    ShopifyConnectionService,
    ShopifyOAuthService,
    ShopifyLocationSyncService,
    ShopifyInventoryPullService,
    ShopifyCustomersPullService,
    ShopifyOrdersPullService,
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyProductEnrichmentService,
    ShopifyTaxonomyService,
    ShopifyTaxonomyLocalizationService,
    ShopifyCategoryMetafieldsService,
    ShopifySyncService,
    ShopifyWebhookService,
    ShopifyShopChangeService,
  ],
  exports: [
    ShopifyConnectionService,
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyTaxonomyLocalizationService,
  ],
})
export class ShopifyModule {}
