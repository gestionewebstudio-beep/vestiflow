import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { ProductMediaService } from './product-media.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [ShopifyModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductMediaService],
})
export class ProductsModule {}
