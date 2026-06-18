import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { InventoryCountService } from './inventory-count.service';
import { InventoryController } from './inventory.controller';
import { InventoryExportService } from './inventory-export.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ShopifyModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryCountService,
    InventoryExportService,
    InventoryImportService,
  ],
})
export class InventoryModule {}
