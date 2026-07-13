import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class CreateGoodsReceiptCausalDto {
  @IsString()
  @Length(1, 200)
  label!: string;

  /** Tipo documento fornitore associato (null = nessuno). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  externalDocumentTypeId?: string | null;

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
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  externalDocumentTypeId?: string | null;

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
