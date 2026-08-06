import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

import { ReportPeriodPreset } from '../report-period.util';

const PERIOD_VALUES = Object.values(ReportPeriodPreset);

export class BusinessAnalyticsQueryDto {
  @IsOptional()
  @IsIn(PERIOD_VALUES)
  period?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}
