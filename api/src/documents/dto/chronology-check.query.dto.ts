import { DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Controllo cronologico del documento **che si sta salvando** (specifica
 * numerazione §4). La coppia (tipo, serie) è il contatore; la coppia (numero,
 * data) è ciò che l'operatore ha in testata, ed è quella che si verifica.
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

  /**
   * Numero che il documento sta per prendere: quello mostrato in testata,
   * proposto o digitato. Obbligatorio — senza, non c'è niente da controllare, e
   * la maschera che non ne ha uno semplicemente non chiama.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number!: number;

  /** Data in testata: l'altra metà della coppia da verificare. */
  @IsISO8601()
  documentDate!: string;

  /**
   * Il documento stesso, quando è una modifica: senza escluderlo, cambiargli il
   * numero lo farebbe risultare in conflitto con la propria riga vecchia.
   */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
