import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { normalizeShopInput } from '../shopify-shop.util';

export class PurgeShopifyDataDto {
  /** Dominio del negozio attuale (conferma esplicita). */
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeShopInput(value) : value))
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, {
    message: 'Dominio shop non valido',
  })
  confirmShopDomain!: string;

  @IsBoolean()
  purgeCatalog!: boolean;

  @IsBoolean()
  purgeCustomers!: boolean;

  @IsBoolean()
  purgeOrders!: boolean;
}
