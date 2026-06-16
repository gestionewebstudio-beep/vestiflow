import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ShopifyModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
