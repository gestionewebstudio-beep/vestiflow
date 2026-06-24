import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProductStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListProductsQueryDto extends PaginationQueryDto {
  /** Ricerca libera su nome, brand e SKU variante. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  season?: string;

  /** Include varianti (e immagini) nel payload: default false per la lista catalogo. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeVariants?: boolean;
}
