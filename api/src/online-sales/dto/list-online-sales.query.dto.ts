import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../../sales-orders/sales-order.enum-mapper';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListOnlineSalesQueryDto extends PaginationQueryDto {
  /** Ricerca su riferimento, numero ordine, cliente, id ordine esterno. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([API_SOURCE_ONLINE, API_SOURCE_POS])
  channel?: string;

  /** Filtro su data evasione (inclusivo). */
  @IsOptional()
  @Matches(ISO_DATE)
  fulfilledFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  fulfilledTo?: string;
}
