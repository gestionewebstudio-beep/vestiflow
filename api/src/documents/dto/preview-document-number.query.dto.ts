import { DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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

  /**
   * Data del documento (§2): il numero proposto è il primo libero sopra i
   * documenti di data anteriore, quindi cambia con lei. Facoltativa perché
   * l'anteprima serve anche dove una data non c'è — la scheda Numeratori — e lì
   * «primo libero a oggi» è la risposta giusta.
   */
  @IsOptional()
  @IsISO8601()
  documentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
