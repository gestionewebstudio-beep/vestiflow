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
import { MovementOrigin, StockMovementType } from '@prisma/client';

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
  @IsUUID()
  variantId?: string;

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

  /** Ricerca su SKU, barcode, nome prodotto o codice articolo. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Cliente o fornitore del documento origine del movimento. */
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsEnum(MovementOrigin)
  origin?: MovementOrigin;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
