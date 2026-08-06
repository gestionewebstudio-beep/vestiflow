import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DocumentType } from '@prisma/client';

/** Query dei contatori disponibili in testata per (tipo, sede). */
export class AvailableCountersQueryDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  /** Sede selezionata; assente = si vedono solo i contatori senza sede. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
