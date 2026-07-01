import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { API_FISCAL_STATUS_VALUES } from '../corrispettivi-fiscal.enum-mapper';

export class UpdateFiscalStatusDto {
  @IsIn([...API_FISCAL_STATUS_VALUES])
  fiscalStatus!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fiscalNote?: string;
}
