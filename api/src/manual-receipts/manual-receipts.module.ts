import { Module } from '@nestjs/common';

import { ManualReceiptsController } from './manual-receipts.controller';
import { ManualReceiptsService } from './manual-receipts.service';

@Module({
  controllers: [ManualReceiptsController],
  providers: [ManualReceiptsService],
  exports: [ManualReceiptsService],
})
export class ManualReceiptsModule {}
