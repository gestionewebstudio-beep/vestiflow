import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_FINANCIAL_VALUES,
  API_FULFILLMENT_VALUES,
  API_SOURCE_MANUAL,
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
  API_SOURCE_SHOPIFY,
  API_STATE_VALUES,
} from '../sales-order.enum-mapper';

const SOURCE_VALUES = [
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
  API_SOURCE_MANUAL,
  API_SOURCE_SHOPIFY,
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListSalesOrdersQueryDto extends PaginationQueryDto {
  /** Fino a 500 righe per pagina (report e export client-side). */
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
  @IsIn([...API_FULFILLMENT_VALUES])
  fulfillmentStatus?: string;

  @IsOptional()
  @IsIn([...SOURCE_VALUES])
  source?: string;

  /** Stato derivato: open | concluded | cancelled (colonna Stato). */
  @IsOptional()
  @IsIn([...API_STATE_VALUES])
  state?: string;

  /**
   * Solo ordini includibili in un documento: manuali, non annullati e non
   * ancora collegati ad alcun documento. Usato dal pannello «Includi».
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  includable?: boolean;

  /** Solo ordini che sul canale non risultano più (cancellati su Shopify). */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  missingOnChannel?: boolean;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Data ordine inclusiva (YYYY-MM-DD). */
  @IsOptional()
  @Matches(ISO_DATE)
  placedFrom?: string;

  /** Data ordine inclusiva (YYYY-MM-DD). */
  @IsOptional()
  @Matches(ISO_DATE)
  placedTo?: string;

  /**
   * Ordinamento: `campo:asc` separati da virgola, in ordine di priorità.
   * La whitelist e la traduzione stanno in `parseSalesOrderSort`.
   */
  @IsOptional()
  @IsString()
  sort?: string;
}
