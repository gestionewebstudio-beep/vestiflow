import { DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class PreviewDocumentNumberQueryDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional()
  @IsString()
  series?: string;

  /**
   * Sede del documento (§1-bis). Senza serie esplicita è lei a decidere quale
   * contatore predefinito si applica: un'anteprima che la ignora mostrerebbe
   * una serie diversa da quella che il salvataggio assegnerà.
   */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
