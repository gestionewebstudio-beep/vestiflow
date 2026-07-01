import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const INVENTORY_STOCK_STATUS = ['ok', 'low', 'empty'] as const;
export type InventoryStockStatusFilter = (typeof INVENTORY_STOCK_STATUS)[number];

export class ExportInventoryLevelsQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Ricerca su SKU o nome prodotto. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(INVENTORY_STOCK_STATUS)
  stockStatus?: InventoryStockStatusFilter;

  /** Colonne export CSV (id separati da virgola); se assente, tutte le colonne. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  columns?: string;
}
