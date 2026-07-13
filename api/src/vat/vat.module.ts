import { Module } from '@nestjs/common';

import { VatCodesController } from './vat-codes.controller';
import { VatCodesService } from './vat-codes.service';

@Module({
  controllers: [VatCodesController],
  providers: [VatCodesService],
  exports: [VatCodesService],
})
export class VatModule {}
