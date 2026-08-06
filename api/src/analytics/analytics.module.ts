import { Module } from '@nestjs/common';

import { BusinessAnalyticsController } from './business-analytics.controller';
import { BusinessAnalyticsService } from './business-analytics.service';

@Module({
  controllers: [BusinessAnalyticsController],
  providers: [BusinessAnalyticsService],
  exports: [BusinessAnalyticsService],
})
export class AnalyticsModule {}
