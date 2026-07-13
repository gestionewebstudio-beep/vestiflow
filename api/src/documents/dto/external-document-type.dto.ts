import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateExternalDocumentTypeDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  shortLabel?: string;

  /** Modello causale con segnaposto {numero} e {data}. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  causalTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExternalDocumentTypeDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  shortLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  causalTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderExternalDocumentTypesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(200)
  orderedIds!: string[];
}
