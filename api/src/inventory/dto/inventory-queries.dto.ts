import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListInventoryLevelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Ricerca su SKU, barcode o nome prodotto. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowStockOnly?: boolean;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
