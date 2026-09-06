import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { DocumentType } from '@prisma/client';

/** Query dei contatori disponibili in testata per (tipo, sede). */
export class AvailableCountersQueryDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  /** Sede selezionata; assente = si vedono solo i contatori senza sede. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /**
   * Data del documento in testata. **Il numero proposto dipende da lei** (§2):
   * è il primo libero dopo i documenti di data ANTERIORE.
   *
   * Senza, il server calcola su oggi — e la testata mostrerebbe un numero che
   * il salvataggio non userà. Misurato il 13/08/2026: tendina 5, salvataggio
   * con data 01/08 → 2. È la divergenza fra numero visto e numero assegnato
   * che il §0 dichiara inaccettabile su un documento fiscale.
   */
  @IsOptional()
  @IsISO8601()
  documentDate?: string;
}
