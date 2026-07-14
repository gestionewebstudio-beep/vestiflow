import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { VariantOptionValueDto } from './create-product.dto';

/**
 * Payload per l'anteprima "Genera SKU" (POST products/sku/generate). Non
 * salva nulla: calcola solo il codice proposto (vedi SkuGeneratorService).
 */
export class GenerateSkuDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  productName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** Codice modello esplicito, se disponibile (altrimenti si deriva dal nome). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelCode?: string;

  /** Attributi REALMENTE presenti sulla variante (colore, taglia, o altro). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VariantOptionValueDto)
  optionValues?: VariantOptionValueDto[];
}
