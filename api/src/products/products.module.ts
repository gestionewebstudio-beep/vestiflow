import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { SupplierOrdersModule } from '../supplier-orders/supplier-orders.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { ProductMediaService } from './product-media.service';
import { ProductsController } from './products.controller';
import { ProductsExportService } from './products-export.service';
import { ProductsImportService } from './products-import.service';
import { ProductsService } from './products.service';
import { SkuGeneratorService } from './sku-generator.service';

@Module({
  imports: [ChannelsModule, ShopifyModule, SupplierOrdersModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductMediaService,
    ProductsImportService,
    ProductsExportService,
    SkuGeneratorService,
  ],
})
export class ProductsModule {}
