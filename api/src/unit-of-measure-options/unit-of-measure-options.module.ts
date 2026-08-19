import { Module } from '@nestjs/common';

import { UnitOfMeasureOptionsController } from './unit-of-measure-options.controller';
import { UnitOfMeasureOptionsService } from './unit-of-measure-options.service';

@Module({
  controllers: [UnitOfMeasureOptionsController],
  providers: [UnitOfMeasureOptionsService],
  exports: [UnitOfMeasureOptionsService],
})
export class UnitOfMeasureOptionsModule {}
