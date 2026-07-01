import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import {
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../../sales-orders/sales-order.enum-mapper';

const SOURCE_VALUES = [API_SOURCE_ONLINE, API_SOURCE_POS] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MarkCorrispettiviDeliveredDto {
  @Matches(ISO_DATE)
  placedFrom!: string;

  @Matches(ISO_DATE)
  placedTo!: string;

  @IsOptional()
  @IsIn([...SOURCE_VALUES, 'all'])
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
