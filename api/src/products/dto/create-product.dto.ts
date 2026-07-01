import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InventoryTrackingMode, ProductStatus } from '@prisma/client';

import { MoneyDto } from './money.dto';
import { ShopifyCategoryMetafieldDto } from './shopify-category-metafield.dto';

/** Asse opzione (es. Taglia → S/M/L). Max 3 assi: vincolo Shopify. */
export class ProductOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  values!: string[];
}

/** Valore opzione selezionato dalla variante (forma Shopify selectedOptions). */
export class VariantOptionValueDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  value!: string;
}

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VariantOptionValueDto)
  optionValues!: VariantOptionValueDto[];

  @ValidateNested()
  @Type(() => MoneyDto)
  sellingPrice!: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  purchasePrice?: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  compareAtPrice?: MoneyDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

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

  /** GID Shopify Standard Product Taxonomy (gid://shopify/TaxonomyCategory/...). */
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

  /** Categoria TikTok Shop (id Partner API) per sync catalogo. */
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

  @IsEnum(ProductStatus)
  status: ProductStatus = ProductStatus.draft;

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

  @IsOptional()
  @IsEnum(InventoryTrackingMode)
  inventoryTracking?: InventoryTrackingMode;

  @IsOptional()
  @IsBoolean()
  managesStock?: boolean;

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options: ProductOptionDto[] = [];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}
