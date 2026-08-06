import { Module } from '@nestjs/common';

import { FiscalDevicesController } from './fiscal-devices.controller';
import { FiscalDevicesService } from './fiscal-devices.service';

@Module({
  controllers: [FiscalDevicesController],
  providers: [FiscalDevicesService],
  exports: [FiscalDevicesService],
})
export class FiscalDevicesModule {}
