import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateGoodsReceiptCausalDto {
  @IsString()
  @Length(1, 200)
  label!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGoodsReceiptCausalDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderGoodsReceiptCausalsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(200)
  orderedIds!: string[];
}
