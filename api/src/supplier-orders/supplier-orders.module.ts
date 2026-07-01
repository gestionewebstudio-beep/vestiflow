import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { SupplierMediaService } from './supplier-media.service';
import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [ChannelsModule, DocumentsModule],
  controllers: [SupplierOrdersController, SuppliersController],
  providers: [SupplierOrdersService, SuppliersService, SupplierMediaService],
  exports: [SuppliersService],
})
export class SupplierOrdersModule {}
