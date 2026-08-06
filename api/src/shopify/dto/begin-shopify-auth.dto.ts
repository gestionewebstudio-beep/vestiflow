import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { normalizeShopInput } from '../shopify-shop.util';

export class BeginShopifyAuthDto {
  /** Dominio shop (es. `mio-negozio` o `mio-negozio.myshopify.com`). */
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeShopInput(value) : value))
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, {
    message: 'Dominio shop non valido',
  })
  shop!: string;
}
