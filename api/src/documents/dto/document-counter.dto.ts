import { IsEnum, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { DocumentType } from '@prisma/client';

/**
 * Creazione contatore: tipo + serie identificano la numerazione, la location è
 * opzionale (assente/null = contatore globale, valido per tutte le sedi).
 */
export class CreateDocumentCounterDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsString()
  @Length(1, 20)
  series!: string;

  /** null/assente = globale. UUID = numerazione separata per quella sede. */
  @IsOptional()
  @ValidateIf((dto: CreateDocumentCounterDto) => dto.locationId !== null)
  @IsUUID()
  locationId?: string | null;
}

/**
 * Modifica contatore: qualunque campo dell'identità (tipo, serie, location) può
 * cambiare — equivale a spostare la numerazione. L'avviso «N documenti la usano»
 * è gestito dal frontend prima di inviare.
 */
export class UpdateDocumentCounterDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  series?: string;

  @IsOptional()
  @ValidateIf((dto: UpdateDocumentCounterDto) => dto.locationId !== null)
  @IsUUID()
  locationId?: string | null;
}
