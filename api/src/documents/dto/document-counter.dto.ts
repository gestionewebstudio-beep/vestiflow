import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

/**
 * Creazione contatore. Identità = tipo + serie (unica per tipo). La serie è
 * opzionale: assente/null/vuota = «senza serie». La sede è un attributo di
 * disponibilità. isDefault marca il contatore proposto in testata.
 */
export class CreateDocumentCounterDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  /** null / assente / vuota = senza serie. */
  @IsOptional()
  @ValidateIf((dto: CreateDocumentCounterDto) => dto.series !== null)
  @IsString()
  @MaxLength(20)
  series?: string | null;

  /** null/assente = disponibile per tutte le sedi. */
  @IsOptional()
  @ValidateIf((dto: CreateDocumentCounterDto) => dto.locationId !== null)
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Modifica contatore: qualunque campo dell'identità/attributi può cambiare. */
export class UpdateDocumentCounterDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @ValidateIf((dto: UpdateDocumentCounterDto) => dto.series !== null)
  @IsString()
  @MaxLength(20)
  series?: string | null;

  @IsOptional()
  @ValidateIf((dto: UpdateDocumentCounterDto) => dto.locationId !== null)
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
