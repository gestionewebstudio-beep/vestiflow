import { Module } from '@nestjs/common';

import { CorrispettiviController } from './corrispettivi.controller';
import { CorrispettiviExportService } from './corrispettivi-export.service';
import { CorrispettiviService } from './corrispettivi.service';

@Module({
  controllers: [CorrispettiviController],
  providers: [CorrispettiviService, CorrispettiviExportService],
  exports: [CorrispettiviService, CorrispettiviExportService],
})
export class CorrispettiviModule {}
