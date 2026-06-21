import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { InventoryCountService } from './inventory-count.service';
import { InventoryController } from './inventory.controller';
import { InventoryExportService } from './inventory-export.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ChannelsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryCountService,
    InventoryExportService,
    InventoryImportService,
  ],
})
export class InventoryModule {}
