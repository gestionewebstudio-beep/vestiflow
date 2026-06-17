import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { InventoryCountService } from './inventory-count.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ShopifyModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryCountService],
})
export class InventoryModule {}
