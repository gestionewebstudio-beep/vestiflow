import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * I comandi della PRIMA CONNESSIONE (`docs/27`): la direzione, una scelta per
 * location, il passo indietro. Le fasi senza corpo (anteprima, conferma,
 * attivazione) non hanno un DTO.
 */

export const SHOPIFY_SETUP_DIRECTIONS = ['shopify_to_vestiflow', 'vestiflow_to_shopify'] as const;
export type ShopifySetupDirectionInput = (typeof SHOPIFY_SETUP_DIRECTIONS)[number];

export class ShopifySetupDirectionDto {
  @IsIn(SHOPIFY_SETUP_DIRECTIONS)
  direction!: ShopifySetupDirectionInput;
}

export const SHOPIFY_LOCATION_CHOICES = ['collega', 'crea', 'lascia'] as const;
export type ShopifyLocationChoiceInput = (typeof SHOPIFY_LOCATION_CHOICES)[number];

/**
 * Una scelta su UNA location Shopify. ⛔ `locationId` solo con «collega» e
 * obbligatorio lì; `name` solo con «crea», facoltativo (vale il nome remoto).
 */
export class ShopifySetupLocationChoiceDto {
  @IsIn(SHOPIFY_LOCATION_CHOICES)
  choice!: ShopifyLocationChoiceInput;

  @ValidateIf((dto: ShopifySetupLocationChoiceDto) => dto.choice === 'collega')
  @IsUUID()
  locationId?: string;

  @ValidateIf((dto: ShopifySetupLocationChoiceDto) => dto.choice === 'crea')
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export const SHOPIFY_SETUP_BACK_TARGETS = ['scelte', 'sedi'] as const;
export type ShopifySetupBackTarget = (typeof SHOPIFY_SETUP_BACK_TARGETS)[number];

export class ShopifySetupBackDto {
  @IsIn(SHOPIFY_SETUP_BACK_TARGETS)
  fase!: ShopifySetupBackTarget;
}
