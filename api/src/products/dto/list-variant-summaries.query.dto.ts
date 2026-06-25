import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListVariantSummariesQueryDto extends PaginationQueryDto {
  /** Ricerca su SKU, barcode o nome prodotto. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;
}
