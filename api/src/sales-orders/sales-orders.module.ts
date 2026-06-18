import { Module } from '@nestjs/common';

import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersExportService } from './sales-orders-export.service';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesOrdersExportService],
})
export class SalesOrdersModule {}
