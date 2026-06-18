import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller';
import { CustomersExportService } from './customers-export.service';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersExportService],
})
export class CustomersModule {}
