import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  imports: [ShopifyModule],
  controllers: [SupplierOrdersController, SuppliersController],
  providers: [SupplierOrdersService],
})
export class SupplierOrdersModule {}
