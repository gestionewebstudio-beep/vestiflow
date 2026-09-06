import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertSupplierVariantLinkDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierSku?: string;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @Type(() => Number)
  // ⚠️ NON `@IsInt()`: è un prezzo UNITARIO di acquisto, e la colonna è
  //   `Decimal(16,6)` — verificato sullo schema. Trovato il 26/08/2026 dalla
  //   guardia `check:dto-decimali`, al suo primo giro.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  lastPurchasePriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minOrderQuantity?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}
