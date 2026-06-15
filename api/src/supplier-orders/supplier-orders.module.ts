import { Module } from '@nestjs/common';

import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  controllers: [SupplierOrdersController, SuppliersController],
  providers: [SupplierOrdersService],
})
export class SupplierOrdersModule {}
