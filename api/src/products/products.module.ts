import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { ProductMediaService } from './product-media.service';
import { ProductsController } from './products.controller';
import { ProductsImportService } from './products-import.service';
import { ProductsService } from './products.service';

@Module({
  imports: [ShopifyModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductMediaService, ProductsImportService],
})
export class ProductsModule {}
