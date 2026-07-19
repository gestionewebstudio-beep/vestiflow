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

  /** Tutte le varianti di un prodotto (deep-link Registra movimento). */
  @IsOptional()
  @IsUUID()
  productId?: string;

  /** Filtra per fornitore collegato (codice/prezzo fornitore). */
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** Giacenza nella location per anteprima autocomplete. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
