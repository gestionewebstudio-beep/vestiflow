import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_FINANCIAL_VALUES,
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../sales-order.enum-mapper';

const SOURCE_VALUES = [API_SOURCE_ONLINE, API_SOURCE_POS] as const;

export class ListSalesOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([...API_FINANCIAL_VALUES])
  financialStatus?: string;

  @IsOptional()
  @IsIn([...SOURCE_VALUES])
  source?: string;
}
