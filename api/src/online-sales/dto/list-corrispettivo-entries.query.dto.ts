import { Transform, Type } from 'class-transformer';
import { CorrispettivoStatus } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../../sales-orders/sales-order.enum-mapper';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CORRISPETTIVO_STATUS_VALUES = Object.values(CorrispettivoStatus);

export class ListCorrispettivoEntriesQueryDto extends PaginationQueryDto {
  /** Ricerca su riferimento, numero ordine, riferimento vendita. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([API_SOURCE_ONLINE, API_SOURCE_POS])
  channel?: string;

  @IsOptional()
  @IsIn(CORRISPETTIVO_STATUS_VALUES)
  status?: CorrispettivoStatus;

  /** Filtro su data fiscale (inclusivo). */
  @IsOptional()
  @Matches(ISO_DATE)
  fiscalFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  fiscalTo?: string;

  /** Solo fatturati (true) o solo non fatturati (false), fase 3 §5. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  invoiceIssued?: boolean;

  /** Solo inclusi nel riepilogo (false) o solo esclusi (true), fase 3 §5. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludedFromSummary?: boolean;

  /** Solo voci con righe a questa aliquota IVA % (fase 3 §5). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;
}
