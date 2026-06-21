import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  imports: [ChannelsModule],
  controllers: [SupplierOrdersController, SuppliersController],
  providers: [SupplierOrdersService],
})
export class SupplierOrdersModule {}
