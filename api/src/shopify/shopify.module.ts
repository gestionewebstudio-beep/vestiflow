import { Module } from '@nestjs/common';

import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import { ShopifyProductPushService } from './shopify-product-push.service';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifyOrderDocumentService } from './shopify-order-document.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';
import { ShopifyShopChangeService } from './shopify-shop-change.service';

@Module({
  imports: [LocationLicensingModule, OrderReservationsModule],
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
    ShopifyInventoryReconciliationService,
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyProductEnrichmentService,
    ShopifyTaxonomyService,
    ShopifyTaxonomyLocalizationService,
    ShopifyCategoryMetafieldsService,
    ShopifySyncService,
    ShopifyOrderDocumentService,
    ShopifyWebhookService,
    ShopifyShopChangeService,
  ],
  exports: [
    ShopifyConnectionService,
    ShopifyInventoryPushService,
    ShopifyInventoryReconciliationService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyTaxonomyLocalizationService,
  ],
})
export class ShopifyModule {}
