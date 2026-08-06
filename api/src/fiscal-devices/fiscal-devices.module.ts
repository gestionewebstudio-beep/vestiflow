import { Module } from '@nestjs/common';

import { FiscalDevicesController } from './fiscal-devices.controller';
import { FiscalDevicesService } from './fiscal-devices.service';
import { FiscalReceiptsController } from './fiscal-receipts.controller';
import { FiscalReceiptsService } from './fiscal-receipts.service';

@Module({
  controllers: [FiscalDevicesController, FiscalReceiptsController],
  providers: [FiscalDevicesService, FiscalReceiptsService],
  exports: [FiscalDevicesService, FiscalReceiptsService],
})
export class FiscalDevicesModule {}
