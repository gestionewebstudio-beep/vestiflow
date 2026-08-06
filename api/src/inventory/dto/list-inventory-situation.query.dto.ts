import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Stato scorte calcolato su disponibile vs soglia minima aggregati. */
export const INVENTORY_STOCK_STATUSES = ['ok', 'low', 'empty'] as const;
export type InventoryStockStatus = (typeof INVENTORY_STOCK_STATUSES)[number];

export class ListInventorySituationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** Categoria prodotto (product.category, valore esatto dai facets). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsIn(INVENTORY_STOCK_STATUSES)
  stockStatus?: InventoryStockStatus;

  /** Ricerca su SKU, barcode, nome prodotto o codice articolo. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
