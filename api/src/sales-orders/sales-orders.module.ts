import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { ManualSalesOrdersService } from './manual-sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersExportService } from './sales-orders-export.service';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [ChannelsModule, DocumentsModule, OrderReservationsModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesOrdersExportService, ManualSalesOrdersService],
})
export class SalesOrdersModule {}
