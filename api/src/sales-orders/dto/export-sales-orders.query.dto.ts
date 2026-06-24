import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import {
  API_FINANCIAL_VALUES,
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../sales-order.enum-mapper';

const SOURCE_VALUES = [API_SOURCE_ONLINE, API_SOURCE_POS] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtri export vendite (stessi filtri lista, senza paginazione). */
export class ExportSalesOrdersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn([...API_FINANCIAL_VALUES])
  financialStatus?: string;

  @IsOptional()
  @IsIn([...SOURCE_VALUES])
  source?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  placedFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  placedTo?: string;
}
