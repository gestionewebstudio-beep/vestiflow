import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ShopifyCategoryMetafieldValueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  id!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

export class ShopifyCategoryMetafieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  attributeId!: string;

  @IsString()
  @MaxLength(200)
  attributeName!: string;

  @IsString()
  @MaxLength(100)
  namespace!: string;

  @IsString()
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(200)
  metafieldType!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ShopifyCategoryMetafieldValueDto)
  values!: ShopifyCategoryMetafieldValueDto[];
}
