import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { LocationLicensingModule } from './location-licensing.module';
import { InventoryCountService } from './inventory-count.service';
import { InventoryController } from './inventory.controller';
import { InventoryExportService } from './inventory-export.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryReportService } from './inventory-report.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ChannelsModule, DocumentsModule, LocationLicensingModule, OrderReservationsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryCountService,
    InventoryExportService,
    InventoryImportService,
    InventoryReportService,
  ],
  exports: [LocationLicensingModule],
})
export class InventoryModule {}
