import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InventoryTrackingMode, ProductStatus } from '@prisma/client';

import { ProductOptionDto } from './create-product.dto';
import { ShopifyCategoryMetafieldDto } from './shopify-category-metafield.dto';
import { UpdateVariantDto } from './update-variant.dto';

/** Aggiornamento prodotto: dati generali + sync opzionale del set varianti. */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shopifyTaxonomyCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shopifyTaxonomyCategoryFullName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShopifyCategoryMetafieldDto)
  shopifyCategoryMetafields?: ShopifyCategoryMetafieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tiktokCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  season?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitOfMeasure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  defaultVatRatePercent?: number;

  /** Codice IVA ordinario dell'articolo (§8). Null = predefinito aziendale. */
  @IsOptional()
  @IsUUID()
  defaultVatCodeId?: string | null;

  @IsOptional()
  @IsEnum(InventoryTrackingMode)
  inventoryTracking?: InventoryTrackingMode;

  @IsOptional()
  @IsBoolean()
  managesStock?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options?: ProductOptionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
