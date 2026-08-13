import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Controllo cronologico di un contatore (specifica numerazione §4). La coppia
 * (tipo, serie) È il contatore: l'anomalia è un fatto della serie, non del
 * singolo documento.
 */
export class ChronologyCheckQueryDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  /**
   * Serie del contatore. **Assente e stringa vuota non sono la stessa cosa**:
   * la stringa vuota è la serie «Senza serie», che è un contatore vero con un
   * suo progressivo. Assente vuol dire «non l'ho detto», e vale come senza
   * serie perché è l'unico contatore che esiste sempre.
   */
  @IsOptional()
  @IsString()
  series?: string;
}
