import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BeginShopifyAuthDto {
  /** Dominio shop (es. `mio-negozio` o `mio-negozio.myshopify.com`). */
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  @Matches(/^[a-z0-9][a-z0-9-]*(\.myshopify\.com)?$/i, {
    message: 'Dominio shop non valido',
  })
  shop!: string;
}
