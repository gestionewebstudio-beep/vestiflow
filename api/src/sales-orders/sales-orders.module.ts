import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { ManualSalesOrdersService } from './manual-sales-orders.service';
import { SalesOrderPdfService } from './sales-order-pdf.service';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersExportService } from './sales-orders-export.service';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [AttachmentsModule, ChannelsModule, DocumentsModule, OrderReservationsModule],
  controllers: [SalesOrdersController],
  providers: [
    SalesOrdersService,
    SalesOrdersExportService,
    ManualSalesOrdersService,
    SalesOrderPdfService,
  ],
})
export class SalesOrdersModule {}
