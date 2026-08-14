import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_FINANCIAL_VALUES,
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../../sales-orders/sales-order.enum-mapper';
import { API_FISCAL_STATUS_VALUES } from '../corrispettivi-fiscal.enum-mapper';

const SOURCE_VALUES = [API_SOURCE_ONLINE, API_SOURCE_POS] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tipi di riga selezionabili nel registro. `all` è il default implicito. */
export const ROW_TYPE_VALUES = ['all', 'sales', 'returns', 'refunds'] as const;
export type CorrispettiviRowTypeFilter = (typeof ROW_TYPE_VALUES)[number];

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

export class ListCorrispettiviQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  declare pageSize: number;
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([...API_FINANCIAL_VALUES])
  financialStatus?: string;

  @IsOptional()
  @IsIn([...SOURCE_VALUES])
  source?: string;

  @IsOptional()
  @IsIn([...API_FISCAL_STATUS_VALUES])
  fiscalStatus?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  placedFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  placedTo?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  onlineOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  posOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  pendingDeliveryOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  refundsOnly?: boolean;

  /**
   * Che righe mostrare nell'elenco: tutte, le sole vendite, i soli resi, i soli
   * rimborsi senza rientro.
   *
   * ⚠️ **Filtra l'ELENCO, non il riepilogo.** Scegliendo «Resi» il totale del
   * periodo continua a dire quanto è il corrispettivo: mostrare −205,00 perché
   * si stanno guardando i resi darebbe un numero che non significa niente e che
   * qualcuno prima o poi trascriverebbe.
   */
  @IsOptional()
  @IsIn([...ROW_TYPE_VALUES])
  rowType?: string;
}
